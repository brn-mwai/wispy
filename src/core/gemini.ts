import { GoogleGenAI } from "@google/genai";
import { createLogger } from "../infra/logger.js";

const log = createLogger("gemini");

let client: GoogleGenAI | null = null;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: [
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE", 
    "DEADLINE_EXCEEDED",
    "INTERNAL",
    "rate limit",
    "quota",
    "timeout",
    "ECONNRESET",
    "ETIMEDOUT",
    "socket hang up",
  ],
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  
  return RETRY_CONFIG.retryableErrors.some(
    (pattern) => 
      errorStr.includes(pattern.toLowerCase()) || 
      errorMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * RETRY_CONFIG.baseDelayMs;
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Execute a function with retry logic
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === RETRY_CONFIG.maxRetries) {
        log.error({ error }, "%s failed after %d attempts", operationName, attempt + 1);
        throw error;
      }
      
      if (!isRetryableError(error)) {
        log.error({ error }, "%s failed with non-retryable error", operationName);
        throw error;
      }
      
      const delay = calculateDelay(attempt);
      log.warn(
        "%s attempt %d failed, retrying in %dms: %s",
        operationName,
        attempt + 1,
        delay,
        error instanceof Error ? error.message : String(error)
      );
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

export function initGemini(apiKey: string): GoogleGenAI {
  client = new GoogleGenAI({ apiKey });
  log.info("Gemini SDK initialized");
  return client;
}

export function getClient(): GoogleGenAI {
  if (!client) throw new Error("Gemini not initialized. Call initGemini() first.");
  return client;
}

export type ThinkingLevel = "none" | "minimal" | "low" | "medium" | "high";

export interface GenerateOptions {
  model: string;
  systemPrompt?: string;
  messages: Array<{ role: "user" | "model"; content: string }>;
  tools?: unknown[];
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  maxTokens?: number;
}

export async function generate(opts: GenerateOptions): Promise<{
  text: string;
  thinking?: string;
  toolCalls?: unknown[];
  usage?: { inputTokens: number; outputTokens: number };
}> {
  return withRetry(async () => {
    const ai = getClient();

    const contents = opts.messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

    const config: Record<string, unknown> = {};
    if (opts.temperature !== undefined) config.temperature = opts.temperature;
    if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;

    if (opts.thinkingLevel && opts.thinkingLevel !== "none") {
      config.thinkingConfig = { thinkingBudget: thinkingBudget(opts.thinkingLevel) };
    }

    if (opts.tools && opts.tools.length > 0) {
      config.tools = opts.tools;
    }

    const response = await ai.models.generateContent({
      model: opts.model,
      contents,
      config: {
        ...config,
        systemInstruction: opts.systemPrompt,
      },
    });

    const text = response.text || "";
    let thinking: string | undefined;
    const toolCalls: unknown[] = [];

    // Extract thinking and tool calls from parts
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if ((part as any).thought) {
          thinking = (part as any).text;
        }
        if ((part as any).functionCall) {
          toolCalls.push((part as any).functionCall);
        }
      }
    }

    return {
      text,
      thinking,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount || 0,
            outputTokens: response.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
    };
  }, "generate");
}

export async function* generateStream(opts: GenerateOptions): AsyncGenerator<{
  type: "text" | "thinking" | "tool_call" | "done";
  content: string;
}> {
  const ai = getClient();

  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const config: Record<string, unknown> = {};
  if (opts.temperature !== undefined) config.temperature = opts.temperature;
  if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;
  if (opts.thinkingLevel && opts.thinkingLevel !== "none") {
    config.thinkingConfig = { thinkingBudget: thinkingBudget(opts.thinkingLevel) };
  }

  const response = await ai.models.generateContentStream({
    model: opts.model,
    contents,
    config: {
      ...config,
      systemInstruction: opts.systemPrompt,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield { type: "text", content: chunk.text };
    }
    // Check for thinking parts
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if ((part as any).thought && (part as any).text) {
          yield { type: "thinking", content: (part as any).text };
        }
      }
    }
  }

  yield { type: "done", content: "" };
}

export async function embed(
  model: string,
  texts: string[]
): Promise<number[][]> {
  return withRetry(async () => {
    const ai = getClient();
    const result = await ai.models.embedContent({
      model,
      contents: texts.map((t) => ({ parts: [{ text: t }] })),
    });
    // Return embeddings
    return (result as any).embeddings?.map((e: any) => e.values) || [];
  }, "embed");
}

function thinkingBudget(level: ThinkingLevel): number {
  switch (level) {
    case "minimal": return 128;
    case "low": return 1024;
    case "medium": return 4096;
    case "high": return 16384;
    default: return 0;
  }
}