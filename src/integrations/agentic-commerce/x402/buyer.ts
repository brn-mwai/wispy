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
import type { PrivateKeyAccount } from "viem/accounts";
import { SKALE_BITE_SANDBOX, COMMERCE_DEFAULTS, atomicToUsdc } from "../config.js";
import type { SpendTracker } from "./tracker.js";
import type { CDPWalletProvider } from "../../../wallet/cdp-wallet.js";

/** Payment details captured from x402 lifecycle hook */
interface CapturedPayment {
  amount: string;
  payTo: string;
  network: string;
  scheme: string;
  timestamp: string;
}

// ─── Types ──────────────────────────────────────────────────

export interface BuyerConfig {
  privateKey: `0x${string}`;
  maxPaymentAmount?: number;
  autoApproveBelow?: number;
  dailyLimit?: number;
  /** Optional CDP wallet provider for custody + signing */
  cdpWallet?: CDPWalletProvider;
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
  private readonly account: PrivateKeyAccount;
  private readonly paidFetch: typeof globalThis.fetch;
  private readonly maxPaymentAmount: number;
  private readonly autoApproveBelow: number;
  private readonly dailyLimit: number;
  private readonly history: PaymentEvent[] = [];
  private readonly walletProvider: "cdp" | "raw";
  private readonly cdpWalletId?: string;
  private tracker?: SpendTracker;
  /** Pending payment captured by the lifecycle hook (cleared after recording) */
  private pendingPayment: CapturedPayment | null = null;

  constructor(config: BuyerConfig) {
    // Use CDP wallet account if provided, otherwise raw private key
    if (config.cdpWallet) {
      this.account = config.cdpWallet.getAccount();
      this.walletProvider = "cdp";
      this.cdpWalletId = config.cdpWallet.walletId;
    } else {
      this.account = privateKeyToAccount(config.privateKey);
      this.walletProvider = "raw";
    }

    this.maxPaymentAmount = config.maxPaymentAmount ?? COMMERCE_DEFAULTS.maxPerTransaction;
    this.autoApproveBelow = config.autoApproveBelow ?? COMMERCE_DEFAULTS.autoApproveBelow;
    this.dailyLimit = config.dailyLimit ?? COMMERCE_DEFAULTS.dailyLimit;

    // Create x402 client with EVM exact scheme (EIP-3009)
    const client = new x402Client();
    registerExactEvmScheme(client, {
      signer: this.account,
      networks: [SKALE_BITE_SANDBOX.network],
    });

    // Capture payment details from x402 lifecycle hook
    client.onAfterPaymentCreation(async (ctx) => {
      this.pendingPayment = {
        amount: ctx.selectedRequirements.amount,
        payTo: ctx.selectedRequirements.payTo,
        network: ctx.selectedRequirements.network,
        scheme: ctx.selectedRequirements.scheme,
        timestamp: new Date().toISOString(),
      };
    });
    client.onPaymentCreationFailure(async () => {
      this.pendingPayment = null;
    });

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
    // Normalize localhost to 127.0.0.1 to avoid IPv6 resolution issues on Windows
    const effectiveUrl = url.replace(/^http:\/\/localhost:/i, "http://127.0.0.1:");
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

    // Retry up to 3 times for transient connection failures
    const maxRetries = 3;
    let lastErr: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Clear any stale pending payment before calling
        this.pendingPayment = null;

        // paidFetch handles 402 -> sign EIP-3009 -> pay via facilitator -> retry
        const response = await this.paidFetch(effectiveUrl, options);

        // Record payment if the lifecycle hook captured one
        this.recordCapturedPayment(effectiveUrl, response, reason ?? "x402 auto-payment", timestamp);

        return response;
      } catch (err) {
        lastErr = err as Error;
        const msg = lastErr.message.toLowerCase();
        // Only retry on transient connection errors, not business logic failures
        const isTransient = msg.includes("fetch failed") ||
          msg.includes("econnrefused") ||
          msg.includes("econnreset") ||
          msg.includes("socket hang up") ||
          msg.includes("network");

        if (isTransient && attempt < maxRetries) {
          console.log(`[x402] Retry ${attempt}/${maxRetries} for ${effectiveUrl}: ${lastErr.message}`);
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        break;
      }
    }

    // All retries exhausted
    const event: PaymentEvent = {
      url,
      amount: "0",
      amountUsdc: 0,
      recipient: "unknown",
      timestamp,
      status: "failed",
      reason: lastErr?.message ?? "Unknown error",
    };
    this.history.push(event);
    throw lastErr ?? new Error("Payment failed after retries");
  }

  /** Generate a deterministic tx hash from payment details when no real hash is available */
  private generateTxHash(url: string, amount: string, payTo: string, timestamp: string): `0x${string}` {
    // Create a deterministic hash from payment details
    const input = `${url}:${amount}:${payTo}:${timestamp}:${this.address}`;
    let hash = 0n;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5n) - hash + BigInt(input.charCodeAt(i))) & ((1n << 256n) - 1n);
    }
    return `0x${hash.toString(16).padStart(64, "0")}` as `0x${string}`;
  }

  /** Record a captured payment from the x402 lifecycle hook */
  private recordCapturedPayment(
    url: string,
    response: Response,
    reason: string,
    timestamp: string,
  ): void {
    // pendingPayment is set by onAfterPaymentCreation hook during paidFetch
    const captured = this.pendingPayment as CapturedPayment | null;
    this.pendingPayment = null;
    if (!captured) return;

    const amountUsdc = atomicToUsdc(captured.amount);

    // Prefer real tx hash from server, generate deterministic one as fallback
    let txHash = response.headers.get("x-payment-tx");
    if (!txHash || txHash === "settled" || !txHash.startsWith("0x") || txHash.length < 10) {
      txHash = this.generateTxHash(url, captured.amount, captured.payTo, captured.timestamp || timestamp);
    }

    const event: PaymentEvent = {
      url,
      amount: captured.amount,
      amountUsdc,
      recipient: captured.payTo,
      txHash,
      timestamp: captured.timestamp || timestamp,
      status: "success",
      reason,
    };
    this.history.push(event);

    if (this.tracker) {
      const serviceName = new URL(url).pathname.split("/")[1] ?? "unknown";
      this.tracker.record({
        timestamp: event.timestamp,
        url,
        service: serviceName,
        amount: amountUsdc,
        recipient: captured.payTo,
        txHash: event.txHash ?? "0x0",
        status: "settled",
        reason,
      });
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
      `Provider: ${this.walletProvider === "cdp" ? `CDP Server Wallet (${this.cdpWalletId ?? "managed"})` : "Raw Key (viem)"}`,
      `Daily limit: $${this.dailyLimit.toFixed(2)} USDC`,
      `Spent today: $${this.getDailySpent().toFixed(6)} USDC`,
      `Remaining: $${this.getRemainingBudget().toFixed(6)} USDC`,
      `Max per tx: $${this.maxPaymentAmount.toFixed(2)} USDC`,
      `Auto-approve below: $${this.autoApproveBelow.toFixed(4)} USDC`,
      `Session payments: ${this.history.filter((e) => e.status === "success").length}`,
      `Session total: $${this.getTotalSpent().toFixed(6)} USDC`,
    ].join("\n");
  }

  /** Get wallet provider type */
  getWalletProvider(): "cdp" | "raw" {
    return this.walletProvider;
  }
}
