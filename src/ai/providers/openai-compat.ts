/**
 * OpenAI-compatible provider.
 *
 * Connects to any API that implements the OpenAI chat completions format:
 * vLLM, LM Studio, Together AI, Groq, Fireworks, etc.
 */

import type { ModelProvider, GenerateOptions, GenerateResult, StreamChunk } from "../model-registry.js";
import { createLogger } from "../../infra/logger.js";

const log = createLogger("openai-compat");

export interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

export class OpenAICompatProvider implements ModelProvider {
  readonly id = "openai-compat";
  readonly supportsTools = true;
  readonly supportsThinking = false;
  readonly supportsVision = true;

  private config: OpenAICompatConfig;

  constructor(config: OpenAICompatConfig) {
    this.config = config;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const messages = this.buildMessages(opts);

    const body: Record<string, unknown> = {
      model: opts.model || this.config.defaultModel,
      messages,
      max_tokens: 4096,
    };

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools.map((t: any) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI-compat error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const choice = data.choices?.[0];

    return {
      text: choice?.message?.content || "",
      thinking: undefined,
      toolCalls: choice?.message?.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || "{}"),
      })),
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
  }

  async *generateStream(opts: GenerateOptions): AsyncGenerator<StreamChunk> {
    const messages = this.buildMessages(opts);

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model || this.config.defaultModel,
        messages,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`OpenAI-compat stream error: ${res.status}`);
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
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          yield { type: "done", content: "" };
          return;
        }

        try {
          const chunk = JSON.parse(payload) as OpenAIStreamChunk;
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            yield { type: "text", content: delta.content };
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  async embed(text: string, model?: string): Promise<number[]> {
    const res = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: model || "text-embedding-3-small",
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Embedding error: ${res.status}`);
    }

    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding || [];
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

// ─── OpenAI API Types ───────────────────────────────────────

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
  }>;
}
