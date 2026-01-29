/**
 * Linear Integration
 *
 * Provides access to Linear project management via its GraphQL API.
 * Supports creating issues, listing issues, and updating issue state.
 *
 * @requires LINEAR_API_KEY - Personal API key from Linear settings.
 * @see https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_URL = "https://api.linear.app/graphql";

export default class LinearIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "linear",
    name: "Linear",
    category: "productivity",
    version: "1.0.0",
    description: "Create, list, and update issues in Linear.",
    auth: {
      type: "api-key",
      envVars: ["LINEAR_API_KEY"],
    },
    tools: [
      {
        name: "linear_create_issue",
        description: "Create a new issue in Linear.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Issue title." },
            description: { type: "string", description: "Issue description (Markdown)." },
            teamId: { type: "string", description: "Team ID to create the issue in." },
          },
          required: ["title", "teamId"],
        },
      },
      {
        name: "linear_list_issues",
        description: "List issues for a team, optionally filtered by state.",
        parameters: {
          type: "object",
          properties: {
            teamId: { type: "string", description: "Team ID." },
            state: { type: "string", description: "Filter by state name (e.g. In Progress, Done)." },
          },
          required: ["teamId"],
        },
      },
      {
        name: "linear_update_issue",
        description: "Update the state of an existing issue.",
        parameters: {
          type: "object",
          properties: {
            issueId: { type: "string", description: "Issue ID." },
            state: { type: "string", description: "New state name (e.g. In Progress, Done)." },
          },
          required: ["issueId", "state"],
        },
      },
    ],
  };

  private async graphql(query: string, variables?: Record<string, unknown>): Promise<any> {
    const creds = await this.getCredentials<{ LINEAR_API_KEY: string }>();
    if (!creds?.LINEAR_API_KEY) throw new Error("Missing LINEAR_API_KEY");

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: creds.LINEAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) throw new Error(`Linear ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    if (data.errors?.length) throw new Error(data.errors[0].message);
    return data.data;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "linear_create_issue":
          return await this.createIssue(args.title as string, args.teamId as string, args.description as string | undefined);
        case "linear_list_issues":
          return await this.listIssues(args.teamId as string, args.state as string | undefined);
        case "linear_update_issue":
          return await this.updateIssue(args.issueId as string, args.state as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Linear error: ${(err as Error).message}`);
    }
  }

  private async createIssue(title: string, teamId: string, description?: string): Promise<ToolResult> {
    const data = await this.graphql(
      `mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier title url }
        }
      }`,
      { input: { title, description, teamId } }
    );
    const issue = data.issueCreate.issue;
    return this.ok(`Created ${issue.identifier}: ${issue.title}\n${issue.url}`, {
      id: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    });
  }

  private async listIssues(teamId: string, state?: string): Promise<ToolResult> {
    const filter: Record<string, unknown> = { team: { id: { eq: teamId } } };
    if (state) filter.state = { name: { eq: state } };

    const data = await this.graphql(
      `query ListIssues($filter: IssueFilter) {
        issues(filter: $filter, first: 50) {
          nodes { id identifier title state { name } assignee { name } }
        }
      }`,
      { filter }
    );

    const issues = data.issues.nodes;
    const summary = issues
      .map((i: any) => `${i.identifier} [${i.state.name}] ${i.title}${i.assignee ? ` (${i.assignee.name})` : ""}`)
      .join("\n");
    return this.ok(summary || "No issues found.", { count: issues.length });
  }

  private async updateIssue(issueId: string, stateName: string): Promise<ToolResult> {
    // First resolve the state ID by looking up the issue's team workflow states
    const issueData = await this.graphql(
      `query GetIssue($id: String!) {
        issue(id: $id) {
          id identifier
          team { states { nodes { id name } } }
        }
      }`,
      { id: issueId }
    );

    const states = issueData.issue.team.states.nodes;
    const target = states.find((s: any) => s.name.toLowerCase() === stateName.toLowerCase());
    if (!target) {
      const available = states.map((s: any) => s.name).join(", ");
      return this.error(`State "${stateName}" not found. Available: ${available}`);
    }

    const data = await this.graphql(
      `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue { id identifier title state { name } }
        }
      }`,
      { id: issueId, input: { stateId: target.id } }
    );

    const issue = data.issueUpdate.issue;
    return this.ok(`${issue.identifier} updated to "${issue.state.name}"`, { id: issue.id });
  }
}
