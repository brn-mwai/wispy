/**
 * Discord Integration
 *
 * Provides bot-level access to Discord servers via the Discord REST API v10.
 * Supports sending messages, listing channels, and reading message history.
 *
 * @requires DISCORD_BOT_TOKEN - Bot token from the Discord Developer Portal.
 * @see https://discord.com/developers/docs/reference
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://discord.com/api/v10";

export default class DiscordIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "discord",
    name: "Discord",
    category: "chat",
    version: "1.0.0",
    description: "Send messages, list channels, and read history in Discord servers.",
    auth: {
      type: "token",
      envVars: ["DISCORD_BOT_TOKEN"],
    },
    tools: [
      {
        name: "discord_send_message",
        description: "Send a message to a Discord channel.",
        parameters: {
          type: "object",
          properties: {
            channelId: { type: "string", description: "The target channel ID." },
            content: { type: "string", description: "Message content to send." },
          },
          required: ["channelId", "content"],
        },
      },
      {
        name: "discord_list_channels",
        description: "List all channels in a Discord guild (server).",
        parameters: {
          type: "object",
          properties: {
            guildId: { type: "string", description: "The guild (server) ID." },
          },
          required: ["guildId"],
        },
      },
      {
        name: "discord_read_messages",
        description: "Read recent messages from a Discord channel.",
        parameters: {
          type: "object",
          properties: {
            channelId: { type: "string", description: "The channel ID to read from." },
            limit: { type: "number", description: "Number of messages to fetch (max 100).", default: 25 },
          },
          required: ["channelId"],
        },
      },
    ],
  };

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const creds = await this.getCredentials<{ DISCORD_BOT_TOKEN: string }>();
    if (!creds?.DISCORD_BOT_TOKEN) throw new Error("Missing DISCORD_BOT_TOKEN");

    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bot ${creds.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "discord_send_message":
          return await this.sendMessage(args.channelId as string, args.content as string);
        case "discord_list_channels":
          return await this.listChannels(args.guildId as string);
        case "discord_read_messages":
          return await this.readMessages(args.channelId as string, (args.limit as number) ?? 25);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Discord error: ${(err as Error).message}`);
    }
  }

  private async sendMessage(channelId: string, content: string): Promise<ToolResult> {
    const res = await this.request(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return this.error(`Failed to send message: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return this.ok(`Message sent (id: ${data.id})`, { messageId: data.id });
  }

  private async listChannels(guildId: string): Promise<ToolResult> {
    const res = await this.request(`/guilds/${guildId}/channels`);
    if (!res.ok) return this.error(`Failed to list channels: ${res.status}`);
    const channels = await res.json() as any;
    const summary = channels.map((c: any) => `#${c.name} (${c.id}, type=${c.type})`).join("\n");
    return this.ok(summary, { count: channels.length });
  }

  private async readMessages(channelId: string, limit: number): Promise<ToolResult> {
    const clamped = Math.min(Math.max(limit, 1), 100);
    const res = await this.request(`/channels/${channelId}/messages?limit=${clamped}`);
    if (!res.ok) return this.error(`Failed to read messages: ${res.status}`);
    const messages = await res.json() as any;
    const summary = messages
      .map((m: any) => `[${m.author.username}] ${m.content}`)
      .reverse()
      .join("\n");
    return this.ok(summary, { count: messages.length });
  }
}
