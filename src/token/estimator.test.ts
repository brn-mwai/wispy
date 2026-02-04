/**
 * Token Estimator & Spending Limit Tests
 * Tests token budgeting, cost tracking, and spending limit enforcement
 */

import { describe, it, expect, beforeEach } from "vitest";

// Types matching the implementation
interface TokenBudget {
  maxTokensPerRequest: number;
  maxTokensPerSession: number;
  maxTokensPerDay: number;
  warnAtPercentage: number;
  maxCostPerSessionUsd: number;
  maxCostPerDayUsd: number;
  enforceHardLimits: boolean;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: string;
}

interface TokenEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  withinBudget: boolean;
  model: string;
}

// Spending limit error
class SpendingLimitError extends Error {
  public readonly currentCost: number;
  public readonly limit: number;
  public readonly limitType: "session" | "daily";

  constructor(currentCost: number, limit: number, limitType: "session" | "daily") {
    super(
      `Spending limit exceeded: $${currentCost.toFixed(2)} / $${limit.toFixed(2)} (${limitType})`
    );
    this.name = "SpendingLimitError";
    this.currentCost = currentCost;
    this.limit = limit;
    this.limitType = limitType;
  }
}

// Model pricing
const MODEL_SPECS: Record<string, { inputCostPer1M: number; outputCostPer1M: number }> = {
  "gemini-2.5-flash": { inputCostPer1M: 0.15, outputCostPer1M: 0.60 },
  "gemini-2.5-pro": { inputCostPer1M: 1.25, outputCostPer1M: 10.0 },
  "gemini-3-flash": { inputCostPer1M: 0.10, outputCostPer1M: 0.40 },
  "gemini-3-pro": { inputCostPer1M: 1.50, outputCostPer1M: 8.0 },
};

// Simplified TokenManager for testing
class TokenManager {
  private budget: TokenBudget;
  private sessionUsage: TokenUsage[] = [];
  private dailyUsage: TokenUsage[] = [];

  constructor(budget?: Partial<TokenBudget>) {
    this.budget = {
      maxTokensPerRequest: 100_000,
      maxTokensPerSession: 500_000,
      maxTokensPerDay: 2_000_000,
      warnAtPercentage: 80,
      maxCostPerSessionUsd: 5.0,
      maxCostPerDayUsd: 25.0,
      enforceHardLimits: true,
      ...budget,
    };
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4); // ~4 chars per token
  }

  estimateRequest(
    model: string,
    systemPrompt: string,
    messages: Array<{ content: string }>
  ): TokenEstimate {
    const spec = MODEL_SPECS[model] || MODEL_SPECS["gemini-2.5-flash"];

    let inputTokens = this.estimateTokens(systemPrompt);
    for (const msg of messages) {
      inputTokens += this.estimateTokens(msg.content) + 4;
    }

    const estimatedOutputTokens = Math.min(Math.ceil(inputTokens * 0.25), 8192);
    const totalTokens = inputTokens + estimatedOutputTokens;
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * spec.inputCostPer1M +
      (estimatedOutputTokens / 1_000_000) * spec.outputCostPer1M;

    const sessionTotal = this.getSessionTotal() + totalTokens;
    const dailyTotal = this.getDailyTotal() + totalTokens;

    const withinBudget =
      totalTokens <= this.budget.maxTokensPerRequest &&
      sessionTotal <= this.budget.maxTokensPerSession &&
      dailyTotal <= this.budget.maxTokensPerDay;

    return {
      inputTokens,
      estimatedOutputTokens,
      totalTokens,
      estimatedCostUsd,
      withinBudget,
      model,
    };
  }

  recordUsage(model: string, inputTokens: number, outputTokens: number): void {
    const spec = MODEL_SPECS[model] || MODEL_SPECS["gemini-2.5-flash"];
    const costUsd =
      (inputTokens / 1_000_000) * spec.inputCostPer1M +
      (outputTokens / 1_000_000) * spec.outputCostPer1M;

    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
      timestamp: new Date().toISOString(),
    };

    this.sessionUsage.push(usage);
    this.dailyUsage.push(usage);
  }

  getSessionTotal(): number {
    return this.sessionUsage.reduce((sum, u) => sum + u.totalTokens, 0);
  }

  getDailyTotal(): number {
    return this.dailyUsage.reduce((sum, u) => sum + u.totalTokens, 0);
  }

  getSessionCost(): number {
    return this.sessionUsage.reduce((sum, u) => sum + u.costUsd, 0);
  }

  getDailyCost(): number {
    return this.dailyUsage.reduce((sum, u) => sum + u.costUsd, 0);
  }

  checkSpendingLimits(estimatedCostUsd: number): {
    canProceed: boolean;
    warning?: string;
    sessionCost: number;
    dailyCost: number;
  } {
    const sessionCost = this.getSessionCost();
    const dailyCost = this.getDailyCost();

    const projectedSessionCost = sessionCost + estimatedCostUsd;
    const projectedDailyCost = dailyCost + estimatedCostUsd;

    // Check session limit
    if (projectedSessionCost > this.budget.maxCostPerSessionUsd) {
      if (this.budget.enforceHardLimits) {
        throw new SpendingLimitError(
          sessionCost,
          this.budget.maxCostPerSessionUsd,
          "session"
        );
      }
      return {
        canProceed: true,
        warning: `Session limit warning: $${sessionCost.toFixed(2)}`,
        sessionCost,
        dailyCost,
      };
    }

    // Check daily limit
    if (projectedDailyCost > this.budget.maxCostPerDayUsd) {
      if (this.budget.enforceHardLimits) {
        throw new SpendingLimitError(dailyCost, this.budget.maxCostPerDayUsd, "daily");
      }
      return {
        canProceed: true,
        warning: `Daily limit warning: $${dailyCost.toFixed(2)}`,
        sessionCost,
        dailyCost,
      };
    }

    // Check warning threshold
    const dailyPercentage = (projectedDailyCost / this.budget.maxCostPerDayUsd) * 100;
    if (dailyPercentage >= this.budget.warnAtPercentage) {
      return {
        canProceed: true,
        warning: `Approaching limit: ${dailyPercentage.toFixed(0)}%`,
        sessionCost,
        dailyCost,
      };
    }

    return { canProceed: true, sessionCost, dailyCost };
  }

  resetSession(): void {
    this.sessionUsage = [];
  }
}

describe("Token Estimation", () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager();
  });

  it("should estimate tokens from text length", () => {
    // ~4 chars per token
    expect(manager.estimateTokens("")).toBe(0);
    expect(manager.estimateTokens("test")).toBe(1);
    expect(manager.estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 -> 3
    expect(manager.estimateTokens("a".repeat(100))).toBe(25);
  });

  it("should estimate request tokens", () => {
    const estimate = manager.estimateRequest(
      "gemini-2.5-flash",
      "You are a helpful assistant",
      [{ content: "Hello" }, { content: "How are you?" }]
    );

    expect(estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
    expect(estimate.totalTokens).toBe(estimate.inputTokens + estimate.estimatedOutputTokens);
  });

  it("should estimate cost based on model", () => {
    const flashEstimate = manager.estimateRequest(
      "gemini-2.5-flash",
      "test",
      [{ content: "test" }]
    );

    const proEstimate = manager.estimateRequest(
      "gemini-2.5-pro",
      "test",
      [{ content: "test" }]
    );

    // Pro should be more expensive
    expect(proEstimate.estimatedCostUsd).toBeGreaterThan(flashEstimate.estimatedCostUsd);
  });
});

describe("Token Budget Tracking", () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager();
  });

  it("should track session usage", () => {
    expect(manager.getSessionTotal()).toBe(0);

    manager.recordUsage("gemini-2.5-flash", 1000, 500);
    expect(manager.getSessionTotal()).toBe(1500);

    manager.recordUsage("gemini-2.5-flash", 2000, 1000);
    expect(manager.getSessionTotal()).toBe(4500);
  });

  it("should track daily usage", () => {
    expect(manager.getDailyTotal()).toBe(0);

    manager.recordUsage("gemini-2.5-flash", 1000, 500);
    manager.recordUsage("gemini-2.5-flash", 2000, 1000);

    expect(manager.getDailyTotal()).toBe(4500);
  });

  it("should track session cost", () => {
    manager.recordUsage("gemini-2.5-flash", 1_000_000, 500_000);

    // Flash: $0.15/M input + $0.60/M output
    // Cost = (1M * 0.15/M) + (0.5M * 0.60/M) = 0.15 + 0.30 = 0.45
    expect(manager.getSessionCost()).toBeCloseTo(0.45, 2);
  });

  it("should reset session but not daily", () => {
    manager.recordUsage("gemini-2.5-flash", 1000, 500);

    expect(manager.getSessionTotal()).toBe(1500);
    expect(manager.getDailyTotal()).toBe(1500);

    manager.resetSession();

    expect(manager.getSessionTotal()).toBe(0);
    expect(manager.getDailyTotal()).toBe(1500); // Daily still tracked
  });

  it("should indicate when within budget", () => {
    const estimate = manager.estimateRequest(
      "gemini-2.5-flash",
      "short prompt",
      [{ content: "hi" }]
    );

    expect(estimate.withinBudget).toBe(true);
  });
});

describe("Spending Limit Enforcement", () => {
  it("should allow requests within limits", () => {
    const manager = new TokenManager({
      maxCostPerSessionUsd: 5.0,
      maxCostPerDayUsd: 25.0,
      enforceHardLimits: true,
    });

    const result = manager.checkSpendingLimits(0.50);
    expect(result.canProceed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("should throw on session limit exceeded", () => {
    const manager = new TokenManager({
      maxCostPerSessionUsd: 1.0,
      enforceHardLimits: true,
    });

    // Add usage to reach near limit
    manager.recordUsage("gemini-2.5-pro", 500_000, 100_000); // ~$1.625

    expect(() => manager.checkSpendingLimits(0.50)).toThrow(SpendingLimitError);
  });

  it("should throw on daily limit exceeded", () => {
    const manager = new TokenManager({
      maxCostPerSessionUsd: 100.0, // High session limit
      maxCostPerDayUsd: 2.0, // Low daily limit
      enforceHardLimits: true,
    });

    // Add usage to exceed daily limit
    manager.recordUsage("gemini-2.5-pro", 1_000_000, 200_000); // ~$3.25

    expect(() => manager.checkSpendingLimits(0.10)).toThrow(SpendingLimitError);
  });

  it("should warn instead of throw when enforceHardLimits is false", () => {
    const manager = new TokenManager({
      maxCostPerSessionUsd: 1.0,
      enforceHardLimits: false,
    });

    manager.recordUsage("gemini-2.5-pro", 500_000, 100_000);

    const result = manager.checkSpendingLimits(0.50);
    expect(result.canProceed).toBe(true);
    expect(result.warning).toBeDefined();
  });

  it("should warn at warning threshold", () => {
    const manager = new TokenManager({
      maxCostPerDayUsd: 10.0,
      warnAtPercentage: 80,
      enforceHardLimits: true,
    });

    // Add $8.50 of usage (85% of $10)
    for (let i = 0; i < 5; i++) {
      manager.recordUsage("gemini-2.5-pro", 500_000, 100_000);
    }

    const result = manager.checkSpendingLimits(0.10);
    expect(result.canProceed).toBe(true);
    expect(result.warning).toContain("Approaching");
  });

  it("should include correct error details", () => {
    const manager = new TokenManager({
      maxCostPerSessionUsd: 1.0,
      enforceHardLimits: true,
    });

    manager.recordUsage("gemini-2.5-pro", 500_000, 100_000);

    try {
      manager.checkSpendingLimits(0.50);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SpendingLimitError);
      const spendingError = error as SpendingLimitError;
      expect(spendingError.limitType).toBe("session");
      expect(spendingError.limit).toBe(1.0);
      expect(spendingError.currentCost).toBeGreaterThan(0);
    }
  });
});

describe("Model Pricing", () => {
  it("should have correct pricing for Gemini Flash", () => {
    const spec = MODEL_SPECS["gemini-2.5-flash"];
    expect(spec.inputCostPer1M).toBe(0.15);
    expect(spec.outputCostPer1M).toBe(0.60);
  });

  it("should have correct pricing for Gemini Pro", () => {
    const spec = MODEL_SPECS["gemini-2.5-pro"];
    expect(spec.inputCostPer1M).toBe(1.25);
    expect(spec.outputCostPer1M).toBe(10.0);
  });

  it("should have correct pricing for Gemini 3", () => {
    const flash = MODEL_SPECS["gemini-3-flash"];
    const pro = MODEL_SPECS["gemini-3-pro"];

    expect(flash.inputCostPer1M).toBe(0.10);
    expect(pro.inputCostPer1M).toBe(1.50);
  });

  it("should calculate realistic costs", () => {
    const manager = new TokenManager();

    // 10K tokens input, 2K output on Flash
    // Cost = (10K/1M * $0.15) + (2K/1M * $0.60) = $0.0015 + $0.0012 = $0.0027
    manager.recordUsage("gemini-2.5-flash", 10_000, 2_000);
    expect(manager.getSessionCost()).toBeCloseTo(0.0027, 4);
  });
});

describe("SpendingLimitError", () => {
  it("should have correct properties", () => {
    const error = new SpendingLimitError(4.50, 5.0, "session");

    expect(error.name).toBe("SpendingLimitError");
    expect(error.currentCost).toBe(4.50);
    expect(error.limit).toBe(5.0);
    expect(error.limitType).toBe("session");
    expect(error.message).toContain("$4.50");
    expect(error.message).toContain("$5.00");
  });

  it("should be catchable as Error", () => {
    const error = new SpendingLimitError(10, 5, "daily");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SpendingLimitError);
  });
});
