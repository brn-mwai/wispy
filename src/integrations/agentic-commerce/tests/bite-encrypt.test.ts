import { describe, it, expect } from "vitest";
import { EncryptedCommerce } from "../bite/encrypted-tx.js";
import { evaluateCondition, describeCondition } from "../bite/conditional.js";

describe("BITE v2 Conditional Logic", () => {
  it("should evaluate time_lock (past)", async () => {
    const result = await evaluateCondition({
      type: "time_lock",
      description: "Already past",
      params: { unlockAfter: new Date(Date.now() - 1000).toISOString() },
    });
    expect(result).toBe(true);
  });

  it("should evaluate time_lock (future)", async () => {
    const result = await evaluateCondition({
      type: "time_lock",
      description: "In the future",
      params: { unlockAfter: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(result).toBe(false);
  });

  it("should evaluate manual_trigger (not triggered)", async () => {
    const result = await evaluateCondition({
      type: "manual_trigger",
      description: "Manual",
      params: {},
    });
    expect(result).toBe(false);
  });

  it("should evaluate manual_trigger (triggered)", async () => {
    const result = await evaluateCondition({
      type: "manual_trigger",
      description: "Manual",
      params: { triggeredBy: "0xAdmin" },
    });
    expect(result).toBe(true);
  });

  it("should describe time_lock condition (locked)", () => {
    const desc = describeCondition({
      type: "time_lock",
      description: "Test",
      params: { unlockAfter: new Date(Date.now() + 30_000).toISOString() },
    });
    expect(desc).toContain("remaining");
  });

  it("should describe time_lock condition (unlocked)", () => {
    const desc = describeCondition({
      type: "time_lock",
      description: "Test",
      params: { unlockAfter: new Date(Date.now() - 1000).toISOString() },
    });
    expect(desc).toContain("unlocked");
  });

  it("should describe manual_trigger condition", () => {
    const desc = describeCondition({
      type: "manual_trigger",
      description: "Test",
      params: {},
    });
    expect(desc).toContain("Awaiting manual trigger");
  });
});

describe("EncryptedCommerce", () => {
  it("should encrypt a payment", async () => {
    const commerce = new EncryptedCommerce();
    const payment = await commerce.encryptPayment({
      to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
      data: "0xabcdef",
      condition: {
        type: "manual_trigger",
        description: "Manual trigger for testing",
        params: {},
      },
    });

    expect(payment.id).toMatch(/^bite_/);
    expect(payment.status).toBe("encrypted");
    expect(payment.originalTx.to).toBe("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28");
    expect(payment.timeline).toHaveLength(1);
    expect(payment.timeline[0].event).toBe("encrypted");
  });

  it("should not execute when condition is not met", async () => {
    const commerce = new EncryptedCommerce();
    const payment = await commerce.encryptPayment({
      to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
      data: "0xabcdef",
      condition: {
        type: "manual_trigger",
        description: "Not triggered",
        params: {},
      },
    });

    const result = await commerce.executeIfConditionMet(payment.id);
    expect(result.status).toBe("encrypted");
    expect(result.txHash).toBeUndefined();
  });

  it("should execute when time_lock expires", async () => {
    const commerce = new EncryptedCommerce();
    const payment = await commerce.encryptPayment({
      to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
      data: "0xabcdef",
      condition: {
        type: "time_lock",
        description: "Immediate unlock",
        params: { unlockAfter: new Date(Date.now() - 1000).toISOString() },
      },
    });

    const result = await commerce.executeIfConditionMet(payment.id);
    expect(result.status).toBe("executed");
    expect(result.txHash).toBeTruthy();
    expect(result.decryptedData).toBeTruthy();
  });

  it("should generate a lifecycle report", async () => {
    const commerce = new EncryptedCommerce();
    const payment = await commerce.encryptPayment({
      to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
      data: "0xabcdef",
      condition: {
        type: "time_lock",
        description: "Test lock",
        params: { unlockAfter: new Date(Date.now() - 1000).toISOString() },
      },
    });

    const report = commerce.getReport(payment.id);
    expect(report).toContain("BITE v2 Encrypted Payment Report");
    expect(report).toContain(payment.id);
    expect(report).toContain("encrypted");
  });

  it("should list all payments", async () => {
    const commerce = new EncryptedCommerce();
    await commerce.encryptPayment({
      to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
      data: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001",
      condition: { type: "manual_trigger", description: "a", params: {} },
    });
    await commerce.encryptPayment({
      to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
      data: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000002",
      condition: { type: "manual_trigger", description: "b", params: {} },
    });

    expect(commerce.getAllPayments()).toHaveLength(2);
  });
});
