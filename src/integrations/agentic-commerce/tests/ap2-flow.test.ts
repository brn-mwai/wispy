import { describe, it, expect } from "vitest";
import {
  createIntentMandate,
  createCartMandate,
  createPaymentMandate,
} from "../ap2/mandates.js";
import {
  createReceipt,
  buildTransactionRecord,
  formatReceiptMarkdown,
  formatReceiptJSON,
} from "../ap2/receipts.js";

describe("AP2 Mandates", () => {
  it("should create an IntentMandate", () => {
    const intent = createIntentMandate({
      agentId: "0xAgent",
      description: "Weather data for Nairobi",
      maxBudget: "0.001",
      signedBy: "0xAgent",
    });

    expect(intent.id).toMatch(/^intent_/);
    expect(intent.agentId).toBe("0xAgent");
    expect(intent.description).toBe("Weather data for Nairobi");
    expect(intent.maxBudget).toBe("0.001");
    expect(intent.currency).toBe("USDC");
    expect(intent.createdAt).toBeTruthy();
  });

  it("should create a CartMandate from an intent", () => {
    const intent = createIntentMandate({
      agentId: "0xAgent",
      description: "Test",
      maxBudget: "0.01",
      signedBy: "0xAgent",
    });

    const cart = createCartMandate(intent, {
      merchantAddress: "0xMerchant",
      merchantName: "Test Shop",
      items: [
        { name: "API call", description: "Weather data", price: "0.001", quantity: 1 },
      ],
    });

    expect(cart.id).toMatch(/^cart_/);
    expect(cart.intentId).toBe(intent.id);
    expect(cart.merchantName).toBe("Test Shop");
    expect(cart.total).toBe("0.001000");
    expect(cart.items).toHaveLength(1);
  });

  it("should calculate cart total from multiple items", () => {
    const intent = createIntentMandate({
      agentId: "0xAgent",
      description: "Test",
      maxBudget: "1",
      signedBy: "0xAgent",
    });

    const cart = createCartMandate(intent, {
      merchantAddress: "0xMerchant",
      merchantName: "Shop",
      items: [
        { name: "A", description: "a", price: "0.001", quantity: 2 },
        { name: "B", description: "b", price: "0.003", quantity: 1 },
      ],
    });

    expect(parseFloat(cart.total)).toBeCloseTo(0.005, 6);
  });

  it("should create a PaymentMandate from a cart", () => {
    const intent = createIntentMandate({
      agentId: "0xAgent",
      description: "Test",
      maxBudget: "0.01",
      signedBy: "0xAgent",
    });

    const cart = createCartMandate(intent, {
      merchantAddress: "0xMerchant",
      merchantName: "Shop",
      items: [{ name: "A", description: "a", price: "0.001", quantity: 1 }],
    });

    const payment = createPaymentMandate(cart, "0xPayer");

    expect(payment.id).toMatch(/^payment_/);
    expect(payment.cartId).toBe(cart.id);
    expect(payment.intentId).toBe(intent.id);
    expect(payment.payerAddress).toBe("0xPayer");
    expect(payment.payeeAddress).toBe("0xMerchant");
    expect(payment.currency).toBe("USDC");
    expect(payment.network).toContain("eip155");
  });
});

describe("AP2 Receipts", () => {
  it("should create a success receipt", () => {
    const intent = createIntentMandate({ agentId: "0xA", description: "T", maxBudget: "0.01", signedBy: "0xA" });
    const cart = createCartMandate(intent, {
      merchantAddress: "0xM",
      merchantName: "S",
      items: [{ name: "I", description: "d", price: "0.001", quantity: 1 }],
    });
    const payment = createPaymentMandate(cart, "0xP");

    const receipt = createReceipt(payment, {
      txHash: "0xabc123",
      success: true,
      deliveryData: { data: "test" },
    });

    expect(receipt.id).toMatch(/^receipt_/);
    expect(receipt.status).toBe("success");
    expect(receipt.txHash).toBe("0xabc123");
    expect(receipt.deliveryConfirmed).toBe(true);
  });

  it("should create a failed receipt", () => {
    const intent = createIntentMandate({ agentId: "0xA", description: "T", maxBudget: "0.01", signedBy: "0xA" });
    const cart = createCartMandate(intent, {
      merchantAddress: "0xM",
      merchantName: "S",
      items: [{ name: "I", description: "d", price: "0.001", quantity: 1 }],
    });
    const payment = createPaymentMandate(cart, "0xP");

    const receipt = createReceipt(payment, {
      txHash: "0x0",
      success: false,
      errorMessage: "Authorization denied",
    });

    expect(receipt.status).toBe("failed");
    expect(receipt.errorMessage).toBe("Authorization denied");
    expect(receipt.deliveryConfirmed).toBe(false);
  });

  it("should build a transaction record with timeline", () => {
    const intent = createIntentMandate({ agentId: "0xA", description: "T", maxBudget: "0.01", signedBy: "0xA" });
    const cart = createCartMandate(intent, {
      merchantAddress: "0xM",
      merchantName: "S",
      items: [{ name: "I", description: "d", price: "0.001", quantity: 1 }],
    });
    const payment = createPaymentMandate(cart, "0xP");
    const receipt = createReceipt(payment, { txHash: "0xabc", success: true });

    const record = buildTransactionRecord(intent, cart, payment, receipt);

    expect(record.intent).toBe(intent);
    expect(record.cart).toBe(cart);
    expect(record.payment).toBe(payment);
    expect(record.receipt).toBe(receipt);
    expect(record.timeline.length).toBeGreaterThanOrEqual(4);
    expect(record.timeline[0].event).toBe("intent_created");
  });

  it("should format receipt as markdown", () => {
    const intent = createIntentMandate({ agentId: "0xA", description: "Weather", maxBudget: "0.01", signedBy: "0xA" });
    const cart = createCartMandate(intent, {
      merchantAddress: "0xM",
      merchantName: "WeatherCo",
      items: [{ name: "API", description: "data", price: "0.001", quantity: 1 }],
    });
    const payment = createPaymentMandate(cart, "0xP");
    const receipt = createReceipt(payment, { txHash: "0xabc", success: true });
    const record = buildTransactionRecord(intent, cart, payment, receipt);

    const md = formatReceiptMarkdown(record);
    expect(md).toContain("AP2 Transaction Record");
    expect(md).toContain("WeatherCo");
    expect(md).toContain("intent_created");
  });

  it("should format receipt as JSON", () => {
    const intent = createIntentMandate({ agentId: "0xA", description: "T", maxBudget: "0.01", signedBy: "0xA" });
    const cart = createCartMandate(intent, {
      merchantAddress: "0xM",
      merchantName: "S",
      items: [{ name: "I", description: "d", price: "0.001", quantity: 1 }],
    });
    const payment = createPaymentMandate(cart, "0xP");
    const receipt = createReceipt(payment, { txHash: "0xabc", success: true });
    const record = buildTransactionRecord(intent, cart, payment, receipt);

    const json = formatReceiptJSON(record);
    const parsed = JSON.parse(json);
    expect(parsed.intent.id).toBe(intent.id);
    expect(parsed.receipt.status).toBe("success");
  });
});
