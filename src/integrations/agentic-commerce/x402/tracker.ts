/**
 * Spend tracker for x402 payments.
 * Records every payment, computes aggregates, and generates audit reports.
 */

import { randomUUID } from "node:crypto";
import { COMMERCE_DEFAULTS, SKALE_BITE_SANDBOX } from "../config.js";

// ─── Types ──────────────────────────────────────────────────

export interface SpendRecord {
  id: string;
  timestamp: string;
  url: string;
  service: string;
  amount: number;
  recipient: string;
  txHash: string;
  blockNumber?: number;
  status: "settled" | "pending" | "failed";
  reason: string;
  ap2?: {
    intentId?: string;
    cartId?: string;
    paymentId?: string;
  };
}

export interface AuditReport {
  agentAddress: string;
  network: string;
  period: { from: string; to: string };
  totalSpent: number;
  totalTransactions: number;
  byRecipient: Array<{ address: string; total: number; count: number }>;
  byService: Array<{ name: string; total: number; count: number }>;
  records: SpendRecord[];
  budgetRemaining: number;
  dailyLimit: number;
}

// ─── Spend Tracker ──────────────────────────────────────────

export class SpendTracker {
  private records: SpendRecord[] = [];
  private readonly agentAddress: string;
  private readonly dailyLimit: number;

  constructor(agentAddress: string, dailyLimit?: number) {
    this.agentAddress = agentAddress;
    this.dailyLimit = dailyLimit ?? COMMERCE_DEFAULTS.dailyLimit;
  }

  /** Record a new payment event */
  record(event: Omit<SpendRecord, "id">): SpendRecord {
    const record: SpendRecord = { id: randomUUID(), ...event };
    this.records.push(record);
    console.log(
      `[x402] Recorded payment: ${record.amount} USDC to ${record.recipient} (${record.status})`,
    );
    return record;
  }

  /** Get total USDC spent today (settled only) */
  getTotalSpent(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.records
      .filter((r) => r.status === "settled" && r.timestamp.startsWith(today))
      .reduce((sum, r) => sum + r.amount, 0);
  }

  /** Get spending by recipient address */
  getByRecipient(): Map<string, number> {
    const map = new Map<string, number>();
    for (const r of this.records.filter((r) => r.status === "settled")) {
      map.set(r.recipient, (map.get(r.recipient) ?? 0) + r.amount);
    }
    return map;
  }

  /** Get spending by service name */
  getByService(): Map<string, number> {
    const map = new Map<string, number>();
    for (const r of this.records.filter((r) => r.status === "settled")) {
      map.set(r.service, (map.get(r.service) ?? 0) + r.amount);
    }
    return map;
  }

  /** Generate a full audit report */
  getReport(): AuditReport {
    const settled = this.records.filter((r) => r.status === "settled");
    const timestamps = settled.map((r) => r.timestamp).sort();

    const byRecipient = Array.from(this.getByRecipient().entries()).map(
      ([address, total]) => ({
        address,
        total,
        count: settled.filter((r) => r.recipient === address).length,
      }),
    );

    const byService = Array.from(this.getByService().entries()).map(
      ([name, total]) => ({
        name,
        total,
        count: settled.filter((r) => r.service === name).length,
      }),
    );

    return {
      agentAddress: this.agentAddress,
      network: "SKALE BITE V2 Sandbox (eip155:103698795)",
      period: {
        from: timestamps[0] ?? new Date().toISOString(),
        to: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
      },
      totalSpent: settled.reduce((sum, r) => sum + r.amount, 0),
      totalTransactions: settled.length,
      byRecipient,
      byService,
      records: this.records,
      budgetRemaining: this.dailyLimit - this.getTotalSpent(),
      dailyLimit: this.dailyLimit,
    };
  }

  /** Format audit report as CLI-styled text (no markdown tables) */
  formatReport(): string {
    const report = this.getReport();
    const lines: string[] = [
      `━━━ x402 Spend Audit Report ━━━`,
      ``,
      `  Agent:     ${report.agentAddress}`,
      `  Network:   ${report.network}`,
      `  Period:    ${report.period.from.slice(0, 19)} to ${report.period.to.slice(0, 19)}`,
      ``,
      `  ┌─ Summary ─────────────────────────`,
      `  │ Total Spent:      $${report.totalSpent.toFixed(6)} USDC`,
      `  │ Transactions:     ${report.totalTransactions}`,
      `  │ Budget Remaining: $${report.budgetRemaining.toFixed(6)} USDC`,
      `  │ Daily Limit:      $${report.dailyLimit.toFixed(2)} USDC`,
      `  └────────────────────────────────────`,
    ];

    if (report.byRecipient.length > 0) {
      lines.push(``, `  ┌─ By Recipient ──────────────────────`);
      for (const r of report.byRecipient) {
        lines.push(
          `  │ ${r.address.slice(0, 8)}...${r.address.slice(-6)}  $${r.total.toFixed(6)}  (${r.count} tx)`,
        );
      }
      lines.push(`  └────────────────────────────────────`);
    }

    if (report.byService.length > 0) {
      lines.push(``, `  ┌─ By Service ────────────────────────`);
      for (const s of report.byService) {
        lines.push(
          `  │ ${s.name.padEnd(16)} $${s.total.toFixed(6)}  (${s.count} tx)`,
        );
      }
      lines.push(`  └────────────────────────────────────`);
    }

    lines.push(``, `  ┌─ Transaction Log ─────────────────────`);
    if (report.records.length === 0) {
      lines.push(`  │ (no transactions recorded)`);
    }
    for (let i = 0; i < report.records.length; i++) {
      const r = report.records[i];
      const isLast = i === report.records.length - 1;
      const connector = isLast ? "╰" : "├";
      const hash = r.txHash && r.txHash !== "settled"
        ? `${r.txHash.slice(0, 12)}...`
        : r.txHash ?? "pending";
      const explorer = r.txHash && r.txHash.startsWith("0x") && r.txHash.length > 10
        ? `\n  │   ${SKALE_BITE_SANDBOX.explorerUrl}/tx/${r.txHash}`
        : "";
      lines.push(
        `  ${connector}─ #${i + 1} [${r.timestamp.slice(11, 19)}] ${r.service}`,
        `  │   $${r.amount.toFixed(6)} USDC -> ${r.recipient.slice(0, 10)}...`,
        `  │   tx: ${hash}  status: ${r.status}${explorer}`,
      );
    }
    lines.push(`  └────────────────────────────────────`);

    return lines.join("\n");
  }

  /** Export full report as JSON string */
  toJSON(): string {
    return JSON.stringify(this.getReport(), null, 2);
  }

  /** Get all records (for external consumers) */
  getRecords(): SpendRecord[] {
    return [...this.records];
  }
}
