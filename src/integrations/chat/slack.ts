/**
 * Slack Integration
 *
 * Provides bot-level access to Slack workspaces via the Slack Web API.
 * Supports sending messages, listing channels, and reading message history.
 *
 * @requires SLACK_BOT_TOKEN - Bot User OAuth Token (xoxb-...).
 * @see https://api.slack.com/methods
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://slack.com/api";

export default class SlackIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "slack",
    name: "Slack",
    category: "chat",
    version: "1.0.0",
    description: "Send messages, list channels, and read history in Slack workspaces.",
    auth: {
      type: "token",
      envVars: ["SLACK_BOT_TOKEN"],
    },
    tools: [
      {
        name: "slack_send_message",
        description: "Send a message to a Slack channel.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel ID or name (e.g. #general)." },
            text: { type: "string", description: "Message text to send." },
          },
          required: ["channel", "text"],
        },
      },
      {
        name: "slack_list_channels",
        description: "List all public channels in the workspace.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "slack_read_messages",
        description: "Read recent messages from a Slack channel.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel ID." },
            limit: { type: "number", description: "Number of messages to fetch (max 100).", default: 25 },
          },
          required: ["channel"],
        },
      },
    ],
  };

  private async request(method: string, body?: Record<string, unknown>): Promise<any> {
    const creds = await this.getCredentials<{ SLACK_BOT_TOKEN: string }>();
    if (!creds?.SLACK_BOT_TOKEN) throw new Error("Missing SLACK_BOT_TOKEN");

    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json() as any;
    if (!data.ok) throw new Error(data.error ?? "Slack API error");
    return data;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "slack_send_message":
          return await this.sendMessage(args.channel as string, args.text as string);
        case "slack_list_channels":
          return await this.listChannels();
        case "slack_read_messages":
          return await this.readMessages(args.channel as string, (args.limit as number) ?? 25);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Slack error: ${(err as Error).message}`);
    }
  }

  private async sendMessage(channel: string, text: string): Promise<ToolResult> {
    const data = await this.request("chat.postMessage", { channel, text });
    return this.ok(`Message sent to ${channel} (ts: ${data.ts})`, { ts: data.ts, channel: data.channel });
  }

  private async listChannels(): Promise<ToolResult> {
    const data = await this.request("conversations.list", { types: "public_channel", limit: 200 });
    const summary = data.channels
      .map((c: any) => `#${c.name} (${c.id}) - ${c.num_members} members`)
      .join("\n");
    return this.ok(summary, { count: data.channels.length });
  }

  private async readMessages(channel: string, limit: number): Promise<ToolResult> {
    const clamped = Math.min(Math.max(limit, 1), 100);
    const data = await this.request("conversations.history", { channel, limit: clamped });
    const summary = data.messages
      .map((m: any) => `[${m.user ?? "bot"}] ${m.text}`)
      .reverse()
      .join("\n");
    return this.ok(summary, { count: data.messages.length });
  }
}
