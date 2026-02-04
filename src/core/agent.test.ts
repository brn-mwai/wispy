/**
 * Core Agent Tests
 * Tests agent initialization, message handling, and context management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Types matching the implementation
interface Message {
  role: "user" | "model";
  content: string;
  timestamp?: string;
}

interface AgentConfig {
  model: string;
  systemPrompt: string;
  maxContextTokens: number;
  autoCompactThreshold: number;
}

interface AgentStats {
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  sessionStart: string;
}

// Simplified agent for testing
class Agent {
  private config: AgentConfig;
  private messages: Message[] = [];
  private stats: AgentStats;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = {
      model: config.model || "gemini-2.5-flash",
      systemPrompt: config.systemPrompt || "You are a helpful assistant.",
      maxContextTokens: config.maxContextTokens || 100_000,
      autoCompactThreshold: config.autoCompactThreshold || 0.75,
    };

    this.stats = {
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      sessionStart: new Date().toISOString(),
    };
  }

  async chat(message: string): Promise<{ text: string; tokensUsed: number }> {
    // Add user message
    this.messages.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Check if we need to compact
    const currentTokens = this.estimateTokens();
    if (currentTokens > this.config.maxContextTokens * this.config.autoCompactThreshold) {
      await this.compactContext();
    }

    // Simulate response (in real impl, calls Gemini API)
    const responseText = `Response to: ${message.slice(0, 50)}...`;
    const tokensUsed = Math.ceil(message.length / 4) + Math.ceil(responseText.length / 4);

    // Add model response
    this.messages.push({
      role: "model",
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    // Update stats
    this.stats.totalMessages += 2;
    this.stats.totalTokens += tokensUsed;

    return { text: responseText, tokensUsed };
  }

  async compactContext(): Promise<void> {
    if (this.messages.length <= 4) return;

    // Keep recent 30%, summarize older
    const keepCount = Math.max(4, Math.ceil(this.messages.length * 0.3));
    const toSummarize = this.messages.slice(0, -keepCount);
    const toKeep = this.messages.slice(-keepCount);

    // Create summary
    const summary = `[Summary of ${toSummarize.length} previous messages: ${toSummarize
      .map((m) => m.content.slice(0, 20))
      .join(", ")}...]`;

    // Replace with summary + recent
    this.messages = [
      { role: "model", content: summary, timestamp: new Date().toISOString() },
      ...toKeep,
    ];
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  estimateTokens(): number {
    let total = Math.ceil(this.config.systemPrompt.length / 4);
    for (const msg of this.messages) {
      total += Math.ceil(msg.content.length / 4) + 4; // +4 for role overhead
    }
    return total;
  }

  clearHistory(): void {
    this.messages = [];
    this.stats.totalMessages = 0;
    this.stats.totalTokens = 0;
  }

  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
  }
}

describe("Agent Initialization", () => {
  it("should initialize with default config", () => {
    const agent = new Agent();
    const config = agent.getConfig();

    expect(config.model).toBe("gemini-2.5-flash");
    expect(config.systemPrompt).toBeDefined();
    expect(config.maxContextTokens).toBe(100_000);
  });

  it("should accept custom config", () => {
    const agent = new Agent({
      model: "gemini-3-pro",
      systemPrompt: "Custom prompt",
      maxContextTokens: 50_000,
    });

    const config = agent.getConfig();
    expect(config.model).toBe("gemini-3-pro");
    expect(config.systemPrompt).toBe("Custom prompt");
    expect(config.maxContextTokens).toBe(50_000);
  });

  it("should initialize with empty message history", () => {
    const agent = new Agent();
    expect(agent.getMessages()).toHaveLength(0);
  });

  it("should initialize stats", () => {
    const agent = new Agent();
    const stats = agent.getStats();

    expect(stats.totalMessages).toBe(0);
    expect(stats.totalTokens).toBe(0);
    expect(stats.sessionStart).toBeDefined();
  });
});

describe("Agent Chat", () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent();
  });

  it("should process a message and return response", async () => {
    const result = await agent.chat("Hello, how are you?");

    expect(result.text).toBeDefined();
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("should add user and model messages to history", async () => {
    await agent.chat("Test message");

    const messages = agent.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("model");
  });

  it("should update stats after chat", async () => {
    await agent.chat("First message");
    await agent.chat("Second message");

    const stats = agent.getStats();
    expect(stats.totalMessages).toBe(4); // 2 user + 2 model
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it("should maintain conversation context", async () => {
    await agent.chat("My name is Alice");
    await agent.chat("What is my name?");

    const messages = agent.getMessages();
    expect(messages.length).toBe(4);
    expect(messages[0].content).toContain("Alice");
  });
});

describe("Context Management", () => {
  it("should estimate token count", () => {
    const agent = new Agent({ systemPrompt: "a".repeat(400) }); // 100 tokens

    // System prompt: 100 tokens
    expect(agent.estimateTokens()).toBe(100);
  });

  it("should track tokens from messages", async () => {
    const agent = new Agent({ systemPrompt: "" });

    await agent.chat("a".repeat(100)); // ~25 tokens
    const tokens = agent.estimateTokens();

    expect(tokens).toBeGreaterThan(25);
  });

  it("should trigger auto-compact at threshold", async () => {
    const agent = new Agent({
      maxContextTokens: 200, // Very small for testing
      autoCompactThreshold: 0.5, // 50%
      systemPrompt: "",
    });

    // Add messages to exceed threshold
    for (let i = 0; i < 10; i++) {
      await agent.chat("a".repeat(100));
    }

    // Should have compacted - fewer messages than added
    const messages = agent.getMessages();
    expect(messages.length).toBeLessThan(20);
  });

  it("should keep recent messages after compaction", async () => {
    const agent = new Agent({
      maxContextTokens: 100,
      autoCompactThreshold: 0.5,
      systemPrompt: "",
    });

    await agent.chat("First message");
    await agent.chat("Second message");
    await agent.chat("Third message");
    await agent.chat("Latest message");

    // Force compaction
    await agent.compactContext();

    const messages = agent.getMessages();
    // Should have summary + recent messages
    expect(messages.some((m) => m.content.includes("[Summary"))).toBe(true);
  });
});

describe("Agent History Management", () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent();
  });

  it("should clear history", async () => {
    await agent.chat("Message 1");
    await agent.chat("Message 2");

    agent.clearHistory();

    expect(agent.getMessages()).toHaveLength(0);
    expect(agent.getStats().totalMessages).toBe(0);
  });

  it("should allow system prompt update", () => {
    agent.setSystemPrompt("New system prompt");

    expect(agent.getConfig().systemPrompt).toBe("New system prompt");
  });

  it("should preserve stats when updating prompt", async () => {
    await agent.chat("Message");
    const tokensBefore = agent.getStats().totalTokens;

    agent.setSystemPrompt("New prompt");

    expect(agent.getStats().totalTokens).toBe(tokensBefore);
  });
});

describe("Message Structure", () => {
  it("should include timestamps in messages", async () => {
    const agent = new Agent();
    await agent.chat("Test");

    const messages = agent.getMessages();
    expect(messages[0].timestamp).toBeDefined();
    expect(new Date(messages[0].timestamp!).getTime()).toBeGreaterThan(0);
  });

  it("should preserve message order", async () => {
    const agent = new Agent();

    await agent.chat("First");
    await agent.chat("Second");
    await agent.chat("Third");

    const messages = agent.getMessages();
    expect(messages[0].content).toContain("First");
    expect(messages[2].content).toContain("Second");
    expect(messages[4].content).toContain("Third");
  });
});

describe("Token Estimation", () => {
  it("should estimate ~4 chars per token", () => {
    const agent = new Agent({ systemPrompt: "a".repeat(400) });

    // 400 chars should be ~100 tokens
    expect(agent.estimateTokens()).toBe(100);
  });

  it("should include role overhead", async () => {
    const agent = new Agent({ systemPrompt: "" });

    await agent.chat("test"); // 1 token + 4 overhead

    const tokens = agent.estimateTokens();
    // user message + model message + overhead
    expect(tokens).toBeGreaterThan(2);
  });
});
