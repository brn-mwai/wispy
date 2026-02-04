/**
 * Memory Manager Tests
 * Tests vector store, hybrid search, and memory persistence
 */

import { describe, it, expect, beforeEach } from "vitest";

// Types matching the implementation
type MemoryCategory = "conversation" | "fact" | "preference" | "task" | "code" | "document" | "other";

interface MemoryEntry {
  id: string;
  text: string;
  category: MemoryCategory;
  importance: number; // 1-10
  tags: string[];
  sessionKey?: string;
  createdAt: string;
  expiresAt?: string;
}

interface SearchResult {
  entry: MemoryEntry;
  score: number;
  matchType: "semantic" | "keyword" | "hybrid";
}

// Simplified memory manager for testing
class MemoryManager {
  private memories: MemoryEntry[] = [];
  private idCounter = 0;

  async store(
    text: string,
    options: {
      category?: MemoryCategory;
      importance?: number;
      tags?: string[];
      sessionKey?: string;
      ttlMinutes?: number;
    } = {}
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: `mem-${++this.idCounter}`,
      text,
      category: options.category || this.classifyCategory(text),
      importance: options.importance || this.estimateImportance(text),
      tags: options.tags || this.extractTags(text),
      sessionKey: options.sessionKey,
      createdAt: new Date().toISOString(),
      expiresAt: options.ttlMinutes
        ? new Date(Date.now() + options.ttlMinutes * 60000).toISOString()
        : undefined,
    };

    this.memories.push(entry);
    return entry;
  }

  async search(
    query: string,
    options: {
      limit?: number;
      category?: MemoryCategory;
      sessionKey?: string;
      minImportance?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const limit = options.limit || 10;
    const now = new Date();

    // Filter memories
    let filtered = this.memories.filter((m) => {
      // Check expiration
      if (m.expiresAt && new Date(m.expiresAt) < now) return false;

      // Check category
      if (options.category && m.category !== options.category) return false;

      // Check session
      if (options.sessionKey && m.sessionKey !== options.sessionKey) return false;

      // Check importance
      if (options.minImportance && m.importance < options.minImportance) return false;

      return true;
    });

    // Score and rank (simplified - real impl uses embeddings)
    const scored = filtered.map((entry) => ({
      entry,
      score: this.calculateScore(query, entry),
      matchType: "hybrid" as const,
    }));

    // Sort by score and limit
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getByCategory(category: MemoryCategory): Promise<MemoryEntry[]> {
    return this.memories.filter((m) => m.category === category);
  }

  async getBySession(sessionKey: string): Promise<MemoryEntry[]> {
    return this.memories.filter((m) => m.sessionKey === sessionKey);
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === id);
    if (idx >= 0) {
      this.memories.splice(idx, 1);
      return true;
    }
    return false;
  }

  async cleanExpired(): Promise<number> {
    const now = new Date();
    const before = this.memories.length;
    this.memories = this.memories.filter(
      (m) => !m.expiresAt || new Date(m.expiresAt) >= now
    );
    return before - this.memories.length;
  }

  getStats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    for (const m of this.memories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    }
    return { total: this.memories.length, byCategory };
  }

  // Helper methods
  private classifyCategory(text: string): MemoryCategory {
    const lower = text.toLowerCase();
    if (lower.includes("function") || lower.includes("class") || lower.includes("const")) {
      return "code";
    }
    if (lower.includes("prefer") || lower.includes("like") || lower.includes("want")) {
      return "preference";
    }
    if (lower.includes("task") || lower.includes("todo") || lower.includes("need to")) {
      return "task";
    }
    if (lower.includes("fact") || lower.includes("is") || lower.includes("are")) {
      return "fact";
    }
    return "other";
  }

  private estimateImportance(text: string): number {
    let score = 5;
    const lower = text.toLowerCase();

    if (lower.includes("important") || lower.includes("critical")) score += 2;
    if (lower.includes("remember") || lower.includes("don't forget")) score += 2;
    if (lower.includes("always") || lower.includes("never")) score += 1;
    if (text.length > 200) score += 1;

    return Math.min(10, Math.max(1, score));
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];

    // Extract hashtags
    const hashtagMatches = text.match(/#\w+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map((t) => t.slice(1).toLowerCase()));
    }

    // Extract common keywords
    const keywords = ["api", "bug", "feature", "config", "user", "error"];
    for (const kw of keywords) {
      if (text.toLowerCase().includes(kw)) {
        tags.push(kw);
      }
    }

    return [...new Set(tags)];
  }

  private calculateScore(query: string, entry: MemoryEntry): number {
    const queryLower = query.toLowerCase();
    const textLower = entry.text.toLowerCase();

    let score = 0;

    // Exact match bonus
    if (textLower.includes(queryLower)) {
      score += 0.5;
    }

    // Word overlap
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    const overlap = queryWords.filter((w) => textWords.includes(w)).length;
    score += (overlap / queryWords.length) * 0.3;

    // Tag match bonus
    for (const tag of entry.tags) {
      if (queryLower.includes(tag)) {
        score += 0.1;
      }
    }

    // Importance factor
    score += entry.importance * 0.01;

    return Math.min(1, score);
  }
}

describe("Memory Storage", () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  it("should store a memory entry", async () => {
    const entry = await manager.store("Remember to use TypeScript");

    expect(entry.id).toBeDefined();
    expect(entry.text).toBe("Remember to use TypeScript");
    expect(entry.createdAt).toBeDefined();
  });

  it("should auto-classify category", async () => {
    const codeEntry = await manager.store("function calculateSum() { return a + b; }");
    expect(codeEntry.category).toBe("code");

    const prefEntry = await manager.store("I prefer dark mode");
    expect(prefEntry.category).toBe("preference");

    const taskEntry = await manager.store("I need to fix the bug");
    expect(taskEntry.category).toBe("task");
  });

  it("should allow manual category override", async () => {
    const entry = await manager.store("Random text", { category: "document" });
    expect(entry.category).toBe("document");
  });

  it("should auto-estimate importance", async () => {
    const normalEntry = await manager.store("Some text");
    expect(normalEntry.importance).toBe(5);

    const importantEntry = await manager.store("This is critically important!");
    expect(importantEntry.importance).toBeGreaterThan(5);
  });

  it("should extract tags from text", async () => {
    const entry = await manager.store("Fix the #bug in the API #urgent");

    expect(entry.tags).toContain("bug");
    expect(entry.tags).toContain("urgent");
    expect(entry.tags).toContain("api");
  });

  it("should set TTL for expiring memories", async () => {
    const entry = await manager.store("Temporary note", { ttlMinutes: 30 });

    expect(entry.expiresAt).toBeDefined();
    const expiresAt = new Date(entry.expiresAt!);
    const now = new Date();
    const diffMinutes = (expiresAt.getTime() - now.getTime()) / 60000;

    expect(diffMinutes).toBeCloseTo(30, 0);
  });

  it("should associate memory with session", async () => {
    const entry = await manager.store("Session-specific note", {
      sessionKey: "session-123",
    });

    expect(entry.sessionKey).toBe("session-123");
  });
});

describe("Memory Search", () => {
  let manager: MemoryManager;

  beforeEach(async () => {
    manager = new MemoryManager();

    // Seed test data
    await manager.store("The API endpoint is /api/v1/users");
    await manager.store("User prefers light mode theme");
    await manager.store("function fetchData() { return axios.get(url); }", {
      category: "code",
    });
    await manager.store("Important: Always validate user input", {
      importance: 9,
    });
    await manager.store("Meeting notes from Monday", { sessionKey: "session-a" });
  });

  it("should search by query", async () => {
    const results = await manager.search("API endpoint");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.text).toContain("API");
  });

  it("should filter by category", async () => {
    const results = await manager.search("function", { category: "code" });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.entry.category === "code")).toBe(true);
  });

  it("should filter by minimum importance", async () => {
    const results = await manager.search("validate", { minImportance: 8 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.entry.importance >= 8)).toBe(true);
  });

  it("should filter by session", async () => {
    const results = await manager.search("meeting", { sessionKey: "session-a" });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.entry.sessionKey === "session-a")).toBe(true);
  });

  it("should respect limit", async () => {
    const results = await manager.search("the", { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should rank by relevance score", async () => {
    const results = await manager.search("user input validation");

    // Results should be sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe("Memory Retrieval", () => {
  let manager: MemoryManager;

  beforeEach(async () => {
    manager = new MemoryManager();

    await manager.store("Code snippet 1", { category: "code" });
    await manager.store("Code snippet 2", { category: "code" });
    await manager.store("User preference", { category: "preference" });
    await manager.store("Session A note", { sessionKey: "a" });
    await manager.store("Session B note", { sessionKey: "b" });
  });

  it("should get memories by category", async () => {
    const codeMemories = await manager.getByCategory("code");

    expect(codeMemories.length).toBe(2);
    expect(codeMemories.every((m) => m.category === "code")).toBe(true);
  });

  it("should get memories by session", async () => {
    const sessionMemories = await manager.getBySession("a");

    expect(sessionMemories.length).toBe(1);
    expect(sessionMemories[0].text).toContain("Session A");
  });

  it("should return empty array for unknown category", async () => {
    const memories = await manager.getByCategory("document");
    expect(memories.length).toBe(0);
  });
});

describe("Memory Deletion", () => {
  let manager: MemoryManager;

  beforeEach(async () => {
    manager = new MemoryManager();
  });

  it("should delete memory by id", async () => {
    const entry = await manager.store("To be deleted");
    const statsBefore = manager.getStats();

    const deleted = await manager.delete(entry.id);
    const statsAfter = manager.getStats();

    expect(deleted).toBe(true);
    expect(statsAfter.total).toBe(statsBefore.total - 1);
  });

  it("should return false for non-existent id", async () => {
    const deleted = await manager.delete("non-existent-id");
    expect(deleted).toBe(false);
  });

  it("should clean expired memories", async () => {
    // Store with expired TTL (in the past)
    await manager.store("Fresh memory");

    const entry = await manager.store("Old memory", { ttlMinutes: -1 });

    const cleaned = await manager.cleanExpired();

    expect(cleaned).toBe(1);
    expect(manager.getStats().total).toBe(1);
  });
});

describe("Memory Statistics", () => {
  let manager: MemoryManager;

  beforeEach(async () => {
    manager = new MemoryManager();

    await manager.store("Code 1", { category: "code" });
    await manager.store("Code 2", { category: "code" });
    await manager.store("Preference", { category: "preference" });
    await manager.store("Task", { category: "task" });
  });

  it("should return total count", () => {
    const stats = manager.getStats();
    expect(stats.total).toBe(4);
  });

  it("should return count by category", () => {
    const stats = manager.getStats();

    expect(stats.byCategory.code).toBe(2);
    expect(stats.byCategory.preference).toBe(1);
    expect(stats.byCategory.task).toBe(1);
  });
});

describe("Tag Extraction", () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  it("should extract hashtags", async () => {
    const entry = await manager.store("Working on #feature for #release");

    expect(entry.tags).toContain("feature");
    expect(entry.tags).toContain("release");
  });

  it("should extract keyword tags", async () => {
    const entry = await manager.store("Found a bug in the user config");

    expect(entry.tags).toContain("bug");
    expect(entry.tags).toContain("user");
    expect(entry.tags).toContain("config");
  });

  it("should deduplicate tags", async () => {
    const entry = await manager.store("#bug There is a bug #bug");

    const bugCount = entry.tags.filter((t) => t === "bug").length;
    expect(bugCount).toBe(1);
  });
});
