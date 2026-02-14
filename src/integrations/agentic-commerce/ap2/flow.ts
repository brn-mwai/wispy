/**
 * AP2 Flow Orchestrator — runs the full Agent Payment Protocol sequence:
 * Intent -> Cart -> Authorization -> Settlement -> Receipt
 *
 * Also supports simulating failures for Track 3 judging.
 */

import {
  createIntentMandate,
  createCartMandate,
  createPaymentMandate,
  signIntentMandate,
  signCartMandate,
  signPaymentMandate,
} from "./mandates.js";
import type { IntentMandate, CartMandate, PaymentMandate } from "./mandates.js";
import {
  createReceipt,
  buildTransactionRecord,
  formatReceiptMarkdown,
  formatReceiptJSON,
} from "./receipts.js";
import type { AP2TransactionRecord, PaymentReceipt } from "./receipts.js";
import type { X402Buyer } from "../x402/buyer.js";
import type { SpendTracker } from "../x402/tracker.js";

// ─── Types ──────────────────────────────────────────────────

export interface PurchaseParams {
  description: string;
  serviceUrl: string;
  merchantAddress: string;
  merchantName: string;
  expectedPrice: string;
  requiresConfirmation?: boolean;
}

export type FailureReason =
  | "authorization_denied"
  | "insufficient_funds"
  | "expired";

// ─── Flow Orchestrator ──────────────────────────────────────

export class AP2Flow {
  private readonly buyer: X402Buyer;
  private readonly tracker: SpendTracker;
  private readonly privateKey?: string;
  private readonly records: AP2TransactionRecord[] = [];

  constructor(buyer: X402Buyer, tracker: SpendTracker, privateKey?: string) {
    this.buyer = buyer;
    this.tracker = tracker;
    this.privateKey = privateKey;
  }

  /**
   * Execute a full AP2 purchase flow.
   * Follows the exact mandate chain: intent -> cart -> payment -> settlement -> receipt.
   */
  async purchase(params: PurchaseParams): Promise<AP2TransactionRecord> {
    console.log(`\n[AP2] === Starting AP2 Purchase Flow ===`);
    console.log(`[AP2] Description: ${params.description}`);

    // Step 1: Create IntentMandate (signed if private key available)
    console.log(`[AP2] Step 1: Creating IntentMandate...`);
    let intent = createIntentMandate({
      agentId: this.buyer.address,
      description: params.description,
      maxBudget: params.expectedPrice,
      merchants: [params.merchantAddress],
      requiresConfirmation: params.requiresConfirmation,
      signedBy: this.buyer.address,
    });
    if (this.privateKey) {
      intent = await signIntentMandate(intent, this.privateKey);
      console.log(`[AP2] Intent signed: ${intent.signature?.slice(0, 20)}...`);
    }
    console.log(`[AP2] Intent created: ${intent.id}`);

    // Step 2: Simulate merchant cart response
    console.log(`[AP2] Step 2: Requesting cart from merchant...`);
    const serviceName = new URL(params.serviceUrl).pathname.split("/")[1] ?? "service";
    const cart = createCartMandate(intent, {
      merchantAddress: params.merchantAddress,
      merchantName: params.merchantName,
      items: [
        {
          name: `${serviceName} API call`,
          description: params.description,
          price: params.expectedPrice,
          quantity: 1,
        },
      ],
    });
    console.log(`[AP2] Cart received: ${cart.id} (total: $${cart.total} USDC)`);

    // Step 3: Check commerce policy and create PaymentMandate
    console.log(`[AP2] Step 3: Authorizing payment...`);
    const budgetOk = this.buyer.getRemainingBudget() >= parseFloat(cart.total);
    if (!budgetOk) {
      return this.createFailedRecord(
        intent,
        cart,
        "insufficient_funds",
        `Insufficient budget: need $${cart.total}, have $${this.buyer.getRemainingBudget().toFixed(6)}`,
      );
    }

    let payment = createPaymentMandate(cart, this.buyer.address);
    if (this.privateKey) {
      payment = await signPaymentMandate(payment, this.privateKey);
      console.log(`[AP2] Payment signed: ${payment.signature?.slice(0, 20)}...`);
    }
    console.log(`[AP2] Payment authorized: ${payment.id}`);

    // Step 4: Execute x402 payment via buyer
    console.log(`[AP2] Step 4: Settling payment via x402...`);
    let receipt: PaymentReceipt;
    try {
      const response = await this.buyer.payAndFetch(
        params.serviceUrl,
        undefined,
        `AP2: ${params.description}`,
      );

      // Extract delivery data
      let deliveryData: unknown = null;
      try {
        deliveryData = await response.json();
      } catch {
        deliveryData = await response.text();
      }

      // Get tx hash from payment history
      const lastPayment = this.buyer.getPaymentHistory().at(-1);
      receipt = createReceipt(payment, {
        txHash: lastPayment?.txHash ?? "0x0",
        success: true,
        deliveryData,
      });
      console.log(`[AP2] Settlement complete: tx=${receipt.txHash.slice(0, 16)}...`);

      // Record in spend tracker with AP2 references
      this.tracker.record({
        timestamp: new Date().toISOString(),
        url: params.serviceUrl,
        service: params.merchantName,
        amount: parseFloat(cart.total),
        recipient: params.merchantAddress,
        txHash: receipt.txHash,
        status: "settled",
        reason: `AP2: ${params.description}`,
        ap2: {
          intentId: intent.id,
          cartId: cart.id,
          paymentId: payment.id,
        },
      });
    } catch (err) {
      receipt = createReceipt(payment, {
        txHash: "0x0",
        success: false,
        errorMessage: (err as Error).message,
      });
      console.log(`[AP2] Settlement FAILED: ${(err as Error).message}`);
    }

    // Step 5: Build full transaction record
    const record = buildTransactionRecord(intent, cart, payment, receipt);
    this.records.push(record);
    console.log(`[AP2] === Flow Complete (${receipt.status}) ===\n`);
    return record;
  }

  /**
   * Execute a failing AP2 flow (for Track 3 demo — shows graceful failure handling).
   */
  async purchaseWithFailure(params: {
    description: string;
    serviceUrl: string;
    failureReason: FailureReason;
  }): Promise<AP2TransactionRecord> {
    console.log(`\n[AP2] === Starting AP2 Failure Flow (${params.failureReason}) ===`);

    const intent = createIntentMandate({
      agentId: this.buyer.address,
      description: params.description,
      maxBudget: "0.001",
      signedBy: this.buyer.address,
    });

    const cart = createCartMandate(intent, {
      merchantAddress: "0x0000000000000000000000000000000000000000",
      merchantName: "Test Merchant",
      items: [
        {
          name: "Test item",
          description: params.description,
          price: "0.001",
          quantity: 1,
        },
      ],
    });

    const errorMessages: Record<FailureReason, string> = {
      authorization_denied:
        "Payment authorization denied: amount exceeds agent's approved spending limit",
      insufficient_funds:
        "Insufficient funds: wallet balance is below required amount",
      expired:
        "Intent mandate expired: TTL exceeded before merchant responded",
    };

    return this.createFailedRecord(
      intent,
      cart,
      params.failureReason,
      errorMessages[params.failureReason],
    );
  }

  /** Get all transaction records */
  getRecords(): AP2TransactionRecord[] {
    return [...this.records];
  }

  /** Format all records as a complete audit trail */
  formatAuditTrail(format: "json" | "markdown" = "markdown"): string {
    if (this.records.length === 0) return "No AP2 transactions recorded.";

    if (format === "json") {
      return JSON.stringify(this.records, null, 2);
    }

    const lines: string[] = [
      `# AP2 Audit Trail`,
      ``,
      `**Agent:** \`${this.buyer.address}\``,
      `**Total transactions:** ${this.records.length}`,
      `**Successful:** ${this.records.filter((r) => r.receipt.status === "success").length}`,
      `**Failed:** ${this.records.filter((r) => r.receipt.status !== "success").length}`,
      ``,
    ];

    for (let i = 0; i < this.records.length; i++) {
      lines.push(`---`);
      lines.push(`### Transaction ${i + 1}`);
      lines.push(formatReceiptMarkdown(this.records[i]));
      lines.push(``);
    }

    return lines.join("\n");
  }

  /** Internal: create a failed transaction record */
  private createFailedRecord(
    intent: IntentMandate,
    cart: CartMandate,
    failureReason: string,
    errorMessage: string,
  ): AP2TransactionRecord {
    const payment = createPaymentMandate(cart, this.buyer.address);

    const receipt = createReceipt(payment, {
      txHash: "0x0",
      success: false,
      errorMessage,
    });

    const record = buildTransactionRecord(intent, cart, payment, receipt);
    // Add failure event to timeline
    record.timeline.push({
      event: "failure_handled",
      timestamp: new Date().toISOString(),
      actor: "agent",
      details: `Graceful failure: ${failureReason} — ${errorMessage}`,
    });

    this.records.push(record);
    console.log(`[AP2] === Flow Failed Gracefully (${failureReason}) ===\n`);
    return record;
  }
}
