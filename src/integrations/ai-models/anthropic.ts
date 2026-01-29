/**
 * Anthropic Claude Integration
 *
 * Provides access to Claude chat completions via the Anthropic Messages API.
 *
 * @requires ANTHROPIC_API_KEY - API key from https://console.anthropic.com/
 * @see https://docs.anthropic.com/en/docs/api-reference
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://api.anthropic.com/v1";

export default class AnthropicIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "ai-models",
    version: "1.0.0",
    description: "Chat completions via Anthropic Claude models.",
    auth: {
      type: "api-key",
      envVars: ["ANTHROPIC_API_KEY"],
    },
    tools: [
      {
        name: "anthropic_chat",
        description: "Send a message to a Claude model and receive a response.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "The user message to send." },
            model: {
              type: "string",
              description: "Model ID (e.g. claude-sonnet-4-20250514).",
              default: "claude-sonnet-4-20250514",
            },
            systemPrompt: { type: "string", description: "Optional system prompt." },
          },
          required: ["message"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "anthropic_chat":
          return await this.chat(
            args.message as string,
            (args.model as string) ?? "claude-sonnet-4-20250514",
            args.systemPrompt as string | undefined
          );
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Anthropic error: ${(err as Error).message}`);
    }
  }

  private async chat(message: string, model: string, systemPrompt?: string): Promise<ToolResult> {
    const creds = await this.getCredentials<{ ANTHROPIC_API_KEY: string }>();
    if (!creds?.ANTHROPIC_API_KEY) return this.error("Missing ANTHROPIC_API_KEY");

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: message }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": creds.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return this.error(`Anthropic ${res.status}: ${text}`);
    }

    const data = await res.json() as any;
    const reply = data.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("") ?? "";

    return this.ok(reply, {
      model: data.model,
      stopReason: data.stop_reason,
      usage: data.usage,
    });
  }
}
