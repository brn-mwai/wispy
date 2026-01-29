/**
 * Ollama provider — connects to local Ollama instance for running
 * open-source models (Gemma 3, Llama 3, Mistral, Phi-3, etc.)
 *
 * Ollama API: http://localhost:11434/api/
 */

import type { ModelProvider, GenerateOptions, GenerateResult, StreamChunk } from "../model-registry.js";
import { createLogger } from "../../infra/logger.js";

const log = createLogger("ollama");

const DEFAULT_BASE_URL = "http://localhost:11434";

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly supportsTools = true;
  readonly supportsThinking = false;
  readonly supportsVision = true;

  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const messages = this.buildMessages(opts);

    const body: Record<string, unknown> = {
      model: opts.model || "gemma3:27b",
      messages,
      stream: false,
    };

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as OllamaChatResponse;

    return {
      text: data.message?.content || "",
      thinking: undefined,
      toolCalls: data.message?.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: tc.function.arguments,
      })),
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: data.eval_count || 0,
    };
  }

  async *generateStream(opts: GenerateOptions): AsyncGenerator<StreamChunk> {
    const messages = this.buildMessages(opts);

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model || "gemma3:27b",
        messages,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama stream error: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as OllamaStreamChunk;
          if (chunk.message?.content) {
            yield { type: "text", content: chunk.message.content };
          }
          if (chunk.done) {
            yield { type: "done", content: "" };
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  async embed(text: string, model?: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "nomic-embed-text",
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed error: ${res.status}`);
    }

    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings[0] || [];
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildMessages(
    opts: GenerateOptions
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }

    for (const msg of opts.messages) {
      messages.push({
        role: msg.role === "model" ? "assistant" : msg.role,
        content: msg.content,
      });
    }

    return messages;
  }
}

// ─── Ollama API Types ───────────────────────────────────────

interface OllamaChatResponse {
  message?: {
    content: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  message?: { content: string };
  done: boolean;
}
