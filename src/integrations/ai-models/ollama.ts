/**
 * Ollama Integration
 *
 * Provides access to locally-running LLMs via the Ollama HTTP API.
 * No authentication required -- Ollama runs on localhost.
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "http://localhost:11434/api";

export default class OllamaIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "ollama",
    name: "Ollama",
    category: "ai-models",
    version: "1.0.0",
    description: "Chat, list models, and generate embeddings with local Ollama models.",
    auth: { type: "none" },
    capabilities: { offline: true },
    tools: [
      {
        name: "ollama_chat",
        description: "Send a message to a local Ollama model.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "The user message." },
            model: { type: "string", description: "Model name (e.g. llama3, mistral).", default: "llama3" },
          },
          required: ["message"],
        },
      },
      {
        name: "ollama_list_models",
        description: "List all locally available Ollama models.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "ollama_embed",
        description: "Generate an embedding vector using a local model.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to embed." },
            model: { type: "string", description: "Model name.", default: "llama3" },
          },
          required: ["text"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "ollama_chat":
          return await this.chat(args.message as string, (args.model as string) ?? "llama3");
        case "ollama_list_models":
          return await this.listModels();
        case "ollama_embed":
          return await this.embed(args.text as string, (args.model as string) ?? "llama3");
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Ollama error: ${(err as Error).message}`);
    }
  }

  private async chat(message: string, model: string): Promise<ToolResult> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: message }],
        stream: false,
      }),
    });

    if (!res.ok) return this.error(`Ollama chat failed: ${res.status}`);
    const data = await res.json() as any;
    return this.ok(data.message?.content ?? "", {
      model: data.model,
      totalDuration: data.total_duration,
    });
  }

  private async listModels(): Promise<ToolResult> {
    const res = await fetch(`${API_BASE}/tags`);
    if (!res.ok) return this.error(`Ollama list failed: ${res.status}`);
    const data = await res.json() as any;
    const summary = (data.models ?? [])
      .map((m: any) => `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`)
      .join("\n");
    return this.ok(summary || "No models found.", { count: data.models?.length ?? 0 });
  }

  private async embed(text: string, model: string): Promise<ToolResult> {
    const res = await fetch(`${API_BASE}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!res.ok) return this.error(`Ollama embed failed: ${res.status}`);
    const data = await res.json() as any;
    const vector = data.embedding ?? [];
    return this.ok(`Embedding generated (${vector.length} dimensions)`, {
      dimensions: vector.length,
      vector,
    });
  }
}
