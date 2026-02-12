/**
 * DeFi Risk Engine — evaluates trade proposals against safety guardrails.
 *
 * Enforces: position limits, slippage bounds, daily loss caps, token allowlists,
 * cooldown periods, and human approval requirements.
 */

// ─── Types ──────────────────────────────────────────────────

export interface RiskProfile {
  maxPositionSize: number;
  maxSlippageBps: number;
  dailyLossLimit: number;
  allowedTokens: string[];
  blockedTokens: string[];
  requireHumanApproval: boolean;
  cooldownMs: number;
}

export interface TradeDecision {
  action: "swap" | "provide_lp" | "withdraw" | "hold";
  fromToken: string;
  toToken: string;
  amount: string;
  reason: string;
  riskScore: number;
  approved: boolean;
  denialReason?: string;
  sources: string[];
  evaluatedAt: string;
}

export const DEFAULT_RISK_PROFILE: RiskProfile = {
  maxPositionSize: 0.5,
  maxSlippageBps: 100,
  dailyLossLimit: 2.0,
  allowedTokens: [],
  blockedTokens: [],
  requireHumanApproval: false,
  cooldownMs: 60_000,
};

// ─── Risk Engine ────────────────────────────────────────────

export class RiskEngine {
  private profile: RiskProfile;
  private history: TradeDecision[] = [];
  private lastTradeTimestamp = 0;

  constructor(profile?: Partial<RiskProfile>) {
    this.profile = { ...DEFAULT_RISK_PROFILE, ...profile };
  }

  /** Evaluate a proposed trade against the risk profile */
  evaluate(trade: {
    action: string;
    fromToken: string;
    toToken: string;
    amount: number;
    currentPrice: number;
    expectedPrice: number;
    sources: string[];
    reasoning: string;
  }): TradeDecision {
    const decision: TradeDecision = {
      action: trade.action as TradeDecision["action"],
      fromToken: trade.fromToken,
      toToken: trade.toToken,
      amount: trade.amount.toString(),
      reason: trade.reasoning,
      riskScore: 0,
      approved: true,
      sources: trade.sources,
      evaluatedAt: new Date().toISOString(),
    };

    // Check 1: Position size limit
    if (trade.amount > this.profile.maxPositionSize) {
      decision.approved = false;
      decision.denialReason = `Amount $${trade.amount} exceeds max position size $${this.profile.maxPositionSize}`;
      decision.riskScore = 90;
      this.history.push(decision);
      console.log(`[DeFi:risk] DENIED: ${decision.denialReason}`);
      return decision;
    }

    // Check 2: Slippage bounds
    const slippageBps =
      trade.currentPrice > 0
        ? Math.abs(
            ((trade.expectedPrice - trade.currentPrice) / trade.currentPrice) *
              10_000,
          )
        : 0;
    if (slippageBps > this.profile.maxSlippageBps) {
      decision.approved = false;
      decision.denialReason = `Expected slippage ${slippageBps.toFixed(0)}bps exceeds max ${this.profile.maxSlippageBps}bps`;
      decision.riskScore = 85;
      this.history.push(decision);
      console.log(`[DeFi:risk] DENIED: ${decision.denialReason}`);
      return decision;
    }

    // Check 3: Daily loss limit
    const todayLoss = this.getDailyLoss();
    if (todayLoss + trade.amount > this.profile.dailyLossLimit) {
      decision.approved = false;
      decision.denialReason = `Daily loss $${(todayLoss + trade.amount).toFixed(4)} would exceed limit $${this.profile.dailyLossLimit}`;
      decision.riskScore = 95;
      this.history.push(decision);
      console.log(`[DeFi:risk] DENIED: ${decision.denialReason}`);
      return decision;
    }

    // Check 4: Token allowlist/blocklist
    if (this.profile.blockedTokens.length > 0) {
      const blocked = [trade.fromToken, trade.toToken].find((t) =>
        this.profile.blockedTokens.includes(t.toLowerCase()),
      );
      if (blocked) {
        decision.approved = false;
        decision.denialReason = `Token ${blocked} is on the blocked list`;
        decision.riskScore = 100;
        this.history.push(decision);
        console.log(`[DeFi:risk] DENIED: ${decision.denialReason}`);
        return decision;
      }
    }

    if (this.profile.allowedTokens.length > 0) {
      const notAllowed = [trade.fromToken, trade.toToken].find(
        (t) => !this.profile.allowedTokens.includes(t.toLowerCase()),
      );
      if (notAllowed) {
        decision.approved = false;
        decision.denialReason = `Token ${notAllowed} is not on the allowed list`;
        decision.riskScore = 80;
        this.history.push(decision);
        console.log(`[DeFi:risk] DENIED: ${decision.denialReason}`);
        return decision;
      }
    }

    // Check 5: Cooldown period
    const timeSinceLastTrade = Date.now() - this.lastTradeTimestamp;
    if (
      this.lastTradeTimestamp > 0 &&
      timeSinceLastTrade < this.profile.cooldownMs
    ) {
      decision.approved = false;
      decision.denialReason = `Cooldown: ${Math.ceil((this.profile.cooldownMs - timeSinceLastTrade) / 1000)}s remaining`;
      decision.riskScore = 50;
      this.history.push(decision);
      console.log(`[DeFi:risk] DENIED: ${decision.denialReason}`);
      return decision;
    }

    // Check 6: Human approval required
    if (this.profile.requireHumanApproval) {
      decision.approved = false;
      decision.denialReason = "Human approval required (risk profile setting)";
      decision.riskScore = 40;
      this.history.push(decision);
      console.log(`[DeFi:risk] PENDING APPROVAL: ${decision.denialReason}`);
      return decision;
    }

    // Calculate risk score for approved trades
    decision.riskScore = Math.min(
      100,
      Math.round(
        (trade.amount / this.profile.maxPositionSize) * 30 +
          (slippageBps / this.profile.maxSlippageBps) * 30 +
          (todayLoss / this.profile.dailyLossLimit) * 20 +
          (trade.sources.length < 2 ? 20 : 0),
      ),
    );

    this.lastTradeTimestamp = Date.now();
    this.history.push(decision);
    console.log(
      `[DeFi:risk] APPROVED: ${trade.action} ${trade.amount} ${trade.fromToken} -> ${trade.toToken} (risk: ${decision.riskScore}/100)`,
    );
    return decision;
  }

  /** Get current risk profile */
  getProfile(): RiskProfile {
    return { ...this.profile };
  }

  /** Update risk profile */
  updateProfile(updates: Partial<RiskProfile>): void {
    this.profile = { ...this.profile, ...updates };
  }

  /** Get trade decision history */
  getHistory(): TradeDecision[] {
    return [...this.history];
  }

  /** Calculate total potential loss from today's trades */
  private getDailyLoss(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.history
      .filter(
        (d) => d.approved && d.evaluatedAt.startsWith(today),
      )
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);
  }

  /** Format trade history as human-readable log */
  formatTradeLog(): string {
    if (this.history.length === 0) return "No trades evaluated yet.";

    const lines: string[] = [
      `## DeFi Trade Log`,
      ``,
      `| # | Action | From | To | Amount | Risk | Approved | Reason |`,
      `|---|--------|------|----|--------|------|----------|--------|`,
    ];

    for (let i = 0; i < this.history.length; i++) {
      const d = this.history[i];
      lines.push(
        `| ${i + 1} | ${d.action} | ${d.fromToken} | ${d.toToken} | $${d.amount} | ${d.riskScore}/100 | ${d.approved ? "YES" : "NO"} | ${d.denialReason ?? d.reason.slice(0, 40)} |`,
      );
    }

    const approved = this.history.filter((d) => d.approved).length;
    const denied = this.history.length - approved;
    lines.push(``);
    lines.push(`**Total:** ${this.history.length} evaluations | ${approved} approved | ${denied} denied`);

    return lines.join("\n");
  }
}
