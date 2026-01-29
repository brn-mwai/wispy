/**
 * Google Docs Integration
 *
 * Provides tools for creating, reading, and appending to Google Docs
 * via the Google Docs REST API v1.
 *
 * @see https://developers.google.com/docs/api/reference/rest
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://docs.googleapis.com/v1/documents";

export default class GoogleDocsIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-docs",
    name: "Google Docs",
    category: "google",
    version: "1.0.0",
    description: "Create, read, and append to Google Docs.",
    auth: {
      type: "oauth2",
      scopes: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/documents.readonly",
      ],
    },
    tools: [
      {
        name: "google_docs_create",
        description: "Create a new Google Doc with optional initial content.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title." },
            content: { type: "string", description: "Initial plain-text content to insert." },
          },
          required: ["title"],
        },
      },
      {
        name: "google_docs_read",
        description: "Read the full content of a Google Doc.",
        parameters: {
          type: "object",
          properties: {
            documentId: { type: "string", description: "The document ID." },
          },
          required: ["documentId"],
        },
      },
      {
        name: "google_docs_append",
        description: "Append text to the end of an existing Google Doc.",
        parameters: {
          type: "object",
          properties: {
            documentId: { type: "string", description: "The document ID." },
            text: { type: "string", description: "Text to append." },
          },
          required: ["documentId", "text"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_docs_create":
        return this.create(args);
      case "google_docs_read":
        return this.read(args);
      case "google_docs_append":
        return this.append(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async create(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");

    // Step 1: Create the document
    const res = await googleApiFetch(this.ctx, this.manifest.id, BASE, {
      method: "POST",
      body: JSON.stringify({ title: args.title }),
    });
    const doc = await res.json() as any;

    // Step 2: Insert initial content if provided
    if (args.content) {
      await googleApiFetch(
        this.ctx,
        this.manifest.id,
        `${BASE}/${doc.documentId}:batchUpdate`,
        {
          method: "POST",
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: args.content as string,
                },
              },
            ],
          }),
        },
      );
    }

    return this.ok(JSON.stringify(doc, null, 2));
  }

  private async read(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const documentId = encodeURIComponent(args.documentId as string);

    const res = await googleApiFetch(this.ctx, this.manifest.id, `${BASE}/${documentId}`);
    const data = await res.json() as any;

    // Extract plain text from the document body
    const text = this.extractText(data);
    return this.ok(text);
  }

  private async append(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const documentId = encodeURIComponent(args.documentId as string);

    // Fetch current doc to find the end index
    const docRes = await googleApiFetch(this.ctx, this.manifest.id, `${BASE}/${documentId}`);
    const doc = await docRes.json() as any;
    const endIndex = doc.body?.content?.at(-1)?.endIndex ?? 1;

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/${documentId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: Math.max(endIndex - 1, 1) },
                text: args.text as string,
              },
            },
          ],
        }),
      },
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  /** Recursively extract plain text from a Docs API document response. */
  private extractText(doc: Record<string, unknown>): string {
    const body = doc.body as Record<string, unknown> | undefined;
    if (!body?.content) return "";
    const content = body.content as Array<Record<string, unknown>>;
    const parts: string[] = [];
    for (const element of content) {
      const paragraph = element.paragraph as Record<string, unknown> | undefined;
      if (!paragraph?.elements) continue;
      for (const el of paragraph.elements as Array<Record<string, unknown>>) {
        const textRun = el.textRun as Record<string, unknown> | undefined;
        if (textRun?.content) parts.push(textRun.content as string);
      }
    }
    return parts.join("");
  }
}
