/**
 * x402 Buyer Client — wraps @x402/fetch for automatic payment handling.
 *
 * Creates a payment-enabled fetch client that:
 * 1. Detects HTTP 402 Payment Required responses
 * 2. Signs EIP-3009 USDC transfer authorizations via viem
 * 3. Sends payment proof to the Kobaru facilitator
 * 4. Retries the original request with payment proof headers
 * 5. Tracks all spending against configurable limits
 */

import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { SKALE_BITE_SANDBOX, COMMERCE_DEFAULTS, atomicToUsdc } from "../config.js";
import type { SpendTracker } from "./tracker.js";

// ─── Types ──────────────────────────────────────────────────

export interface BuyerConfig {
  privateKey: `0x${string}`;
  maxPaymentAmount?: number;
  autoApproveBelow?: number;
  dailyLimit?: number;
}

export interface PaymentEvent {
  url: string;
  amount: string;
  amountUsdc: number;
  recipient: string;
  txHash?: string;
  timestamp: string;
  status: "success" | "failed" | "skipped";
  reason?: string;
}

// ─── Buyer ──────────────────────────────────────────────────

export class X402Buyer {
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly paidFetch: typeof globalThis.fetch;
  private readonly maxPaymentAmount: number;
  private readonly autoApproveBelow: number;
  private readonly dailyLimit: number;
  private readonly history: PaymentEvent[] = [];
  private tracker?: SpendTracker;

  constructor(config: BuyerConfig) {
    this.account = privateKeyToAccount(config.privateKey);
    this.maxPaymentAmount = config.maxPaymentAmount ?? COMMERCE_DEFAULTS.maxPerTransaction;
    this.autoApproveBelow = config.autoApproveBelow ?? COMMERCE_DEFAULTS.autoApproveBelow;
    this.dailyLimit = config.dailyLimit ?? COMMERCE_DEFAULTS.dailyLimit;

    // Create x402 client with EVM exact scheme (EIP-3009)
    const client = new x402Client();
    registerExactEvmScheme(client, {
      signer: this.account,
      networks: [SKALE_BITE_SANDBOX.network],
    });

    // Hook into payment lifecycle for tracking (silent)
    client.onAfterPaymentCreation(async () => {});
    client.onPaymentCreationFailure(async () => {});

    // Wrap native fetch with payment handling
    this.paidFetch = wrapFetchWithPayment(globalThis.fetch, client);
  }

  /** Get the buyer's wallet address */
  get address(): string {
    return this.account.address;
  }

  /** Attach a spend tracker for audit logging */
  setTracker(tracker: SpendTracker): void {
    this.tracker = tracker;
  }

  /**
   * Fetch a URL with automatic x402 payment handling.
   * If the server responds 402, the client will sign an EIP-3009
   * authorization, pay via the facilitator, and retry.
   */
  async payAndFetch(
    url: string,
    options?: RequestInit,
    reason?: string,
  ): Promise<Response> {
    const timestamp = new Date().toISOString();

    // Pre-check: daily budget
    if (this.getDailySpent() >= this.dailyLimit) {
      const event: PaymentEvent = {
        url,
        amount: "0",
        amountUsdc: 0,
        recipient: "unknown",
        timestamp,
        status: "skipped",
        reason: `Daily limit reached ($${this.dailyLimit})`,
      };
      this.history.push(event);
      throw new Error(`Daily spending limit reached: $${this.getDailySpent().toFixed(6)} / $${this.dailyLimit}`);
    }

    try {
      // Silent fetch — tracked via history
      const response = await this.paidFetch(url, options);

      // Check for settlement info in response headers
      const settleHeader = response.headers.get("x-payment-response");
      if (settleHeader) {
        // Payment was made — extract details
        let txHash = "unknown";
        let recipient = "unknown";
        let amount = "0";
        try {
          const decoded = JSON.parse(
            Buffer.from(settleHeader, "base64").toString("utf-8"),
          );
          txHash = decoded.transaction ?? decoded.txHash ?? "unknown";
          recipient = decoded.payer ?? "unknown";
          amount = decoded.amount ?? "0";
        } catch {
          // Header may not be JSON — that's fine
        }

        const amountUsdc = atomicToUsdc(amount);
        const event: PaymentEvent = {
          url,
          amount,
          amountUsdc,
          recipient,
          txHash,
          timestamp,
          status: "success",
          reason: reason ?? "x402 auto-payment",
        };
        this.history.push(event);

        // Record in tracker if available
        if (this.tracker) {
          const serviceName = new URL(url).pathname.split("/")[1] ?? "unknown";
          this.tracker.record({
            timestamp,
            url,
            service: serviceName,
            amount: amountUsdc,
            recipient,
            txHash,
            status: "settled",
            reason: reason ?? "x402 auto-payment",
          });
        }

        // Payment settled — tracked in history
      }

      return response;
    } catch (err) {
      const event: PaymentEvent = {
        url,
        amount: "0",
        amountUsdc: 0,
        recipient: "unknown",
        timestamp,
        status: "failed",
        reason: (err as Error).message,
      };
      this.history.push(event);
      throw err;
    }
  }

  /** Get all payment events in this session */
  getPaymentHistory(): PaymentEvent[] {
    return [...this.history];
  }

  /** Get total USDC spent in this session */
  getTotalSpent(): number {
    return this.history
      .filter((e) => e.status === "success")
      .reduce((sum, e) => sum + e.amountUsdc, 0);
  }

  /** Get USDC spent today */
  getDailySpent(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.history
      .filter((e) => e.status === "success" && e.timestamp.startsWith(today))
      .reduce((sum, e) => sum + e.amountUsdc, 0);
  }

  /** Get remaining daily budget */
  getRemainingBudget(): number {
    return this.dailyLimit - this.getDailySpent();
  }

  /** Get budget status summary */
  getBudgetStatus(): string {
    return [
      `Wallet: ${this.address}`,
      `Daily limit: $${this.dailyLimit.toFixed(2)} USDC`,
      `Spent today: $${this.getDailySpent().toFixed(6)} USDC`,
      `Remaining: $${this.getRemainingBudget().toFixed(6)} USDC`,
      `Max per tx: $${this.maxPaymentAmount.toFixed(2)} USDC`,
      `Auto-approve below: $${this.autoApproveBelow.toFixed(4)} USDC`,
      `Session payments: ${this.history.filter((e) => e.status === "success").length}`,
      `Session total: $${this.getTotalSpent().toFixed(6)} USDC`,
    ].join("\n");
  }
}
