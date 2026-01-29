/**
 * Google Drive Integration
 *
 * Provides tools for listing, uploading, and downloading files via the
 * Google Drive REST API v3.
 *
 * @see https://developers.google.com/drive/api/reference/rest/v3
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

export default class GoogleDriveIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-drive",
    name: "Google Drive",
    category: "google",
    version: "1.0.0",
    description: "List, upload, and download files in Google Drive.",
    auth: {
      type: "oauth2",
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ],
    },
    tools: [
      {
        name: "google_drive_list",
        description: "List files in Google Drive.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Drive search query (uses Drive query syntax)." },
            maxResults: { type: "number", description: "Max files to return (default: 20)." },
            folderId: { type: "string", description: "Restrict to a specific folder ID." },
          },
          required: [],
        },
      },
      {
        name: "google_drive_upload",
        description: "Upload a file to Google Drive.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "File name." },
            content: { type: "string", description: "Plain-text file content." },
            mimeType: { type: "string", description: "MIME type (default: text/plain)." },
            folderId: { type: "string", description: "Parent folder ID." },
          },
          required: ["name", "content"],
        },
      },
      {
        name: "google_drive_download",
        description: "Download (export) a file's content from Google Drive.",
        parameters: {
          type: "object",
          properties: {
            fileId: { type: "string", description: "The file ID to download." },
          },
          required: ["fileId"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_drive_list":
        return this.list(args);
      case "google_drive_upload":
        return this.upload(args);
      case "google_drive_download":
        return this.download(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async list(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const parts: string[] = [];
    if (args.query) parts.push(args.query as string);
    if (args.folderId) parts.push(`'${args.folderId}' in parents`);

    const params = new URLSearchParams({
      pageSize: String(args.maxResults ?? 20),
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    });
    if (parts.length) params.set("q", parts.join(" and "));

    const res = await googleApiFetch(this.ctx, this.manifest.id, `${BASE}/files?${params}`);
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async upload(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const mimeType = (args.mimeType as string) || "text/plain";
    const metadata: Record<string, unknown> = { name: args.name, mimeType };
    if (args.folderId) metadata.parents = [args.folderId];

    const boundary = "wispy_boundary_" + Date.now();
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "",
      args.content as string,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${UPLOAD_BASE}/files?uploadType=multipart`,
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async download(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const fileId = encodeURIComponent(args.fileId as string);

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/files/${fileId}?alt=media`,
    );
    const text = await res.text();
    return this.ok(text);
  }
}
