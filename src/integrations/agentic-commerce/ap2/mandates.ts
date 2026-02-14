/**
 * AP2 (Agent Payment Protocol) Mandate types and factory functions.
 *
 * AP2 is Google's structured authorization flow for agent payments:
 * IntentMandate  -> What the agent wants to buy
 * CartMandate    -> What the merchant offers
 * PaymentMandate -> Authorization to pay
 */

import { randomUUID, createHash } from "node:crypto";
import { SKALE_BITE_SANDBOX } from "../config.js";
import { privateKeyToAccount } from "viem/accounts";

// ─── Mandate Types ──────────────────────────────────────────

/** What the agent wants to buy (signed by agent/user) */
export interface IntentMandate {
  id: string;
  agentId: string;
  description: string;
  merchants?: string[];
  maxBudget: string;
  currency: string;
  expiry: string;
  requiresConfirmation: boolean;
  signedBy: string;
  signature?: string;
  createdAt: string;
}

/** What the merchant offers at what price (signed by merchant) */
export interface CartMandate {
  id: string;
  intentId: string;
  merchantAddress: string;
  merchantName: string;
  items: Array<{
    name: string;
    description: string;
    price: string;
    quantity: number;
  }>;
  total: string;
  expiry: string;
  signedBy: string;
  signature?: string;
  createdAt: string;
}

/** Authorization to execute payment (signed by credentials provider) */
export interface PaymentMandate {
  id: string;
  cartId: string;
  intentId: string;
  payerAddress: string;
  payeeAddress: string;
  amount: string;
  currency: string;
  network: string;
  authorizedBy: string;
  authorizedAt: string;
  signature?: string;
  createdAt: string;
}

// ─── Mandate Signing ────────────────────────────────────────

/** Hash a mandate's core fields into a deterministic digest for signing. */
function mandateDigest(fields: Record<string, unknown>): string {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Sign an IntentMandate with the agent wallet (viem account).
 * Populates the `signature` field with an EIP-191 personal message signature.
 */
export async function signIntentMandate(
  mandate: IntentMandate,
  privateKey: string,
): Promise<IntentMandate> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const digest = mandateDigest({
    id: mandate.id,
    agentId: mandate.agentId,
    description: mandate.description,
    maxBudget: mandate.maxBudget,
    currency: mandate.currency,
    expiry: mandate.expiry,
  });

  const signature = await account.signMessage({ message: digest });
  return { ...mandate, signature, signedBy: account.address };
}

/**
 * Sign a CartMandate with the merchant wallet.
 */
export async function signCartMandate(
  mandate: CartMandate,
  privateKey: string,
): Promise<CartMandate> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const digest = mandateDigest({
    id: mandate.id,
    intentId: mandate.intentId,
    total: mandate.total,
    merchantAddress: mandate.merchantAddress,
    expiry: mandate.expiry,
  });

  const signature = await account.signMessage({ message: digest });
  return { ...mandate, signature, signedBy: account.address };
}

/**
 * Sign a PaymentMandate with the payer wallet (authorization to pay).
 */
export async function signPaymentMandate(
  mandate: PaymentMandate,
  privateKey: string,
): Promise<PaymentMandate> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const digest = mandateDigest({
    id: mandate.id,
    cartId: mandate.cartId,
    intentId: mandate.intentId,
    amount: mandate.amount,
    currency: mandate.currency,
    payerAddress: mandate.payerAddress,
    payeeAddress: mandate.payeeAddress,
    network: mandate.network,
  });

  const signature = await account.signMessage({ message: digest });
  return { ...mandate, signature, authorizedBy: account.address };
}

// ─── Factory Functions ──────────────────────────────────────

export interface CreateIntentParams {
  agentId: string;
  description: string;
  maxBudget: string;
  merchants?: string[];
  requiresConfirmation?: boolean;
  signedBy: string;
}

/** Create an IntentMandate — agent declares what it wants to buy */
export function createIntentMandate(params: CreateIntentParams): IntentMandate {
  const now = new Date();
  return {
    id: `intent_${randomUUID()}`,
    agentId: params.agentId,
    description: params.description,
    merchants: params.merchants,
    maxBudget: params.maxBudget,
    currency: "USDC",
    expiry: new Date(now.getTime() + 30 * 60_000).toISOString(), // 30 min
    requiresConfirmation: params.requiresConfirmation ?? false,
    signedBy: params.signedBy,
    createdAt: now.toISOString(),
  };
}

export interface CreateCartParams {
  merchantAddress: string;
  merchantName: string;
  items: Array<{
    name: string;
    description: string;
    price: string;
    quantity: number;
  }>;
}

/** Create a CartMandate — merchant responds with pricing */
export function createCartMandate(
  intent: IntentMandate,
  merchant: CreateCartParams,
): CartMandate {
  const total = merchant.items
    .reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0)
    .toFixed(6);

  return {
    id: `cart_${randomUUID()}`,
    intentId: intent.id,
    merchantAddress: merchant.merchantAddress,
    merchantName: merchant.merchantName,
    items: merchant.items,
    total,
    expiry: new Date(Date.now() + 5 * 60_000).toISOString(), // 5 min
    signedBy: merchant.merchantAddress,
    createdAt: new Date().toISOString(),
  };
}

/** Create a PaymentMandate — authorization to execute payment */
export function createPaymentMandate(
  cart: CartMandate,
  payerAddress: string,
): PaymentMandate {
  return {
    id: `payment_${randomUUID()}`,
    cartId: cart.id,
    intentId: cart.intentId,
    payerAddress,
    payeeAddress: cart.merchantAddress,
    amount: cart.total,
    currency: "USDC",
    network: SKALE_BITE_SANDBOX.network,
    authorizedBy: payerAddress,
    authorizedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}
