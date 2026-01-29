/**
 * Google Custom Search Integration
 *
 * Provides a web search tool powered by the Google Custom Search JSON API.
 * Requires a Custom Search Engine ID (CX) and API key.
 *
 * @see https://developers.google.com/custom-search/v1/reference/rest
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://www.googleapis.com/customsearch/v1";

export default class GoogleSearchIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-search",
    name: "Google Custom Search",
    category: "google",
    version: "1.0.0",
    description: "Search the web using Google Custom Search.",
    auth: { type: "api-key" },
    tools: [
      {
        name: "google_search",
        description: "Perform a web search using Google Custom Search.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query." },
            num: { type: "number", description: "Number of results to return (1-10, default: 10)." },
          },
          required: ["query"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_search":
        return this.search(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async search(args: Record<string, unknown>): Promise<ToolResult> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;
    if (!apiKey || !cx) {
      return this.error(
        "GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX environment variables must be set.",
      );
    }

    const num = Math.min(Math.max(Number(args.num ?? 10), 1), 10);
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: args.query as string,
      num: String(num),
    });

    const res = await fetch(`${BASE}?${params}`);
    const data = await res.json() as any;

    // Return a simplified view of results
    const results = (data.items ?? []).map(
      (item: Record<string, unknown>) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      }),
    );

    return this.ok(
      JSON.stringify({ totalResults: data.searchInformation?.totalResults, results }, null, 2),
    );
  }
}
