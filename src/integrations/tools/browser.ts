/**
 * Browser Integration
 *
 * Provides basic web content extraction using fetch, and describes
 * placeholder capabilities for full browser automation (Puppeteer/Playwright).
 * The navigate and screenshot tools note that full automation requires
 * an optional Puppeteer dependency.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

export default class BrowserIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "browser",
    name: "Browser",
    category: "tools",
    version: "1.0.0",
    description: "Navigate URLs, take screenshots, and extract content from web pages.",
    auth: { type: "none" },
    capabilities: { offline: false },
    tools: [
      {
        name: "browser_navigate",
        description: "Fetch a URL and return the HTML content. For full browser automation, install puppeteer.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to navigate to." },
          },
          required: ["url"],
        },
      },
      {
        name: "browser_screenshot",
        description: "Take a screenshot of a URL. Requires puppeteer to be installed.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to screenshot." },
          },
          required: ["url"],
        },
      },
      {
        name: "browser_extract",
        description: "Extract text content from a URL, optionally targeting a CSS selector.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to extract from." },
            selector: { type: "string", description: "CSS selector to target (extracts all text if omitted)." },
          },
          required: ["url"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "browser_navigate":
          return await this.navigate(args.url as string);
        case "browser_screenshot":
          return this.error(
            "Screenshot requires puppeteer. Install it with: npm install puppeteer. " +
            "This is a placeholder integration -- full browser automation is not yet wired."
          );
        case "browser_extract":
          return await this.extract(args.url as string, args.selector as string | undefined);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Browser error: ${(err as Error).message}`);
    }
  }

  private async navigate(url: string): Promise<ToolResult> {
    const res = await fetch(url, {
      headers: { "User-Agent": "Wispy/1.0 (Browser Integration)" },
    });
    if (!res.ok) return this.error(`Fetch failed: ${res.status} ${res.statusText}`);
    const html = await res.text();
    const truncated = html.length > 10000 ? html.slice(0, 10000) + "\n...[truncated]" : html;
    return this.ok(truncated, { url, status: res.status, contentLength: html.length });
  }

  private async extract(url: string, selector?: string): Promise<ToolResult> {
    const res = await fetch(url, {
      headers: { "User-Agent": "Wispy/1.0 (Browser Integration)" },
    });
    if (!res.ok) return this.error(`Fetch failed: ${res.status}`);
    const html = await res.text();

    // Basic text extraction by stripping HTML tags
    let text: string;
    if (selector) {
      // Simple regex-based extraction for common selectors (id, tag, class)
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        // ID selector: #foo
        selector.startsWith("#")
          ? new RegExp(`id=["']${selector.slice(1)}["'][^>]*>([\\s\\S]*?)<`, "i")
          : null,
        // Class selector: .foo
        selector.startsWith(".")
          ? new RegExp(`class=["'][^"']*${selector.slice(1)}[^"']*["'][^>]*>([\\s\\S]*?)<`, "i")
          : null,
        // Tag selector
        new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, "gi"),
      ].filter(Boolean) as RegExp[];

      const matches: string[] = [];
      for (const pat of patterns) {
        let m: RegExpExecArray | null;
        while ((m = pat.exec(html)) !== null) {
          matches.push(m[1]);
        }
      }
      text = matches.map((m) => m.replace(/<[^>]*>/g, "").trim()).join("\n") || "No content matched selector.";
    } else {
      text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const truncated = text.length > 8000 ? text.slice(0, 8000) + "\n...[truncated]" : text;
    return this.ok(truncated, { url, selector });
  }
}
