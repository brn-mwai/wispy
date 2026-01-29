/**
 * Unified model registry.
 *
 * Manages multiple AI providers (Gemini, Ollama, OpenAI-compatible) and routes
 * requests to the appropriate provider based on model name.
 */

import { createLogger } from "../infra/logger.js";

const log = createLogger("models");

// ─── Shared Types ───────────────────────────────────────────

export interface GenerateOptions {
  model?: string;
  systemPrompt?: string;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
  thinkingLevel?: string;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  inputTokens: number;
  outputTokens: number;
}

export interface StreamChunk {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "done";
  content: string;
}

export interface ModelProvider {
  id: string;
  supportsTools: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  generateStream(opts: GenerateOptions): AsyncGenerator<StreamChunk>;
  embed?(text: string, model?: string): Promise<number[]>;
}

// ─── Registry ───────────────────────────────────────────────

const providers = new Map<string, ModelProvider>();
const modelToProvider = new Map<string, string>();

/**
 * Register a model provider.
 */
export function registerProvider(provider: ModelProvider): void {
  providers.set(provider.id, provider);
  log.debug("Registered model provider: %s", provider.id);
}

/**
 * Map a model name to a provider ID.
 */
export function mapModel(modelName: string, providerId: string): void {
  modelToProvider.set(modelName, providerId);
}

/**
 * Get the provider for a model name.
 */
export function getProvider(model: string): ModelProvider | undefined {
  // Check explicit mapping first
  const providerId = modelToProvider.get(model);
  if (providerId) return providers.get(providerId);

  // Infer from model name
  if (model.startsWith("gemini") || model.startsWith("gemma")) {
    return providers.get("gemini") || providers.get("ollama");
  }
  if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) {
    return providers.get("openai-compat");
  }
  if (model.startsWith("claude")) {
    return providers.get("openai-compat");
  }
  if (model.includes("/") || model.includes(":")) {
    // Ollama-style model names (e.g., "gemma3:27b", "llama3:8b")
    return providers.get("ollama");
  }

  // Fallback to first available
  return providers.values().next().value;
}

/**
 * List all registered providers.
 */
export function listProviders(): Array<{
  id: string;
  supportsTools: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
}> {
  return Array.from(providers.values()).map((p) => ({
    id: p.id,
    supportsTools: p.supportsTools,
    supportsThinking: p.supportsThinking,
    supportsVision: p.supportsVision,
  }));
}

/**
 * Initialize the default Gemini provider.
 * Other providers are loaded based on workspace config.
 */
export async function initProviders(workspace: {
  models: { default: string; fallback?: string; local?: string };
}): Promise<void> {
  // Gemini is always available (primary provider)
  // It's initialized separately in ai/gemini.ts

  // Ollama — check if available
  if (workspace.models.local) {
    try {
      const { OllamaProvider } = await import("./providers/ollama.js");
      const ollama = new OllamaProvider();
      if (await ollama.isAvailable()) {
        registerProvider(ollama);
        log.info("Ollama provider connected");
      } else {
        log.debug("Ollama not available at localhost:11434");
      }
    } catch {
      log.debug("Ollama provider not loaded");
    }
  }
}
