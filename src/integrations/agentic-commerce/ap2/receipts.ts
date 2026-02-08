/**
 * AP2 Payment Receipts and Transaction Records.
 *
 * Generates structured proof-of-payment with full mandate chain
 * for audit trail and Track 3 judging.
 */

import { randomUUID } from "node:crypto";
import type {
  IntentMandate,
  CartMandate,
  PaymentMandate,
} from "./mandates.js";

// ─── Receipt Types ──────────────────────────────────────────

export interface PaymentReceipt {
  id: string;
  paymentMandateId: string;
  cartMandateId: string;
  intentMandateId: string;
  txHash: string;
  blockNumber?: number;
  network: string;
  amount: string;
  currency: string;
  payer: string;
  payee: string;
  status: "success" | "failed" | "error";
  errorMessage?: string;
  settledAt: string;
  deliveryConfirmed: boolean;
  deliveryData?: unknown;
}

/** Timeline event for audit trail */
export interface TimelineEvent {
  event: string;
  timestamp: string;
  actor: string;
  details?: string;
}

/** Full AP2 transaction record — all mandates + receipt + timeline */
export interface AP2TransactionRecord {
  intent: IntentMandate;
  cart: CartMandate;
  payment: PaymentMandate;
  receipt: PaymentReceipt;
  timeline: TimelineEvent[];
}

// ─── Factory Functions ──────────────────────────────────────

export interface SettlementInfo {
  txHash: string;
  blockNumber?: number;
  success: boolean;
  errorMessage?: string;
  deliveryData?: unknown;
}

/** Create a PaymentReceipt from settlement result */
export function createReceipt(
  mandate: PaymentMandate,
  settlement: SettlementInfo,
): PaymentReceipt {
  return {
    id: `receipt_${randomUUID()}`,
    paymentMandateId: mandate.id,
    cartMandateId: mandate.cartId,
    intentMandateId: mandate.intentId,
    txHash: settlement.txHash,
    blockNumber: settlement.blockNumber,
    network: mandate.network,
    amount: mandate.amount,
    currency: mandate.currency,
    payer: mandate.payerAddress,
    payee: mandate.payeeAddress,
    status: settlement.success ? "success" : "failed",
    errorMessage: settlement.errorMessage,
    settledAt: new Date().toISOString(),
    deliveryConfirmed: settlement.success && !!settlement.deliveryData,
    deliveryData: settlement.deliveryData,
  };
}

/** Build a complete AP2 transaction record with timeline */
export function buildTransactionRecord(
  intent: IntentMandate,
  cart: CartMandate,
  payment: PaymentMandate,
  receipt: PaymentReceipt,
): AP2TransactionRecord {
  const timeline: TimelineEvent[] = [
    {
      event: "intent_created",
      timestamp: intent.createdAt,
      actor: intent.agentId,
      details: `Agent wants: "${intent.description}" (max $${intent.maxBudget} USDC)`,
    },
    {
      event: "cart_received",
      timestamp: cart.createdAt,
      actor: cart.merchantName,
      details: `${cart.items.length} item(s), total: $${cart.total} USDC`,
    },
    {
      event: "payment_authorized",
      timestamp: payment.authorizedAt,
      actor: payment.authorizedBy,
      details: `$${payment.amount} USDC on ${payment.network}`,
    },
    {
      event: receipt.status === "success" ? "payment_settled" : "payment_failed",
      timestamp: receipt.settledAt,
      actor: "facilitator",
      details: receipt.status === "success"
        ? `tx: ${receipt.txHash}`
        : `Error: ${receipt.errorMessage}`,
    },
  ];

  if (receipt.deliveryConfirmed) {
    timeline.push({
      event: "delivery_confirmed",
      timestamp: new Date().toISOString(),
      actor: intent.agentId,
      details: "Service delivered data successfully",
    });
  }

  return { intent, cart, payment, receipt, timeline };
}

/** Format a transaction record as structured JSON */
export function formatReceiptJSON(record: AP2TransactionRecord): string {
  return JSON.stringify(record, null, 2);
}

/** Format a transaction record as human-readable markdown */
export function formatReceiptMarkdown(record: AP2TransactionRecord): string {
  const lines: string[] = [
    `## AP2 Transaction Record`,
    ``,
    `### Intent`,
    `- **ID:** \`${record.intent.id}\``,
    `- **Agent:** \`${record.intent.agentId}\``,
    `- **Description:** ${record.intent.description}`,
    `- **Max Budget:** $${record.intent.maxBudget} USDC`,
    `- **Created:** ${record.intent.createdAt}`,
    ``,
    `### Cart`,
    `- **ID:** \`${record.cart.id}\``,
    `- **Merchant:** ${record.cart.merchantName} (\`${record.cart.merchantAddress.slice(0, 10)}...\`)`,
    `- **Items:**`,
  ];

  for (const item of record.cart.items) {
    lines.push(`  - ${item.name}: $${item.price} USDC x${item.quantity} — ${item.description}`);
  }
  lines.push(`- **Total:** $${record.cart.total} USDC`);
  lines.push(``);

  lines.push(`### Payment Authorization`);
  lines.push(`- **ID:** \`${record.payment.id}\``);
  lines.push(`- **Payer:** \`${record.payment.payerAddress.slice(0, 10)}...\``);
  lines.push(`- **Payee:** \`${record.payment.payeeAddress.slice(0, 10)}...\``);
  lines.push(`- **Amount:** $${record.payment.amount} USDC`);
  lines.push(`- **Network:** ${record.payment.network}`);
  lines.push(`- **Authorized by:** \`${record.payment.authorizedBy.slice(0, 10)}...\``);
  lines.push(``);

  lines.push(`### Receipt`);
  lines.push(`- **ID:** \`${record.receipt.id}\``);
  lines.push(`- **Status:** ${record.receipt.status === "success" ? "Settled" : "FAILED"}`);
  lines.push(`- **Tx Hash:** \`${record.receipt.txHash}\``);
  if (record.receipt.blockNumber) {
    lines.push(`- **Block:** ${record.receipt.blockNumber}`);
  }
  lines.push(`- **Settled at:** ${record.receipt.settledAt}`);
  lines.push(`- **Delivery confirmed:** ${record.receipt.deliveryConfirmed ? "Yes" : "No"}`);
  if (record.receipt.errorMessage) {
    lines.push(`- **Error:** ${record.receipt.errorMessage}`);
  }
  lines.push(``);

  lines.push(`### Timeline`);
  for (const event of record.timeline) {
    lines.push(`1. **${event.event}** (${event.timestamp.slice(11, 19)}) — ${event.actor}`);
    if (event.details) {
      lines.push(`   ${event.details}`);
    }
  }

  return lines.join("\n");
}
