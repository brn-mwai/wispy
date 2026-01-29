/**
 * OpenAI Integration
 *
 * Provides access to OpenAI chat completions, image generation (DALL-E),
 * and text embeddings via the OpenAI REST API.
 *
 * @requires OPENAI_API_KEY - API key from https://platform.openai.com/api-keys
 * @see https://platform.openai.com/docs/api-reference
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://api.openai.com/v1";

export default class OpenAIIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "openai",
    name: "OpenAI",
    category: "ai-models",
    version: "1.0.0",
    description: "Chat completions, image generation, and embeddings via OpenAI.",
    auth: {
      type: "api-key",
      envVars: ["OPENAI_API_KEY"],
    },
    tools: [
      {
        name: "openai_chat",
        description: "Send a message to an OpenAI chat model and receive a response.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "The user message to send." },
            model: { type: "string", description: "Model ID (e.g. gpt-4o, gpt-4o-mini).", default: "gpt-4o-mini" },
            systemPrompt: { type: "string", description: "Optional system prompt." },
          },
          required: ["message"],
        },
      },
      {
        name: "openai_image",
        description: "Generate an image using DALL-E.",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Text description of the desired image." },
            size: {
              type: "string",
              description: "Image size.",
              enum: ["1024x1024", "1792x1024", "1024x1792"],
              default: "1024x1024",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "openai_embed",
        description: "Generate an embedding vector for the given text.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to embed." },
          },
          required: ["text"],
        },
      },
    ],
  };

  private async request(path: string, body: Record<string, unknown>): Promise<any> {
    const creds = await this.getCredentials<{ OPENAI_API_KEY: string }>();
    if (!creds?.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI ${res.status}: ${text}`);
    }
    return res.json();
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "openai_chat":
          return await this.chat(
            args.message as string,
            (args.model as string) ?? "gpt-4o-mini",
            args.systemPrompt as string | undefined
          );
        case "openai_image":
          return await this.image(args.prompt as string, (args.size as string) ?? "1024x1024");
        case "openai_embed":
          return await this.embed(args.text as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`OpenAI error: ${(err as Error).message}`);
    }
  }

  private async chat(message: string, model: string, systemPrompt?: string): Promise<ToolResult> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: message });

    const data = await this.request("/chat/completions", { model, messages });
    const reply = data.choices?.[0]?.message?.content ?? "";
    return this.ok(reply, {
      model: data.model,
      usage: data.usage,
    });
  }

  private async image(prompt: string, size: string): Promise<ToolResult> {
    const data = await this.request("/images/generations", {
      model: "dall-e-3",
      prompt,
      size,
      n: 1,
    });
    const url = data.data?.[0]?.url ?? "";
    return this.ok(url, { revisedPrompt: data.data?.[0]?.revised_prompt });
  }

  private async embed(text: string): Promise<ToolResult> {
    const data = await this.request("/embeddings", {
      model: "text-embedding-3-small",
      input: text,
    });
    const vector = data.data?.[0]?.embedding ?? [];
    return this.ok(`Embedding generated (${vector.length} dimensions)`, {
      dimensions: vector.length,
      vector,
    });
  }
}
