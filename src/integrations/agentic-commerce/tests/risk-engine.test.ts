import { describe, it, expect, beforeEach } from "vitest";
import { RiskEngine, DEFAULT_RISK_PROFILE } from "../defi/risk-engine.js";

describe("RiskEngine", () => {
  let engine: RiskEngine;

  beforeEach(() => {
    engine = new RiskEngine({ cooldownMs: 0 });
  });

  it("should approve trades within limits", () => {
    const decision = engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.1,
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["CoinGecko", "DeFiLlama"],
      reasoning: "Small test trade",
    });

    expect(decision.approved).toBe(true);
    expect(decision.riskScore).toBeLessThan(100);
  });

  it("should deny trades exceeding position size", () => {
    const decision = engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 1.0, // Exceeds default 0.5
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["CoinGecko"],
      reasoning: "Big trade",
    });

    expect(decision.approved).toBe(false);
    expect(decision.denialReason).toContain("max position size");
  });

  it("should deny trades exceeding slippage bounds", () => {
    const decision = engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.1,
      currentPrice: 2000,
      expectedPrice: 1960, // 2% slippage = 200bps > 100bps max
      sources: ["CoinGecko"],
      reasoning: "Slippy trade",
    });

    expect(decision.approved).toBe(false);
    expect(decision.denialReason).toContain("slippage");
  });

  it("should deny trades exceeding daily loss limit", () => {
    // Fill up daily loss
    for (let i = 0; i < 5; i++) {
      engine.evaluate({
        action: "swap",
        fromToken: "USDC",
        toToken: "ETH",
        amount: 0.4,
        currentPrice: 2000,
        expectedPrice: 1999,
        sources: ["source"],
        reasoning: "Fill daily",
      });
    }

    const decision = engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.3,
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["source"],
      reasoning: "Over daily limit",
    });

    expect(decision.approved).toBe(false);
    expect(decision.denialReason).toContain("Daily loss");
  });

  it("should deny trades with blocked tokens", () => {
    engine.updateProfile({ blockedTokens: ["scamtoken"] });

    const decision = engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "scamtoken",
      amount: 0.01,
      currentPrice: 1,
      expectedPrice: 1,
      sources: ["source"],
      reasoning: "Risky token",
    });

    expect(decision.approved).toBe(false);
    expect(decision.denialReason).toContain("blocked");
  });

  it("should track trade history", () => {
    engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.1,
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["source"],
      reasoning: "Test",
    });

    expect(engine.getHistory()).toHaveLength(1);
  });

  it("should format trade log", () => {
    engine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.1,
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["source"],
      reasoning: "Test",
    });

    const log = engine.formatTradeLog();
    expect(log).toContain("DeFi Trade Log");
    expect(log).toContain("USDC");
  });

  it("should respect cooldown period", () => {
    const cooldownEngine = new RiskEngine({ cooldownMs: 60_000 });

    // First trade
    cooldownEngine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.1,
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["source"],
      reasoning: "First",
    });

    // Second trade immediately — should be denied
    const decision = cooldownEngine.evaluate({
      action: "swap",
      fromToken: "USDC",
      toToken: "ETH",
      amount: 0.1,
      currentPrice: 2000,
      expectedPrice: 1999,
      sources: ["source"],
      reasoning: "Too soon",
    });

    expect(decision.approved).toBe(false);
    expect(decision.denialReason).toContain("Cooldown");
  });
});
