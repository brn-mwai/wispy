/**
 * Google Maps Integration
 *
 * Provides tools for geocoding, directions, and places search via the
 * Google Maps Platform REST APIs. Uses an API key for authentication
 * (no OAuth required).
 *
 * @see https://developers.google.com/maps/documentation
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://maps.googleapis.com/maps/api";

export default class GoogleMapsIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-maps",
    name: "Google Maps",
    category: "google",
    version: "1.0.0",
    description: "Geocode addresses, get directions, and search for places.",
    auth: { type: "api-key" },
    tools: [
      {
        name: "google_maps_geocode",
        description: "Convert an address into geographic coordinates.",
        parameters: {
          type: "object",
          properties: {
            address: { type: "string", description: "The address to geocode." },
          },
          required: ["address"],
        },
      },
      {
        name: "google_maps_directions",
        description: "Get directions between two locations.",
        parameters: {
          type: "object",
          properties: {
            origin: { type: "string", description: "Starting location (address or lat,lng)." },
            destination: { type: "string", description: "Destination (address or lat,lng)." },
            mode: {
              type: "string",
              description: "Travel mode: driving, walking, bicycling, or transit (default: driving).",
            },
          },
          required: ["origin", "destination"],
        },
      },
      {
        name: "google_maps_places",
        description: "Search for nearby places using Google Places API.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query (e.g. 'coffee shops')." },
            location: { type: "string", description: "Center point as 'lat,lng'." },
            radius: { type: "number", description: "Search radius in meters (default: 5000)." },
          },
          required: ["query"],
        },
      },
    ],
  };

  /** Retrieve the Maps API key from environment variables. */
  private getApiKey(): string {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set.");
    return key;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_maps_geocode":
        return this.geocode(args);
      case "google_maps_directions":
        return this.directions(args);
      case "google_maps_places":
        return this.places(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async geocode(args: Record<string, unknown>): Promise<ToolResult> {
    const params = new URLSearchParams({
      address: args.address as string,
      key: this.getApiKey(),
    });
    const res = await fetch(`${BASE}/geocode/json?${params}`);
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async directions(args: Record<string, unknown>): Promise<ToolResult> {
    const params = new URLSearchParams({
      origin: args.origin as string,
      destination: args.destination as string,
      mode: (args.mode as string) || "driving",
      key: this.getApiKey(),
    });
    const res = await fetch(`${BASE}/directions/json?${params}`);
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }

  private async places(args: Record<string, unknown>): Promise<ToolResult> {
    const params = new URLSearchParams({
      query: args.query as string,
      radius: String(args.radius ?? 5000),
      key: this.getApiKey(),
    });
    if (args.location) params.set("location", args.location as string);

    const res = await fetch(`${BASE}/place/textsearch/json?${params}`);
    const data = await res.json() as any;
    return this.ok(JSON.stringify(data, null, 2));
  }
}
