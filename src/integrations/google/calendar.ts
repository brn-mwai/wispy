/**
 * Google Calendar Integration
 *
 * Provides tools for listing, creating, and deleting calendar events
 * via the Google Calendar REST API v3.
 *
 * @see https://developers.google.com/calendar/api/v3/reference
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://www.googleapis.com/calendar/v3";

export default class GoogleCalendarIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-calendar",
    name: "Google Calendar",
    category: "google",
    version: "1.0.0",
    description: "List, create, and delete Google Calendar events.",
    auth: {
      type: "oauth2",
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
    },
    tools: [
      {
        name: "google_calendar_list_events",
        description: "List upcoming events from a Google Calendar.",
        parameters: {
          type: "object",
          properties: {
            calendarId: { type: "string", description: "Calendar ID (default: 'primary')." },
            maxResults: { type: "number", description: "Max events to return (default: 10)." },
            timeMin: { type: "string", description: "Lower bound (RFC3339) for event start." },
            timeMax: { type: "string", description: "Upper bound (RFC3339) for event start." },
          },
          required: [],
        },
      },
      {
        name: "google_calendar_create_event",
        description: "Create a new event on a Google Calendar.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Event title." },
            description: { type: "string", description: "Event description." },
            start: { type: "string", description: "Start datetime (RFC3339)." },
            end: { type: "string", description: "End datetime (RFC3339)." },
            attendees: {
              type: "array",
              items: { type: "string", description: "" },
              description: "List of attendee email addresses.",
            },
            calendarId: { type: "string", description: "Calendar ID (default: 'primary')." },
          },
          required: ["summary", "start", "end"],
        },
      },
      {
        name: "google_calendar_delete_event",
        description: "Delete an event from a Google Calendar.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "The event ID to delete." },
            calendarId: { type: "string", description: "Calendar ID (default: 'primary')." },
          },
          required: ["eventId"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_calendar_list_events":
        return this.listEvents(args);
      case "google_calendar_create_event":
        return this.createEvent(args);
      case "google_calendar_delete_event":
        return this.deleteEvent(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async listEvents(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const calendarId = encodeURIComponent((args.calendarId as string) || "primary");
    const params = new URLSearchParams({
      maxResults: String(args.maxResults ?? 10),
      singleEvents: "true",
      orderBy: "startTime",
    });
    if (args.timeMin) params.set("timeMin", args.timeMin as string);
    if (args.timeMax) params.set("timeMax", args.timeMax as string);

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/calendars/${calendarId}/events?${params}`,
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async createEvent(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const calendarId = encodeURIComponent((args.calendarId as string) || "primary");
    const body: Record<string, unknown> = {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.start },
      end: { dateTime: args.end },
    };
    if (Array.isArray(args.attendees)) {
      body.attendees = (args.attendees as string[]).map((email) => ({ email }));
    }

    const res = await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/calendars/${calendarId}/events`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async deleteEvent(args: Record<string, unknown>): Promise<ToolResult> {
    const { googleApiFetch } = await import("./oauth.js");
    const calendarId = encodeURIComponent((args.calendarId as string) || "primary");
    const eventId = encodeURIComponent(args.eventId as string);

    await googleApiFetch(
      this.ctx,
      this.manifest.id,
      `${BASE}/calendars/${calendarId}/events/${eventId}`,
      { method: "DELETE" },
    );
    return this.ok("Event deleted successfully.");
  }
}
