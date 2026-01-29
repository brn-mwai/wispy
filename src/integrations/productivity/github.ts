/**
 * GitHub Integration
 *
 * Provides access to GitHub repositories -- create issues, list issues,
 * create pull requests, and read file contents via the GitHub REST API.
 *
 * @requires GITHUB_TOKEN - Personal access token or fine-grained token.
 * @see https://docs.github.com/en/rest
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://api.github.com";

export default class GitHubIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "github",
    name: "GitHub",
    category: "productivity",
    version: "1.0.0",
    description: "Create issues, list issues, create PRs, and read files on GitHub.",
    auth: {
      type: "token",
      envVars: ["GITHUB_TOKEN"],
    },
    tools: [
      {
        name: "github_create_issue",
        description: "Create a new issue in a repository.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner." },
            repo: { type: "string", description: "Repository name." },
            title: { type: "string", description: "Issue title." },
            body: { type: "string", description: "Issue body (Markdown)." },
          },
          required: ["owner", "repo", "title"],
        },
      },
      {
        name: "github_list_issues",
        description: "List issues in a repository.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner." },
            repo: { type: "string", description: "Repository name." },
            state: { type: "string", description: "Filter by state.", enum: ["open", "closed", "all"], default: "open" },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "github_create_pr",
        description: "Create a pull request.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner." },
            repo: { type: "string", description: "Repository name." },
            title: { type: "string", description: "PR title." },
            body: { type: "string", description: "PR description." },
            head: { type: "string", description: "Head branch." },
            base: { type: "string", description: "Base branch.", default: "main" },
          },
          required: ["owner", "repo", "title", "head", "base"],
        },
      },
      {
        name: "github_get_file",
        description: "Get the contents of a file from a repository.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner." },
            repo: { type: "string", description: "Repository name." },
            path: { type: "string", description: "File path within the repo." },
          },
          required: ["owner", "repo", "path"],
        },
      },
    ],
  };

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const creds = await this.getCredentials<{ GITHUB_TOKEN: string }>();
    if (!creds?.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN");

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${creds.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "github_create_issue":
          return await this.createIssue(args.owner as string, args.repo as string, args.title as string, args.body as string | undefined);
        case "github_list_issues":
          return await this.listIssues(args.owner as string, args.repo as string, (args.state as string) ?? "open");
        case "github_create_pr":
          return await this.createPR(args.owner as string, args.repo as string, args.title as string, args.body as string | undefined, args.head as string, args.base as string);
        case "github_get_file":
          return await this.getFile(args.owner as string, args.repo as string, args.path as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`GitHub error: ${(err as Error).message}`);
    }
  }

  private async createIssue(owner: string, repo: string, title: string, body?: string): Promise<ToolResult> {
    const data = await this.request(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });
    return this.ok(`Issue #${data.number} created: ${data.html_url}`, { number: data.number, url: data.html_url });
  }

  private async listIssues(owner: string, repo: string, state: string): Promise<ToolResult> {
    const data = await this.request(`/repos/${owner}/${repo}/issues?state=${state}&per_page=30`);
    const summary = data.map((i: any) => `#${i.number} [${i.state}] ${i.title}`).join("\n");
    return this.ok(summary || "No issues found.", { count: data.length });
  }

  private async createPR(owner: string, repo: string, title: string, body: string | undefined, head: string, base: string): Promise<ToolResult> {
    const data = await this.request(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title, body, head, base }),
    });
    return this.ok(`PR #${data.number} created: ${data.html_url}`, { number: data.number, url: data.html_url });
  }

  private async getFile(owner: string, repo: string, path: string): Promise<ToolResult> {
    const data = await this.request(`/repos/${owner}/${repo}/contents/${path}`);
    if (data.type !== "file") return this.error(`Path is not a file: ${data.type}`);
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return this.ok(content, { path: data.path, sha: data.sha, size: data.size });
  }
}
