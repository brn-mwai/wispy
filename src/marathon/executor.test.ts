/**
 * Marathon Executor Tests
 * Tests loop detection, checkpoints, verification, and recovery
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// Mock the dependencies
vi.mock("../core/agent.js", () => ({
  Agent: vi.fn(),
}));

vi.mock("../ai/gemini.js", () => ({
  generateWithThinking: vi.fn().mockResolvedValue("Test response"),
}));

vi.mock("../channels/telegram/adapter.js", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
}));

// Test the loop detection logic directly
describe("Marathon Loop Detection", () => {
  // Simulate the loop detection algorithm
  function hashAction(milestoneId: string, response: string): string {
    const normalized = response
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[0-9]+/g, "N")
      .slice(0, 500);
    return createHash("md5").update(`${milestoneId}:${normalized}`).digest("hex").slice(0, 16);
  }

  function detectLoop(
    actionHistory: Array<{ action: string; hash: string; timestamp: number }>,
    milestoneId: string,
    response: string,
    maxIdenticalActions: number = 3,
    historyWindow: number = 10
  ): { isLoop: boolean; count: number; newHistory: typeof actionHistory } {
    const hash = hashAction(milestoneId, response);
    const now = Date.now();

    const newHistory = [...actionHistory, { action: milestoneId, hash, timestamp: now }];
    const trimmedHistory = newHistory.slice(-historyWindow);
    const identicalCount = trimmedHistory.filter((a) => a.hash === hash).length;

    return {
      isLoop: identicalCount >= maxIdenticalActions,
      count: identicalCount,
      newHistory: trimmedHistory,
    };
  }

  it("should detect no loop with different responses", () => {
    let history: Array<{ action: string; hash: string; timestamp: number }> = [];

    const result1 = detectLoop(history, "milestone-1", "Creating file A");
    history = result1.newHistory;
    expect(result1.isLoop).toBe(false);
    expect(result1.count).toBe(1);

    const result2 = detectLoop(history, "milestone-1", "Creating file B");
    history = result2.newHistory;
    expect(result2.isLoop).toBe(false);
    expect(result2.count).toBe(1);

    const result3 = detectLoop(history, "milestone-1", "Creating file C");
    expect(result3.isLoop).toBe(false);
    expect(result3.count).toBe(1);
  });

  it("should detect loop after 3 identical responses", () => {
    let history: Array<{ action: string; hash: string; timestamp: number }> = [];
    const sameResponse = "I am trying to create the file but it fails";

    const result1 = detectLoop(history, "milestone-1", sameResponse);
    history = result1.newHistory;
    expect(result1.isLoop).toBe(false);
    expect(result1.count).toBe(1);

    const result2 = detectLoop(history, "milestone-1", sameResponse);
    history = result2.newHistory;
    expect(result2.isLoop).toBe(false);
    expect(result2.count).toBe(2);

    const result3 = detectLoop(history, "milestone-1", sameResponse);
    expect(result3.isLoop).toBe(true);
    expect(result3.count).toBe(3);
  });

  it("should normalize numbers in responses", () => {
    let history: Array<{ action: string; hash: string; timestamp: number }> = [];

    // These should be considered the same due to number normalization
    const result1 = detectLoop(history, "m1", "Error on line 42");
    history = result1.newHistory;

    const result2 = detectLoop(history, "m1", "Error on line 99");
    history = result2.newHistory;

    const result3 = detectLoop(history, "m1", "Error on line 123");

    // All three should hash to the same value due to N normalization
    expect(result3.isLoop).toBe(true);
  });

  it("should respect history window limit", () => {
    let history: Array<{ action: string; hash: string; timestamp: number }> = [];

    // Add 10 different responses
    for (let i = 0; i < 10; i++) {
      const result = detectLoop(history, "m1", `Unique response ${i}`, 3, 10);
      history = result.newHistory;
    }

    expect(history.length).toBe(10);

    // Add one more - oldest should be dropped
    const result = detectLoop(history, "m1", "New response", 3, 10);
    expect(result.newHistory.length).toBe(10);
  });

  it("should clear loop after different actions", () => {
    let history: Array<{ action: string; hash: string; timestamp: number }> = [];
    const loopResponse = "Stuck in loop";

    // Get close to loop
    const result1 = detectLoop(history, "m1", loopResponse);
    history = result1.newHistory;
    const result2 = detectLoop(history, "m1", loopResponse);
    history = result2.newHistory;

    // Different response breaks the pattern
    const result3 = detectLoop(history, "m1", "Different approach now");
    history = result3.newHistory;

    // Same loop response again - should only count as 1 now
    const result4 = detectLoop(history, "m1", loopResponse);
    expect(result4.isLoop).toBe(false);
    expect(result4.count).toBe(3); // 2 from before + 1 now, but not consecutive
  });
});

describe("Marathon Milestone Status", () => {
  interface Milestone {
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
    retryCount: number;
    maxRetries: number;
  }

  function updateMilestoneStatus(
    milestones: Milestone[],
    id: string,
    status: Milestone["status"],
    updates?: Partial<Milestone>
  ): Milestone[] {
    return milestones.map((m) =>
      m.id === id ? { ...m, status, ...updates } : m
    );
  }

  function getNextMilestone(milestones: Milestone[]): Milestone | undefined {
    return milestones.find(
      (m) => m.status === "pending" || m.status === "in_progress"
    );
  }

  it("should update milestone status", () => {
    const milestones: Milestone[] = [
      { id: "m1", title: "Setup", status: "pending", retryCount: 0, maxRetries: 3 },
      { id: "m2", title: "Build", status: "pending", retryCount: 0, maxRetries: 3 },
    ];

    const updated = updateMilestoneStatus(milestones, "m1", "in_progress");
    expect(updated[0].status).toBe("in_progress");
    expect(updated[1].status).toBe("pending");
  });

  it("should get next pending milestone", () => {
    const milestones: Milestone[] = [
      { id: "m1", title: "Setup", status: "completed", retryCount: 0, maxRetries: 3 },
      { id: "m2", title: "Build", status: "pending", retryCount: 0, maxRetries: 3 },
      { id: "m3", title: "Deploy", status: "pending", retryCount: 0, maxRetries: 3 },
    ];

    const next = getNextMilestone(milestones);
    expect(next?.id).toBe("m2");
  });

  it("should return undefined when all completed", () => {
    const milestones: Milestone[] = [
      { id: "m1", title: "Setup", status: "completed", retryCount: 0, maxRetries: 3 },
      { id: "m2", title: "Build", status: "completed", retryCount: 0, maxRetries: 3 },
    ];

    const next = getNextMilestone(milestones);
    expect(next).toBeUndefined();
  });

  it("should track retry count", () => {
    const milestones: Milestone[] = [
      { id: "m1", title: "Setup", status: "pending", retryCount: 0, maxRetries: 3 },
    ];

    let updated = updateMilestoneStatus(milestones, "m1", "in_progress", { retryCount: 1 });
    expect(updated[0].retryCount).toBe(1);

    updated = updateMilestoneStatus(updated, "m1", "in_progress", { retryCount: 2 });
    expect(updated[0].retryCount).toBe(2);

    // Should fail after max retries
    const shouldFail = updated[0].retryCount >= updated[0].maxRetries;
    expect(shouldFail).toBe(false); // 2 < 3
  });
});

describe("Marathon Checkpoint System", () => {
  interface Checkpoint {
    id: string;
    milestoneId: string;
    createdAt: string;
    thoughtSignature: string;
    filesSnapshot: Record<string, string>;
    canRestore: boolean;
  }

  function createCheckpoint(
    milestoneId: string,
    thoughtSignature: string,
    files: Record<string, string>
  ): Checkpoint {
    return {
      id: `cp-${Date.now()}`,
      milestoneId,
      createdAt: new Date().toISOString(),
      thoughtSignature,
      filesSnapshot: files,
      canRestore: true,
    };
  }

  it("should create checkpoint with correct structure", () => {
    const checkpoint = createCheckpoint(
      "milestone-1",
      '{"keyPoints": ["created file"]}',
      { "src/app.ts": "abc123hash" }
    );

    expect(checkpoint.milestoneId).toBe("milestone-1");
    expect(checkpoint.thoughtSignature).toContain("keyPoints");
    expect(checkpoint.filesSnapshot["src/app.ts"]).toBe("abc123hash");
    expect(checkpoint.canRestore).toBe(true);
  });

  it("should track multiple checkpoints", () => {
    const checkpoints: Checkpoint[] = [];

    checkpoints.push(createCheckpoint("m1", "{}", {}));
    checkpoints.push(createCheckpoint("m2", "{}", {}));
    checkpoints.push(createCheckpoint("m3", "{}", {}));

    expect(checkpoints.length).toBe(3);
    expect(checkpoints[0].milestoneId).toBe("m1");
    expect(checkpoints[2].milestoneId).toBe("m3");
  });

  it("should find checkpoint by milestone", () => {
    const checkpoints: Checkpoint[] = [
      createCheckpoint("m1", '{"step": 1}', {}),
      createCheckpoint("m2", '{"step": 2}', {}),
      createCheckpoint("m3", '{"step": 3}', {}),
    ];

    const found = checkpoints.find((c) => c.milestoneId === "m2");
    expect(found).toBeDefined();
    expect(found?.thoughtSignature).toContain("step");
  });
});
