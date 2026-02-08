import { describe, it, expect, beforeEach } from "vitest";
import { SpendTracker } from "../x402/tracker.js";

describe("SpendTracker", () => {
  let tracker: SpendTracker;

  beforeEach(() => {
    tracker = new SpendTracker("0x1234567890abcdef1234567890abcdef12345678", 10.0);
  });

  it("should record a payment event", () => {
    const record = tracker.record({
      timestamp: new Date().toISOString(),
      url: "http://localhost:4021/weather",
      service: "weather",
      amount: 0.001,
      recipient: "0xabcdef",
      txHash: "0x123",
      status: "settled",
      reason: "Weather data",
    });

    expect(record.id).toBeTruthy();
    expect(record.amount).toBe(0.001);
    expect(tracker.getRecords()).toHaveLength(1);
  });

  it("should calculate total spent", () => {
    const today = new Date().toISOString();
    tracker.record({
      timestamp: today,
      url: "http://localhost:4021/weather",
      service: "weather",
      amount: 0.001,
      recipient: "0xaaa",
      txHash: "0x1",
      status: "settled",
      reason: "Test",
    });
    tracker.record({
      timestamp: today,
      url: "http://localhost:4022/analyze",
      service: "sentiment",
      amount: 0.002,
      recipient: "0xbbb",
      txHash: "0x2",
      status: "settled",
      reason: "Test",
    });

    expect(tracker.getTotalSpent()).toBeCloseTo(0.003, 6);
  });

  it("should not count failed payments in total", () => {
    tracker.record({
      timestamp: new Date().toISOString(),
      url: "http://localhost:4021/weather",
      service: "weather",
      amount: 0.001,
      recipient: "0xaaa",
      txHash: "0x1",
      status: "settled",
      reason: "Test",
    });
    tracker.record({
      timestamp: new Date().toISOString(),
      url: "http://localhost:4022/analyze",
      service: "sentiment",
      amount: 0.002,
      recipient: "0xbbb",
      txHash: "0x2",
      status: "failed",
      reason: "Test",
    });

    expect(tracker.getTotalSpent()).toBeCloseTo(0.001, 6);
  });

  it("should aggregate by recipient", () => {
    const ts = new Date().toISOString();
    tracker.record({ timestamp: ts, url: "a", service: "a", amount: 0.001, recipient: "0xA", txHash: "0x1", status: "settled", reason: "r" });
    tracker.record({ timestamp: ts, url: "b", service: "b", amount: 0.002, recipient: "0xA", txHash: "0x2", status: "settled", reason: "r" });
    tracker.record({ timestamp: ts, url: "c", service: "c", amount: 0.003, recipient: "0xB", txHash: "0x3", status: "settled", reason: "r" });

    const byRecipient = tracker.getByRecipient();
    expect(byRecipient.get("0xA")).toBeCloseTo(0.003, 6);
    expect(byRecipient.get("0xB")).toBeCloseTo(0.003, 6);
  });

  it("should aggregate by service", () => {
    const ts = new Date().toISOString();
    tracker.record({ timestamp: ts, url: "a", service: "weather", amount: 0.001, recipient: "0xA", txHash: "0x1", status: "settled", reason: "r" });
    tracker.record({ timestamp: ts, url: "b", service: "weather", amount: 0.001, recipient: "0xA", txHash: "0x2", status: "settled", reason: "r" });
    tracker.record({ timestamp: ts, url: "c", service: "sentiment", amount: 0.002, recipient: "0xA", txHash: "0x3", status: "settled", reason: "r" });

    const byService = tracker.getByService();
    expect(byService.get("weather")).toBeCloseTo(0.002, 6);
    expect(byService.get("sentiment")).toBeCloseTo(0.002, 6);
  });

  it("should generate an audit report", () => {
    const ts = new Date().toISOString();
    tracker.record({ timestamp: ts, url: "a", service: "weather", amount: 0.001, recipient: "0xA", txHash: "0x1", status: "settled", reason: "r" });

    const report = tracker.getReport();
    expect(report.agentAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(report.totalSpent).toBeCloseTo(0.001, 6);
    expect(report.totalTransactions).toBe(1);
    expect(report.dailyLimit).toBe(10.0);
    expect(report.budgetRemaining).toBeCloseTo(9.999, 3);
  });

  it("should format report as markdown", () => {
    const ts = new Date().toISOString();
    tracker.record({ timestamp: ts, url: "a", service: "weather", amount: 0.001, recipient: "0xA", txHash: "0x1", status: "settled", reason: "r" });

    const md = tracker.formatReport();
    expect(md).toContain("x402 Spend Audit Report");
    expect(md).toContain("weather");
  });

  it("should export as JSON", () => {
    const ts = new Date().toISOString();
    tracker.record({ timestamp: ts, url: "a", service: "weather", amount: 0.001, recipient: "0xA", txHash: "0x1", status: "settled", reason: "r" });

    const json = tracker.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.totalSpent).toBeCloseTo(0.001, 6);
    expect(parsed.records).toHaveLength(1);
  });
});
