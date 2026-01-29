/**
 * Notion Integration
 *
 * Provides access to Notion workspaces -- search, create pages, read pages,
 * and query databases via the Notion REST API.
 *
 * @requires NOTION_TOKEN - Internal integration token from https://www.notion.so/my-integrations
 * @see https://developers.notion.com/reference
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export default class NotionIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "notion",
    name: "Notion",
    category: "productivity",
    version: "1.0.0",
    description: "Search, create pages, read pages, and query databases in Notion.",
    auth: {
      type: "token",
      envVars: ["NOTION_TOKEN"],
    },
    tools: [
      {
        name: "notion_search",
        description: "Search across all pages and databases in the workspace.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." },
          },
          required: ["query"],
        },
      },
      {
        name: "notion_create_page",
        description: "Create a new page under a parent page.",
        parameters: {
          type: "object",
          properties: {
            parentId: { type: "string", description: "Parent page ID." },
            title: { type: "string", description: "Page title." },
            content: { type: "string", description: "Page body text (plain text, added as a paragraph block)." },
          },
          required: ["parentId", "title"],
        },
      },
      {
        name: "notion_read_page",
        description: "Read the properties and content blocks of a Notion page.",
        parameters: {
          type: "object",
          properties: {
            pageId: { type: "string", description: "Page ID to read." },
          },
          required: ["pageId"],
        },
      },
      {
        name: "notion_query_database",
        description: "Query a Notion database with an optional filter.",
        parameters: {
          type: "object",
          properties: {
            databaseId: { type: "string", description: "Database ID." },
            filter: { type: "object", description: "Notion filter object (optional)." },
          },
          required: ["databaseId"],
        },
      },
    ],
  };

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const creds = await this.getCredentials<{ NOTION_TOKEN: string }>();
    if (!creds?.NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${creds.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "notion_search":
          return await this.search(args.query as string);
        case "notion_create_page":
          return await this.createPage(args.parentId as string, args.title as string, args.content as string | undefined);
        case "notion_read_page":
          return await this.readPage(args.pageId as string);
        case "notion_query_database":
          return await this.queryDatabase(args.databaseId as string, args.filter as Record<string, unknown> | undefined);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Notion error: ${(err as Error).message}`);
    }
  }

  private async search(query: string): Promise<ToolResult> {
    const data = await this.request("/search", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    const results = (data.results ?? []).map((r: any) => {
      const title = r.properties?.title?.title?.[0]?.plain_text
        ?? r.properties?.Name?.title?.[0]?.plain_text
        ?? r.id;
      return `[${r.object}] ${title} (${r.id})`;
    });
    return this.ok(results.join("\n") || "No results found.", { count: data.results?.length ?? 0 });
  }

  private async createPage(parentId: string, title: string, content?: string): Promise<ToolResult> {
    const children: any[] = [];
    if (content) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content } }] },
      });
    }

    const data = await this.request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { page_id: parentId },
        properties: {
          title: { title: [{ text: { content: title } }] },
        },
        children,
      }),
    });
    return this.ok(`Page created: ${data.id}`, { pageId: data.id, url: data.url });
  }

  private async readPage(pageId: string): Promise<ToolResult> {
    const [page, blocks] = await Promise.all([
      this.request(`/pages/${pageId}`),
      this.request(`/blocks/${pageId}/children`),
    ]);

    const title = page.properties?.title?.title?.[0]?.plain_text
      ?? page.properties?.Name?.title?.[0]?.plain_text
      ?? "Untitled";

    const content = (blocks.results ?? [])
      .map((b: any) => {
        const texts = b[b.type]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
        return texts;
      })
      .filter(Boolean)
      .join("\n");

    return this.ok(`# ${title}\n\n${content}`, { pageId, url: page.url });
  }

  private async queryDatabase(databaseId: string, filter?: Record<string, unknown>): Promise<ToolResult> {
    const body: Record<string, unknown> = {};
    if (filter) body.filter = filter;

    const data = await this.request(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const rows = (data.results ?? []).map((r: any) => {
      const props = Object.entries(r.properties)
        .map(([key, val]: [string, any]) => {
          const text = val.title?.[0]?.plain_text
            ?? val.rich_text?.[0]?.plain_text
            ?? val.select?.name
            ?? val.number
            ?? val.checkbox
            ?? "";
          return `${key}: ${text}`;
        })
        .join(", ");
      return `[${r.id}] ${props}`;
    });

    return this.ok(rows.join("\n") || "No results.", { count: data.results?.length ?? 0 });
  }
}
