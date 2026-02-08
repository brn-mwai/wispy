/**
 * Token estimation and budget management.
 *
 * Solves the #1 complaint with agent platforms: excessive token usage.
 * Estimates tokens before sending, enforces budgets, and optimizes context.
 */

import { createLogger } from "../infra/logger.js";

const log = createLogger("token");

/** Approximate tokens per character ratio for English text. */
const CHARS_PER_TOKEN = 4;

/** Model context limits and pricing (per 1M tokens). */
const MODEL_SPECS: Record<string, ModelSpec> = {
  // Gemini 3 (latest - 2025)
  "gemini-3-pro": { contextWindow: 2_000_000, inputCostPer1M: 1.50, outputCostPer1M: 8.0 },
  "gemini-3-flash": { contextWindow: 2_000_000, inputCostPer1M: 0.10, outputCostPer1M: 0.40 },
  "gemini-3.0-pro": { contextWindow: 2_000_000, inputCostPer1M: 1.50, outputCostPer1M: 8.0 },
  "gemini-3.0-flash": { contextWindow: 2_000_000, inputCostPer1M: 0.10, outputCostPer1M: 0.40 },
  // Gemini 2.5
  "gemini-2.5-pro": { contextWindow: 1_000_000, inputCostPer1M: 1.25, outputCostPer1M: 10.0 },
  "gemini-2.5-flash": { contextWindow: 1_000_000, inputCostPer1M: 0.15, outputCostPer1M: 0.60 },
  "gemini-2.5-pro-preview": { contextWindow: 1_000_000, inputCostPer1M: 1.25, outputCostPer1M: 10.0 },
  "gemini-2.5-flash-preview": { contextWindow: 1_000_000, inputCostPer1M: 0.15, outputCostPer1M: 0.60 },
  // Gemini 2.0
  "gemini-2.0-flash": { contextWindow: 1_000_000, inputCostPer1M: 0.10, outputCostPer1M: 0.40 },
  "gemini-2.0-pro": { contextWindow: 1_000_000, inputCostPer1M: 1.25, outputCostPer1M: 10.0 },
  "gemini-2.0-flash-lite": { contextWindow: 1_000_000, inputCostPer1M: 0.075, outputCostPer1M: 0.30 },
  // Gemini 1.5
  "gemini-1.5-pro": { contextWindow: 2_000_000, inputCostPer1M: 1.25, outputCostPer1M: 5.0 },
  "gemini-1.5-flash": { contextWindow: 1_000_000, inputCostPer1M: 0.075, outputCostPer1M: 0.30 },
  "gemini-1.5-flash-8b": { contextWindow: 1_000_000, inputCostPer1M: 0.0375, outputCostPer1M: 0.15 },
  // Nano / Lightweight
  "gemini-nano": { contextWindow: 32_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemini-1.0-pro": { contextWindow: 32_000, inputCostPer1M: 0.50, outputCostPer1M: 1.50 },
  // Free tier / experimental models
  "gemini-2.0-flash-exp": { contextWindow: 1_000_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemini-2.0-flash-thinking-exp": { contextWindow: 1_000_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemini-exp-1206": { contextWindow: 2_000_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "learnlm-1.5-pro-experimental": { contextWindow: 32_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  // Image generation (per image)
  "imagen-3.0-generate-002": { contextWindow: 0, inputCostPer1M: 0, outputCostPer1M: 40.0 },
  "imagen-3.0-generate-001": { contextWindow: 0, inputCostPer1M: 0, outputCostPer1M: 40.0 },
  // Gemma open models (free via API)
  "gemma-3-27b-it": { contextWindow: 128_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemma-3-12b-it": { contextWindow: 128_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemma-3-4b-it": { contextWindow: 128_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemma-2-27b-it": { contextWindow: 8_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemma-2-9b-it": { contextWindow: 8_000, inputCostPer1M: 0, outputCostPer1M: 0 },
  // Embeddings
  "text-embedding-004": { contextWindow: 2048, inputCostPer1M: 0.025, outputCostPer1M: 0 },
  "text-embedding-005": { contextWindow: 2048, inputCostPer1M: 0.025, outputCostPer1M: 0 },
  // Other providers (for reference)
  "gpt-4o": { contextWindow: 128_000, inputCostPer1M: 2.50, outputCostPer1M: 10.0 },
};

interface ModelSpec {
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface TokenEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  withinBudget: boolean;
  model: string;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: string;
}

export interface TokenBudget {
  maxTokensPerRequest: number;
  maxTokensPerSession: number;
  maxTokensPerDay: number;
  warnAtPercentage: number;
  /** SPENDING LIMITS - solves surprise billing complaints */
  maxCostPerSessionUsd: number;
  maxCostPerDayUsd: number;
  /** If true, block requests that exceed budget. If false, just warn. */
  enforceHardLimits: boolean;
}

const DEFAULT_BUDGET: TokenBudget = {
  maxTokensPerRequest: 100_000,
  maxTokensPerSession: 500_000,
  maxTokensPerDay: 2_000_000,
  warnAtPercentage: 80,
  // Spending limits - prevent surprise bills
  maxCostPerSessionUsd: 5.00,   // $5 per session
  maxCostPerDayUsd: 25.00,      // $25 per day
  enforceHardLimits: true,      // Block requests that exceed budget
};

/**
 * Error thrown when spending limits are exceeded
 */
export class SpendingLimitError extends Error {
  public readonly currentCost: number;
  public readonly limit: number;
  public readonly limitType: 'session' | 'daily';

  constructor(currentCost: number, limit: number, limitType: 'session' | 'daily') {
    super(
      `Spending limit exceeded: $${currentCost.toFixed(2)} / $${limit.toFixed(2)} (${limitType}). ` +
      `Increase your budget or start a new ${limitType === 'session' ? 'session' : 'day'}.`
    );
    this.name = 'SpendingLimitError';
    this.currentCost = currentCost;
    this.limit = limit;
    this.limitType = limitType;
  }
}

export class TokenManager {
  private budget: TokenBudget;
  private sessionUsage: TokenUsage[] = [];
  private dailyUsage: TokenUsage[] = [];

  constructor(budget?: Partial<TokenBudget>) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  /**
   * Estimate token count for a string using character-based approximation.
   * More accurate than most heuristics for English/code mixed content.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Estimate tokens for a full request (system prompt + messages + tools).
   */
  estimateRequest(
    model: string,
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    toolDeclarations?: unknown[]
  ): TokenEstimate {
    const spec = MODEL_SPECS[model] || MODEL_SPECS["gemini-2.5-pro"];

    let inputTokens = this.estimateTokens(systemPrompt);

    for (const msg of messages) {
      inputTokens += this.estimateTokens(msg.content) + 4; // role overhead
    }

    if (toolDeclarations) {
      inputTokens += this.estimateTokens(JSON.stringify(toolDeclarations));
    }

    // Estimate output as 25% of input (typical for conversational AI)
    const estimatedOutputTokens = Math.min(
      Math.ceil(inputTokens * 0.25),
      8192
    );

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

    if (!withinBudget) {
      log.warn(
        "Token budget exceeded: request=%d, session=%d/%d, daily=%d/%d",
        totalTokens,
        sessionTotal,
        this.budget.maxTokensPerSession,
        dailyTotal,
        this.budget.maxTokensPerDay
      );
    }

    const warnThreshold = this.budget.maxTokensPerDay * (this.budget.warnAtPercentage / 100);
    if (dailyTotal > warnThreshold) {
      log.warn(
        "Token usage at %d%% of daily budget (%d/%d)",
        Math.round((dailyTotal / this.budget.maxTokensPerDay) * 100),
        dailyTotal,
        this.budget.maxTokensPerDay
      );
    }

    return {
      inputTokens,
      estimatedOutputTokens,
      totalTokens,
      estimatedCostUsd,
      withinBudget,
      model,
    };
  }

  /**
   * Record actual token usage after a request completes.
   */
  recordUsage(model: string, inputTokens: number, outputTokens: number): void {
    const spec = MODEL_SPECS[model] || MODEL_SPECS["gemini-2.5-pro"];
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

    log.debug(
      "Token usage: in=%d out=%d total=%d cost=$%s",
      inputTokens,
      outputTokens,
      usage.totalTokens,
      costUsd.toFixed(4)
    );
  }

  /**
   * Apply context windowing: trim message history to fit within token budget.
   * Keeps system prompt + most recent messages that fit.
   */
  windowMessages(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    systemPromptTokens: number
  ): Array<{ role: string; content: string }> {
    const available = maxTokens - systemPromptTokens - 2000; // reserve for output
    let used = 0;
    const windowed: Array<{ role: string; content: string }> = [];

    // Always include the most recent message
    for (let i = messages.length - 1; i >= 0; i--) {
      const tokens = this.estimateTokens(messages[i].content) + 4;
      if (used + tokens > available && windowed.length > 0) break;
      used += tokens;
      windowed.unshift(messages[i]);
    }

    if (windowed.length < messages.length) {
      log.debug(
        "Context windowed: %d → %d messages (%d tokens)",
        messages.length,
        windowed.length,
        used
      );
    }

    return windowed;
  }

  /**
   * Recommend the cheapest model that can handle the task.
   */
  recommendModel(
    inputTokens: number,
    requiresTools: boolean,
    requiresThinking: boolean
  ): string {
    if (requiresThinking || inputTokens > 50_000) {
      return "gemini-2.5-pro";
    }
    if (!requiresTools && inputTokens < 5_000) {
      return "gemini-2.5-flash";
    }
    return "gemini-2.5-flash";
  }

  getSessionTotal(): number {
    return this.sessionUsage.reduce((sum, u) => sum + u.totalTokens, 0);
  }

  getDailyTotal(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.dailyUsage
      .filter((u) => u.timestamp.startsWith(today))
      .reduce((sum, u) => sum + u.totalTokens, 0);
  }

  getSessionCost(): number {
    return this.sessionUsage.reduce((sum, u) => sum + u.costUsd, 0);
  }

  getDailyCost(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.dailyUsage
      .filter((u) => u.timestamp.startsWith(today))
      .reduce((sum, u) => sum + u.costUsd, 0);
  }

  getStats(): {
    sessionTokens: number;
    sessionCost: number;
    dailyTokens: number;
    dailyCost: number;
    requestCount: number;
    budget: TokenBudget;
  } {
    return {
      sessionTokens: this.getSessionTotal(),
      sessionCost: this.getSessionCost(),
      dailyTokens: this.getDailyTotal(),
      dailyCost: this.getDailyCost(),
      requestCount: this.sessionUsage.length,
      budget: this.budget,
    };
  }

  resetSession(): void {
    this.sessionUsage = [];
  }

  /**
   * SPENDING LIMIT ENFORCEMENT
   * Call this BEFORE making API requests to prevent surprise bills.
   * This solves the #1 billing complaint from Gemini CLI users.
   *
   * @throws SpendingLimitError if hard limits are enabled and exceeded
   * @returns { canProceed: boolean, warning?: string }
   */
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
          'session'
        );
      }
      return {
        canProceed: true,
        warning: `Session spending limit warning: $${sessionCost.toFixed(2)} / $${this.budget.maxCostPerSessionUsd.toFixed(2)}`,
        sessionCost,
        dailyCost,
      };
    }

    // Check daily limit
    if (projectedDailyCost > this.budget.maxCostPerDayUsd) {
      if (this.budget.enforceHardLimits) {
        throw new SpendingLimitError(
          dailyCost,
          this.budget.maxCostPerDayUsd,
          'daily'
        );
      }
      return {
        canProceed: true,
        warning: `Daily spending limit warning: $${dailyCost.toFixed(2)} / $${this.budget.maxCostPerDayUsd.toFixed(2)}`,
        sessionCost,
        dailyCost,
      };
    }

    // Check warning threshold
    const dailyPercentage = (projectedDailyCost / this.budget.maxCostPerDayUsd) * 100;
    if (dailyPercentage >= this.budget.warnAtPercentage) {
      return {
        canProceed: true,
        warning: `Approaching daily spending limit: ${dailyPercentage.toFixed(0)}% ($${dailyCost.toFixed(2)} / $${this.budget.maxCostPerDayUsd.toFixed(2)})`,
        sessionCost,
        dailyCost,
      };
    }

    return { canProceed: true, sessionCost, dailyCost };
  }

  /**
   * Update budget limits dynamically
   */
  updateBudget(newBudget: Partial<TokenBudget>): void {
    this.budget = { ...this.budget, ...newBudget };
    log.info(
      "Budget updated: session=$%s/day, daily=$%s/day, enforce=%s",
      this.budget.maxCostPerSessionUsd,
      this.budget.maxCostPerDayUsd,
      this.budget.enforceHardLimits
    );
  }

  /**
   * Get a summary of current spending for display
   */
  getSpendingSummary(): string {
    const stats = this.getStats();
    const sessionPct = (stats.sessionCost / this.budget.maxCostPerSessionUsd) * 100;
    const dailyPct = (stats.dailyCost / this.budget.maxCostPerDayUsd) * 100;

    return [
      `Session: $${stats.sessionCost.toFixed(2)} / $${this.budget.maxCostPerSessionUsd.toFixed(2)} (${sessionPct.toFixed(0)}%)`,
      `Daily: $${stats.dailyCost.toFixed(2)} / $${this.budget.maxCostPerDayUsd.toFixed(2)} (${dailyPct.toFixed(0)}%)`,
      `Requests: ${stats.requestCount}`,
      `Tokens: ${stats.sessionTokens.toLocaleString()}`,
    ].join(' | ');
  }
}
