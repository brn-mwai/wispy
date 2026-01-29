/**
 * Google Sheets Integration
 *
 * Provides tools for reading, writing, and creating Google Sheets
 * via the Google Sheets REST API v4.
 *
 * @see https://developers.google.com/sheets/api/reference/rest
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export default class GoogleSheetsIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-sheets",
    name: "Google Sheets",
    category: "google",
    version: "1.0.0",
    description: "Read, write, and create Google Sheets spreadsheets.",
    auth: {
      type: "oauth2",
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ],
    },
    tools: [
      {
        name: "google_sheets_read",
        description: "Read values from a Google Sheets range.",
        parameters: {
          type: "object",
          properties: {
            spreadsheetId: { type: "string", description: "The spreadsheet ID." },
            range: { type: "string", description: "A1 notation range (e.g. 'Sheet1!A1:D10')." },
          },
          required: ["spreadsheetId", "range"],
        },
      },
      {
        name: "google_sheets_write",
        description: "Write values to a Google Sheets range.",
        parameters: {
          type: "object",
          properties: {
            spreadsheetId: { type: "string", description: "The spreadsheet ID." },
            range: { type: "string", description: "A1 notation range to write to." },
            values: {
              type: "array",
              items: { type: "array", description: "", items: { type: "string", description: "" } },
              description: "2D array of cell values (rows x columns).",
            },
          },
          required: ["spreadsheetId", "range", "values"],
        },
      },
      {
        name: "google_sheets_create",
        description: "Create a new Google Sheets spreadsheet.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Spreadsheet title." },
          },
          required: ["title"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_sheets_read":
        return this.read(args);
      case "google_sheets_write":
        return this.write(args);
      case "google_sheets_create":
        return this.create(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async read(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const id = encodeURIComponent(args.spreadsheetId as string);
    const range = encodeURIComponent(args.range as string);

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/${id}/values/${range}`,
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async write(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const id = encodeURIComponent(args.spreadsheetId as string);
    const range = encodeURIComponent(args.range as string);
    const params = new URLSearchParams({
      valueInputOption: "USER_ENTERED",
    });

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/${id}/values/${range}?${params}`,
      {
        method: "PUT",
        body: JSON.stringify({
          range: args.range,
          majorDimension: "ROWS",
          values: args.values,
        }),
      },
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async create(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");

    const res = await googleApiFetch(this.ctx, this.manifest.id, BASE, {
      method: "POST",
      body: JSON.stringify({
        properties: { title: args.title },
      }),
    });
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }
}
