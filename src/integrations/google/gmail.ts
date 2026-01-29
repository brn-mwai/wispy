/**
 * Gmail Integration
 *
 * Provides tools for sending, searching, and reading emails via the
 * Gmail REST API v1. Constructs raw MIME messages for sending.
 *
 * @see https://developers.google.com/gmail/api/reference/rest
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export default class GoogleGmailIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-gmail",
    name: "Gmail",
    category: "google",
    version: "1.0.0",
    description: "Send, search, and read Gmail messages.",
    auth: {
      type: "oauth2",
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    },
    tools: [
      {
        name: "google_gmail_send",
        description: "Send an email via Gmail.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address." },
            subject: { type: "string", description: "Email subject line." },
            body: { type: "string", description: "Plain-text email body." },
            cc: { type: "string", description: "CC email address(es), comma-separated." },
            bcc: { type: "string", description: "BCC email address(es), comma-separated." },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "google_gmail_search",
        description: "Search Gmail messages using a query string.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Gmail search query (same syntax as the Gmail search bar)." },
            maxResults: { type: "number", description: "Max messages to return (default: 10)." },
          },
          required: ["query"],
        },
      },
      {
        name: "google_gmail_read",
        description: "Read a specific Gmail message by its ID.",
        parameters: {
          type: "object",
          properties: {
            messageId: { type: "string", description: "The Gmail message ID." },
          },
          required: ["messageId"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_gmail_send":
        return this.send(args);
      case "google_gmail_search":
        return this.search(args);
      case "google_gmail_read":
        return this.read(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  /** Build an RFC 2822 MIME message and base64url-encode it for the Gmail API. */
  private buildRawMessage(args: Record<string, unknown>): string {
    const lines: string[] = [];
    lines.push(`To: ${args.to}`);
    if (args.cc) lines.push(`Cc: ${args.cc}`);
    if (args.bcc) lines.push(`Bcc: ${args.bcc}`);
    lines.push(`Subject: ${args.subject}`);
    lines.push("MIME-Version: 1.0");
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(args.body as string);

    const raw = lines.join("\r\n");
    // Base64url encode (Node.js Buffer)
    return Buffer.from(raw)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  private async send(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const raw = this.buildRawMessage(args);

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/messages/send`,
      { method: "POST", body: JSON.stringify({ raw }) },
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async search(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const params = new URLSearchParams({
      q: args.query as string,
      maxResults: String(args.maxResults ?? 10),
    });

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/messages?${params}`,
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async read(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const messageId = encodeURIComponent(args.messageId as string);

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/messages/${messageId}?format=full`,
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }
}
