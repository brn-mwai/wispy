/**
 * Context Window Manager
 * 
 * Prevents silent failures from context overflow by:
 * 1. Tracking token usage for system prompt, tools, and messages
 * 2. Keeping recent messages in full detail
 * 3. Summarizing older messages when context is tight
 * 4. Always reserving space for the response
 */

import { generate } from "../ai/gemini.js";
import type { WispyConfig } from "../config/schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("context-manager");

/** Approximate tokens per character for English/code mixed content */
const CHARS_PER_TOKEN = 4;

/** Model context limits */
const MODEL_LIMITS: Record<string, number> = {
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-3-pro": 1_000_000,
  "gemini-3-flash": 1_000_000,
  "gemma-3-27b": 128_000,
  "gemma-3-12b": 128_000,
};

/** Default limit if model not found */
const DEFAULT_LIMIT = 128_000;

export interface ContextMessage {
  role: "user" | "model" | "system";
  content: string;
}

export interface ContextBuildResult {
  messages: ContextMessage[];
  tokenEstimate: number;
  wasTruncated: boolean;
  droppedMessageCount: number;
  summaryIncluded: boolean;
}

export interface ContextManagerConfig {
  /** Maximum percentage of context to use (default: 70%) */
  maxContextUsagePercent: number;
  /** Tokens to reserve for model response (default: 8000) */
  responseReserve: number;
  /** Minimum recent messages to always keep (default: 4) */
  minRecentMessages: number;
  /** Maximum recent messages before considering summarization (default: 30) */
  maxRecentMessages: number;
  /** Enable summarization of old messages (default: true) */
  enableSummarization: boolean;
  /** Model to use for summarization (uses flash by default) */
  summarizationModel?: string;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxContextUsagePercent: 70,
  responseReserve: 8000,
  minRecentMessages: 4,
  maxRecentMessages: 30,
  enableSummarization: true,
};

export class ContextManager {
  private config: ContextManagerConfig;
  private wispyConfig: WispyConfig;
  private summaryCache: Map<string, string> = new Map();

  constructor(wispyConfig: WispyConfig, config?: Partial<ContextManagerConfig>) {
    this.wispyConfig = wispyConfig;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Get the context limit for a model
   */
  getModelLimit(model: string): number {
    return MODEL_LIMITS[model] || DEFAULT_LIMIT;
  }

  /**
   * Calculate available tokens for messages after accounting for fixed costs
   */
  calculateAvailableTokens(
    model: string,
    systemPrompt: string,
    tools: unknown[]
  ): number {
    const modelLimit = this.getModelLimit(model);
    const maxUsable = Math.floor(modelLimit * (this.config.maxContextUsagePercent / 100));
    
    const systemTokens = this.estimateTokens(systemPrompt);
    const toolsTokens = this.estimateTokens(JSON.stringify(tools));
    
    const available = maxUsable - systemTokens - toolsTokens - this.config.responseReserve;
    
    log.debug(
      "Context budget: model=%d, usable=%d, system=%d, tools=%d, reserve=%d, available=%d",
      modelLimit, maxUsable, systemTokens, toolsTokens, this.config.responseReserve, available
    );
    
    return Math.max(available, 0);
  }

  /**
   * Build optimized context from message history
   * 
   * Strategy:
   * 1. Always include recent messages (up to maxRecentMessages)
   * 2. If history exceeds available tokens, drop oldest messages
   * 3. If summarization enabled, summarize dropped messages
   */
  async buildContext(
    model: string,
    systemPrompt: string,
    tools: unknown[],
    fullHistory: ContextMessage[]
  ): Promise<ContextBuildResult> {
    const availableTokens = this.calculateAvailableTokens(model, systemPrompt, tools);
    
    // If history is short, no processing needed
    if (fullHistory.length <= this.config.minRecentMessages) {
      const tokenEstimate = this.estimateMessagesTokens(fullHistory);
      return {
        messages: fullHistory,
        tokenEstimate,
        wasTruncated: false,
        droppedMessageCount: 0,
        summaryIncluded: false,
      };
    }

    // Work backwards from most recent, fitting messages into budget
    const selected: ContextMessage[] = [];
    let usedTokens = 0;
    let cutoffIndex = fullHistory.length;

    for (let i = fullHistory.length - 1; i >= 0; i--) {
      const msg = fullHistory[i];
      const msgTokens = this.estimateTokens(msg.content) + 10; // overhead for role, formatting
      
      // Always include minimum recent messages regardless of size
      const isMinRecent = (fullHistory.length - 1 - i) < this.config.minRecentMessages;
      
      if (!isMinRecent && usedTokens + msgTokens > availableTokens) {
        cutoffIndex = i + 1;
        break;
      }
      
      selected.unshift(msg);
      usedTokens += msgTokens;
      cutoffIndex = i;
    }

    const droppedCount = cutoffIndex;
    
    // If we dropped messages and summarization is enabled, create a summary
    let summaryIncluded = false;
    if (droppedCount > 0 && this.config.enableSummarization) {
      const droppedMessages = fullHistory.slice(0, droppedCount);
      const summary = await this.summarizeMessages(droppedMessages);
      
      if (summary) {
        const summaryMsg: ContextMessage = {
          role: "system",
          content: `[Summary of ${droppedCount} earlier messages]\n${summary}`,
        };
        
        // Check if summary fits
        const summaryTokens = this.estimateTokens(summaryMsg.content);
        if (usedTokens + summaryTokens <= availableTokens) {
          selected.unshift(summaryMsg);
          usedTokens += summaryTokens;
          summaryIncluded = true;
        }
      }
    } else if (droppedCount > 0) {
      // No summarization, just add a note
      const noteMsg: ContextMessage = {
        role: "system",
        content: `[${droppedCount} earlier messages omitted for context limits]`,
      };
      selected.unshift(noteMsg);
      usedTokens += this.estimateTokens(noteMsg.content);
    }

    if (droppedCount > 0) {
      log.info(
        "Context windowed: %d → %d messages, dropped=%d, summary=%s, tokens=%d/%d",
        fullHistory.length,
        selected.length,
        droppedCount,
        summaryIncluded ? "yes" : "no",
        usedTokens,
        availableTokens
      );
    }

    return {
      messages: selected,
      tokenEstimate: usedTokens,
      wasTruncated: droppedCount > 0,
      droppedMessageCount: droppedCount,
      summaryIncluded,
    };
  }

  /**
   * Summarize a list of messages using the LLM
   */
  private async summarizeMessages(messages: ContextMessage[]): Promise<string | null> {
    if (messages.length === 0) return null;

    // Create a cache key from message contents
    const cacheKey = this.createCacheKey(messages);
    if (this.summaryCache.has(cacheKey)) {
      log.debug("Using cached summary for %d messages", messages.length);
      return this.summaryCache.get(cacheKey)!;
    }

    // Format messages for summarization
    const conversationText = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n")
      .slice(0, 30000); // Limit input to summarizer

    try {
      const result = await generate({
        model: this.config.summarizationModel || this.wispyConfig.gemini.models.flash,
        messages: [{
          role: "user",
          content: `Summarize this conversation excerpt in 2-4 sentences. Focus on:
- Key facts, decisions, and agreements
- Important context the AI needs to remember
- Any user preferences or constraints mentioned

Conversation:
${conversationText}

Summary:`,
        }],
        thinkingLevel: "minimal",
        maxTokens: 500,
      });

      const summary = result.text.trim();
      
      // Cache the summary
      this.summaryCache.set(cacheKey, summary);
      
      // Limit cache size
      if (this.summaryCache.size > 100) {
        const firstKey = this.summaryCache.keys().next().value;
        if (firstKey) this.summaryCache.delete(firstKey);
      }

      log.debug("Generated summary for %d messages: %s", messages.length, summary.slice(0, 100));
      return summary;
    } catch (err) {
      log.error({ err }, "Failed to summarize messages");
      return null;
    }
  }

  /**
   * Create a cache key from messages
   */
  private createCacheKey(messages: ContextMessage[]): string {
    const content = messages.map(m => m.content.slice(0, 100)).join("|");
    // Simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `summary_${messages.length}_${hash}`;
  }

  /**
   * Estimate total tokens for a list of messages
   */
  private estimateMessagesTokens(messages: ContextMessage[]): number {
    return messages.reduce((sum, m) => sum + this.estimateTokens(m.content) + 10, 0);
  }

  /**
   * Clear the summary cache
   */
  clearCache(): void {
    this.summaryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number } {
    return { size: this.summaryCache.size };
  }
}

/**
 * Quick helper for simple token-based windowing without summarization
 */
export function quickWindowMessages(
  messages: ContextMessage[],
  maxMessages: number = 20
): ContextMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }
  
  const dropped = messages.length - maxMessages;
  const windowed = messages.slice(-maxMessages);
  
  // Prepend a note about dropped messages
  windowed.unshift({
    role: "system",
    content: `[${dropped} earlier messages omitted]`,
  });
  
  return windowed;
}