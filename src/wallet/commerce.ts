/**
 * Commerce Policy Engine
 *
 * Enforces spending limits, auto-approve thresholds, and recipient controls
 * for autonomous USDC payments on Base.
 */

import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("commerce");

export interface CommercePolicy {
  maxPerTransaction: number;
  dailyLimit: number;
  autoApproveBelow: number;
  requireApprovalAbove: number;
  whitelistedRecipients: string[];
  blacklistedRecipients: string[];
}

export interface PaymentRecord {
  to: string;
  amount: number;
  txHash: string;
  timestamp: string;
}

interface DailyLedger {
  date: string;
  payments: PaymentRecord[];
}

export interface PaymentCheck {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
}

export interface DailySpending {
  total: number;
  count: number;
  remaining: number;
}

const DEFAULT_POLICY: CommercePolicy = {
  maxPerTransaction: 1.0,
  dailyLimit: 10.0,
  autoApproveBelow: 0.10,
  requireApprovalAbove: 0.10,
  whitelistedRecipients: [],
  blacklistedRecipients: [],
};

export class CommerceEngine {
  private policy: CommercePolicy;
  private runtimeDir: string;

  constructor(runtimeDir: string, policy?: Partial<CommercePolicy>) {
    this.runtimeDir = runtimeDir;
    ensureDir(resolve(runtimeDir, "wallet"));

    // Load persisted policy or use defaults + overrides
    const savedPolicy = readJSON<CommercePolicy>(this.getPolicyPath());
    this.policy = { ...DEFAULT_POLICY, ...savedPolicy, ...policy };

    // Persist merged policy
    writeJSON(this.getPolicyPath(), this.policy);
    log.info("Commerce engine initialized: max/tx=$%d daily=$%d auto<$%d",
      this.policy.maxPerTransaction, this.policy.dailyLimit, this.policy.autoApproveBelow);
  }

  private getPolicyPath(): string {
    return resolve(this.runtimeDir, "wallet", "commerce-policy.json");
  }

  private getLedgerPath(): string {
    return resolve(this.runtimeDir, "wallet", "commerce-ledger.json");
  }

  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  private loadTodayLedger(): DailyLedger {
    const today = this.getTodayKey();
    const ledger = readJSON<DailyLedger>(this.getLedgerPath());
    if (ledger && ledger.date === today) return ledger;
    // New day — reset
    return { date: today, payments: [] };
  }

  private saveLedger(ledger: DailyLedger): void {
    writeJSON(this.getLedgerPath(), ledger);
  }

  async checkPayment(to: string, amount: number): Promise<PaymentCheck> {
    const addr = to.toLowerCase();

    // Blacklist check
    if (this.policy.blacklistedRecipients.some(a => a.toLowerCase() === addr)) {
      return { allowed: false, reason: "Recipient is blacklisted", requiresApproval: false };
    }

    // Per-transaction limit
    if (amount > this.policy.maxPerTransaction) {
      return {
        allowed: false,
        reason: `Amount $${amount} exceeds per-transaction limit of $${this.policy.maxPerTransaction}`,
        requiresApproval: false,
      };
    }

    // Daily limit check
    const spending = this.getDailySpending();
    if (spending.total + amount > this.policy.dailyLimit) {
      return {
        allowed: false,
        reason: `Would exceed daily limit ($${spending.total.toFixed(2)} spent + $${amount} = $${(spending.total + amount).toFixed(2)}, limit $${this.policy.dailyLimit})`,
        requiresApproval: false,
      };
    }

    // Whitelisted recipients auto-approve
    const isWhitelisted = this.policy.whitelistedRecipients.some(a => a.toLowerCase() === addr);
    if (isWhitelisted) {
      return { allowed: true, requiresApproval: false };
    }

    // Auto-approve below threshold
    if (amount < this.policy.autoApproveBelow) {
      return { allowed: true, requiresApproval: false };
    }

    // Requires human approval
    return { allowed: true, requiresApproval: true };
  }

  recordPayment(to: string, amount: number, txHash: string): void {
    const ledger = this.loadTodayLedger();
    ledger.payments.push({
      to,
      amount,
      txHash,
      timestamp: new Date().toISOString(),
    });
    this.saveLedger(ledger);
    log.info("Recorded payment: $%d to %s (%s)", amount, to.slice(0, 10), txHash.slice(0, 14));
  }

  getDailySpending(): DailySpending {
    const ledger = this.loadTodayLedger();
    const total = ledger.payments.reduce((sum, p) => sum + p.amount, 0);
    return {
      total,
      count: ledger.payments.length,
      remaining: Math.max(0, this.policy.dailyLimit - total),
    };
  }

  getStatus(): {
    policy: CommercePolicy;
    dailySpending: DailySpending;
    recentPayments: PaymentRecord[];
  } {
    const ledger = this.loadTodayLedger();
    return {
      policy: { ...this.policy },
      dailySpending: this.getDailySpending(),
      recentPayments: ledger.payments.slice(-10),
    };
  }

  updatePolicy(updates: Partial<CommercePolicy>): void {
    Object.assign(this.policy, updates);
    writeJSON(this.getPolicyPath(), this.policy);
    log.info("Commerce policy updated: %o", updates);
  }

  getPolicy(): CommercePolicy {
    return { ...this.policy };
  }
}

/**
 * Global commerce engine instance
 */
let globalCommerceEngine: CommerceEngine | null = null;

export function getCommerceEngine(): CommerceEngine | null {
  return globalCommerceEngine;
}

export function setCommerceEngine(engine: CommerceEngine): void {
  globalCommerceEngine = engine;
}

export function initCommerceEngine(
  runtimeDir: string,
  policy?: Partial<CommercePolicy>
): CommerceEngine {
  const engine = new CommerceEngine(runtimeDir, policy);
  globalCommerceEngine = engine;
  return engine;
}
