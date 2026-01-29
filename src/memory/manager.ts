import { VectorStore } from "./vector-store.js";
import { embedSingle } from "../ai/embeddings.js";
import type { WispyConfig } from "../config/schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("memory-manager");

// ═══════════════════════════════════════════════════════════════════════════
// BM25 Implementation for Hybrid Search (MoltBot-style)
// ═══════════════════════════════════════════════════════════════════════════

interface BM25Params {
  k1: number; // Term frequency saturation (typically 1.2-2.0)
  b: number;  // Document length normalization (typically 0.75)
}

const DEFAULT_BM25_PARAMS: BM25Params = { k1: 1.5, b: 0.75 };

/**
 * Tokenize text for BM25 scoring.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 1);
}

/**
 * Calculate BM25 score for a document against a query.
 */
function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLength: number,
  docFrequencies: Map<string, number>,
  totalDocs: number,
  params: BM25Params = DEFAULT_BM25_PARAMS
): number {
  const { k1, b } = params;
  const docLength = docTokens.length;
  const termFreqs = new Map<string, number>();

  // Calculate term frequencies in document
  for (const token of docTokens) {
    termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
  }

  let score = 0;
  for (const term of queryTokens) {
    const tf = termFreqs.get(term) || 0;
    if (tf === 0) continue;

    const df = docFrequencies.get(term) || 0;
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));

    score += idf * (numerator / denominator);
  }

  return score;
}

// ═══════════════════════════════════════════════════════════════════════════
// Memory Categories and Tags
// ═══════════════════════════════════════════════════════════════════════════

export type MemoryCategory =
  | "conversation"
  | "fact"
  | "preference"
  | "task"
  | "code"
  | "document"
  | "other";

export interface MemoryMetadata {
  category?: MemoryCategory;
  tags?: string[];
  importance?: number; // 1-10 scale
  expiresAt?: string;  // ISO timestamp for TTL
}

export interface MemoryResult {
  text: string;
  score: number;
  source: string;
  category?: MemoryCategory;
  tags?: string[];
  createdAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Memory Manager
// ═══════════════════════════════════════════════════════════════════════════

export class MemoryManager {
  private store: VectorStore;
  private config: WispyConfig;
  private hybridSearchEnabled: boolean;

  constructor(runtimeDir: string, config: WispyConfig) {
    this.store = new VectorStore(runtimeDir);
    this.config = config;
    this.hybridSearchEnabled = config.memory.hybridSearch !== false; // Default true
  }

  /**
   * Add a memory with optional metadata.
   */
  async addMemory(
    text: string,
    source: string,
    sessionKey?: string,
    metadata?: MemoryMetadata
  ): Promise<void> {
    try {
      const embedding = await embedSingle(text, this.config);
      this.store.insert(text, embedding, source, sessionKey, metadata);
      log.debug("Memory added: %s [%s]", text.slice(0, 60), metadata?.category || "default");
    } catch (err) {
      log.error({ err }, "Failed to embed memory");
      // Fallback: store without embedding (still searchable via BM25)
      this.store.insert(text, [], source, sessionKey, metadata);
    }
  }

  /**
   * Add a categorized memory with auto-classification.
   */
  async addCategorizedMemory(
    text: string,
    source: string,
    sessionKey?: string
  ): Promise<void> {
    const category = this.classifyMemory(text);
    const tags = this.extractTags(text);
    const importance = this.estimateImportance(text);

    await this.addMemory(text, source, sessionKey, {
      category,
      tags,
      importance,
    });
  }

  /**
   * Hybrid search combining semantic (vector) and keyword (BM25) search.
   */
  async search(
    query: string,
    limit: number = 5,
    options?: {
      category?: MemoryCategory;
      tags?: string[];
      minScore?: number;
      semanticWeight?: number; // 0-1, default 0.7
    }
  ): Promise<MemoryResult[]> {
    const semanticWeight = options?.semanticWeight ?? 0.7;
    const keywordWeight = 1 - semanticWeight;
    const minScore = options?.minScore ?? 0.1;

    try {
      // Semantic search
      const queryEmb = await embedSingle(query, this.config);
      const semanticResults = this.store.search(queryEmb, limit * 2);

      if (!this.hybridSearchEnabled) {
        // Return only semantic results if hybrid is disabled
        return semanticResults
          .filter(r => r.score >= minScore)
          .slice(0, limit)
          .map(r => ({
            text: r.text,
            score: r.score,
            source: r.source,
          }));
      }

      // BM25 keyword search
      const keywordResults = this.bm25Search(query, limit * 2);

      // Merge results with weighted scoring
      const merged = this.mergeResults(
        semanticResults,
        keywordResults,
        semanticWeight,
        keywordWeight
      );

      // Filter by category/tags if specified
      let filtered = merged;
      if (options?.category) {
        filtered = filtered.filter(r => r.category === options.category);
      }
      if (options?.tags && options.tags.length > 0) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => options.tags!.includes(t))
        );
      }

      return filtered
        .filter(r => r.score >= minScore)
        .slice(0, limit);
    } catch (err) {
      log.error({ err }, "Hybrid search failed, falling back to keyword");
      return this.bm25Search(query, limit).map(r => ({
        text: r.text,
        score: r.score * 0.5, // Penalize keyword-only results
        source: r.source,
      }));
    }
  }

  /**
   * BM25 keyword search implementation.
   */
  private bm25Search(
    query: string,
    limit: number
  ): Array<{ text: string; score: number; source: string; category?: MemoryCategory; tags?: string[] }> {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Get all documents for BM25 scoring
    const allDocs = this.store.getAllDocuments();
    if (allDocs.length === 0) return [];

    // Precompute document frequencies and average length
    const docFrequencies = new Map<string, number>();
    let totalTokens = 0;

    const tokenizedDocs = allDocs.map(doc => {
      const tokens = tokenize(doc.text);
      totalTokens += tokens.length;

      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        docFrequencies.set(token, (docFrequencies.get(token) || 0) + 1);
      }

      return { ...doc, tokens };
    });

    const avgDocLength = totalTokens / allDocs.length;

    // Score all documents
    const scored = tokenizedDocs.map(doc => ({
      text: doc.text,
      source: doc.source,
      category: doc.metadata?.category as MemoryCategory | undefined,
      tags: doc.metadata?.tags as string[] | undefined,
      score: bm25Score(
        queryTokens,
        doc.tokens,
        avgDocLength,
        docFrequencies,
        allDocs.length
      ),
    }));

    // Normalize scores to 0-1 range
    const maxScore = Math.max(...scored.map(s => s.score), 1);
    const normalized = scored.map(s => ({
      ...s,
      score: s.score / maxScore,
    }));

    return normalized
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Merge semantic and keyword results with reciprocal rank fusion.
   */
  private mergeResults(
    semanticResults: Array<{ text: string; score: number; source: string }>,
    keywordResults: Array<{ text: string; score: number; source: string; category?: MemoryCategory; tags?: string[] }>,
    semanticWeight: number,
    keywordWeight: number
  ): MemoryResult[] {
    const resultMap = new Map<string, MemoryResult>();

    // Add semantic results
    for (let i = 0; i < semanticResults.length; i++) {
      const r = semanticResults[i];
      const rrfScore = semanticWeight / (60 + i + 1); // RRF with k=60
      resultMap.set(r.text, {
        text: r.text,
        score: r.score * semanticWeight + rrfScore,
        source: r.source,
      });
    }

    // Add/merge keyword results
    for (let i = 0; i < keywordResults.length; i++) {
      const r = keywordResults[i];
      const rrfScore = keywordWeight / (60 + i + 1);
      const existing = resultMap.get(r.text);

      if (existing) {
        // Boost score for results appearing in both
        existing.score += r.score * keywordWeight + rrfScore + 0.1;
        existing.category = r.category;
        existing.tags = r.tags;
      } else {
        resultMap.set(r.text, {
          text: r.text,
          score: r.score * keywordWeight + rrfScore,
          source: r.source,
          category: r.category,
          tags: r.tags,
        });
      }
    }

    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Auto-classify memory into a category.
   */
  private classifyMemory(text: string): MemoryCategory {
    const lower = text.toLowerCase();

    // Code detection
    if (
      /```|function\s|class\s|import\s|export\s|const\s|let\s|var\s|def\s|async\s/.test(text) ||
      /\.(ts|js|py|go|rs|java|cpp|c|rb|php)$/.test(lower)
    ) {
      return "code";
    }

    // Task detection
    if (
      /\b(todo|task|remind|schedule|deadline|meeting|appointment)\b/i.test(lower) ||
      /\b(by|before|until|due)\s+\d/.test(lower)
    ) {
      return "task";
    }

    // Preference detection
    if (
      /\b(prefer|like|want|favorite|always|never|usually)\b/i.test(lower) ||
      /\b(i|my)\s+(prefer|like|want)/i.test(lower)
    ) {
      return "preference";
    }

    // Fact detection (statements with is/are/was/were)
    if (
      /\b(is|are|was|were|equals|means|defined as)\b/i.test(lower) &&
      !lower.includes("?")
    ) {
      return "fact";
    }

    // Document detection
    if (
      /\b(document|file|page|chapter|section|article)\b/i.test(lower) ||
      text.length > 500
    ) {
      return "document";
    }

    // Default to conversation
    if (text.includes("User:") || text.includes("Agent:")) {
      return "conversation";
    }

    return "other";
  }

  /**
   * Extract tags from memory text.
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];

    // Extract hashtags
    const hashtagMatches = text.match(/#[\w]+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map(t => t.slice(1).toLowerCase()));
    }

    // Extract @mentions
    const mentionMatches = text.match(/@[\w]+/g);
    if (mentionMatches) {
      tags.push(...mentionMatches.map(t => t.slice(1).toLowerCase()));
    }

    // Extract common keywords
    const keywords = [
      "important", "urgent", "todo", "bug", "feature", "idea",
      "meeting", "deadline", "project", "api", "database",
    ];
    const lower = text.toLowerCase();
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)]; // Deduplicate
  }

  /**
   * Estimate importance of a memory (1-10 scale).
   */
  private estimateImportance(text: string): number {
    let importance = 5; // Base importance

    const lower = text.toLowerCase();

    // Boost for important indicators
    if (/\b(important|critical|urgent|priority|must|required)\b/i.test(lower)) {
      importance += 2;
    }

    // Boost for personal preferences
    if (/\b(i|my|me)\s+(prefer|like|want|need)/i.test(lower)) {
      importance += 1;
    }

    // Boost for facts/definitions
    if (/\b(is|are|means|defined|equals)\b/i.test(lower) && !lower.includes("?")) {
      importance += 1;
    }

    // Reduce for very short or very long texts
    if (text.length < 20) importance -= 1;
    if (text.length > 1000) importance -= 1;

    // Reduce for conversation fragments
    if (/^(yes|no|ok|okay|sure|thanks|thank you|hi|hello|bye)$/i.test(text.trim())) {
      importance -= 2;
    }

    return Math.max(1, Math.min(10, importance));
  }

  /**
   * Get memory statistics.
   */
  getStats(): {
    totalMemories: number;
    categories: Record<MemoryCategory, number>;
    dbSizeBytes: number;
  } {
    return this.store.getStats();
  }

  /**
   * Sync memories (placeholder for future distributed sync).
   */
  async sync(): Promise<{ synced: number; errors: number }> {
    // TODO: Implement sync with external memory stores
    log.info("Memory sync triggered (local only)");
    return { synced: 0, errors: 0 };
  }

  /**
   * Clean up expired memories.
   */
  cleanExpired(): number {
    return this.store.cleanExpired();
  }

  close() {
    this.store.close();
  }
}
