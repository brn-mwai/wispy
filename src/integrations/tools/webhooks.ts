/**
 * Webhooks Integration
 *
 * Provides generic webhook sending and a simple in-memory webhook registry.
 * Useful for triggering external services, CI/CD pipelines, or custom automations.
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

export default class WebhooksIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "webhooks",
    name: "Webhooks",
    category: "tools",
    version: "1.0.0",
    description: "Send HTTP webhooks and maintain a named webhook registry.",
    auth: { type: "none" },
    tools: [
      {
        name: "webhook_send",
        description: "Send an HTTP request to a webhook URL.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Webhook URL." },
            method: { type: "string", description: "HTTP method.", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" },
            headers: { type: "object", description: "Custom headers (key-value pairs)." },
            body: { type: "string", description: "Request body (typically JSON string)." },
          },
          required: ["url"],
        },
      },
      {
        name: "webhook_register",
        description: "Register a named webhook for quick reuse.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Friendly name for this webhook." },
            url: { type: "string", description: "Webhook URL." },
          },
          required: ["name", "url"],
        },
      },
    ],
  };

  private registry = new Map<string, string>();

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "webhook_send":
          return await this.send(
            args.url as string,
            (args.method as string) ?? "POST",
            args.headers as Record<string, string> | undefined,
            args.body as string | undefined
          );
        case "webhook_register":
          return this.register(args.name as string, args.url as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Webhook error: ${(err as Error).message}`);
    }
  }

  private async send(url: string, method: string, headers?: Record<string, string>, body?: string): Promise<ToolResult> {
    // Allow using registered names as URL
    const resolvedUrl = this.registry.get(url) ?? url;

    const res = await fetch(resolvedUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: method !== "GET" ? body : undefined,
    });

    const responseText = await res.text();
    const truncated = responseText.length > 4000
      ? responseText.slice(0, 4000) + "...[truncated]"
      : responseText;

    if (!res.ok) {
      return this.error(`Webhook returned ${res.status}: ${truncated}`);
    }

    return this.ok(`${res.status} ${res.statusText}\n${truncated}`, {
      status: res.status,
      url: resolvedUrl,
    });
  }

  private register(name: string, url: string): ToolResult {
    this.registry.set(name, url);
    return this.ok(`Webhook "${name}" registered -> ${url}`, { name, url });
  }
}
