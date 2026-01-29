/**
 * Google Meet Integration
 *
 * Provides tools for creating and listing Google Meet meetings.
 * Uses the Calendar API to create events with conference (Meet) data.
 *
 * @see https://developers.google.com/calendar/api/guides/create-events#conferencing
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://www.googleapis.com/calendar/v3";

export default class GoogleMeetIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-meet",
    name: "Google Meet",
    category: "google",
    version: "1.0.0",
    description: "Create and list Google Meet video conferences via Calendar events.",
    auth: {
      type: "oauth2",
      scopes: [
        "https://www.googleapis.com/auth/calendar.events",
      ],
    },
    tools: [
      {
        name: "google_meet_create",
        description: "Create a Google Meet meeting (calendar event with video conference).",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Meeting title." },
            startTime: { type: "string", description: "Start datetime (RFC3339)." },
            endTime: { type: "string", description: "End datetime (RFC3339)." },
            attendees: {
              type: "array",
              items: { type: "string", description: "" },
              description: "List of attendee email addresses.",
            },
          },
          required: ["summary", "startTime", "endTime"],
        },
      },
      {
        name: "google_meet_list",
        description: "List upcoming meetings that have Google Meet links.",
        parameters: {
          type: "object",
          properties: {
            timeMin: { type: "string", description: "Lower bound (RFC3339). Defaults to now." },
            maxResults: { type: "number", description: "Max results (default: 10)." },
          },
          required: [],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_meet_create":
        return this.create(args);
      case "google_meet_list":
        return this.list(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async create(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const body: Record<string, unknown> = {
      summary: args.summary,
      start: { dateTime: args.startTime },
      end: { dateTime: args.endTime },
      conferenceData: {
        createRequest: {
          requestId: `wispy-meet-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    if (Array.isArray(args.attendees)) {
      body.attendees = (args.attendees as string[]).map((email) => ({ email }));
    }

    const params = new URLSearchParams({ conferenceDataVersion: "1" });
    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/calendars/primary/events?${params}`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const data = await res.json() as any;

    const meetLink = data.conferenceData?.entryPoints?.find(
      (ep: Record<string, unknown>) => ep.entryPointType === "video",
    )?.uri;

    return this.ok(
      JSON.stringify({ ...(data as any), meetLink: meetLink ?? null }, null, 2),
    );
  }

  private async list(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const params = new URLSearchParams({
      maxResults: String(args.maxResults ?? 10),
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: (args.timeMin as string) || new Date().toISOString(),
    });

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/calendars/primary/events?${params}`,
    );
    const data = await res.json() as any;

    // Filter to only events that have a Meet link
    const items = (data.items ?? []).filter(
      (evt: Record<string, unknown>) => evt.conferenceData,
    );
    return this.ok(JSON.stringify({ ...(data as any), items }, null, 2));
  }
}
