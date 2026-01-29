/**
 * YouTube Integration
 *
 * Provides tools for searching videos, fetching video details, and
 * retrieving channel information via the YouTube Data API v3.
 *
 * @see https://developers.google.com/youtube/v3/docs
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const BASE = "https://www.googleapis.com/youtube/v3";

export default class GoogleYouTubeIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "google-youtube",
    name: "YouTube",
    category: "google",
    version: "1.0.0",
    description: "Search videos, get video details, and browse channels on YouTube.",
    auth: { type: "api-key" },
    tools: [
      {
        name: "google_youtube_search",
        description: "Search for YouTube videos.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." },
            maxResults: { type: "number", description: "Max results (default: 5, max: 50)." },
          },
          required: ["query"],
        },
      },
      {
        name: "google_youtube_video",
        description: "Get detailed information about a YouTube video.",
        parameters: {
          type: "object",
          properties: {
            videoId: { type: "string", description: "The YouTube video ID." },
          },
          required: ["videoId"],
        },
      },
      {
        name: "google_youtube_channel",
        description: "Get information about a YouTube channel.",
        parameters: {
          type: "object",
          properties: {
            channelId: { type: "string", description: "The YouTube channel ID." },
          },
          required: ["channelId"],
        },
      },
    ],
  };

  /** Retrieve the YouTube / Google API key from environment variables. */
  private getApiKey(): string {
    const key = process.env.GOOGLE_YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error(
        "GOOGLE_YOUTUBE_API_KEY or GOOGLE_API_KEY environment variable must be set.",
      );
    }
    return key;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "google_youtube_search":
        return this.search(args);
      case "google_youtube_video":
        return this.video(args);
      case "google_youtube_channel":
        return this.channel(args);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async search(args: Record<string, unknown>): Promise<ToolResult> {
    const maxResults = Math.min(Math.max(Number(args.maxResults ?? 5), 1), 50);
    const params = new URLSearchParams({
      key: this.getApiKey(),
      part: "snippet",
      type: "video",
      q: args.query as string,
      maxResults: String(maxResults),
    });

    const res = await fetch(`${BASE}/search?${params}`);
    const data = await res.json() as any;

    const results = (data.items ?? []).map(
      (item: Record<string, unknown>) => {
        const snippet = item.snippet as Record<string, unknown>;
        const id = item.id as Record<string, unknown>;
        return {
          videoId: id?.videoId,
          title: snippet?.title,
          description: snippet?.description,
          channelTitle: snippet?.channelTitle,
          publishedAt: snippet?.publishedAt,
          thumbnail: (snippet?.thumbnails as Record<string, unknown>)?.high,
        };
      },
    );

    return this.ok(JSON.stringify(results, null, 2));
  }

  private async video(args: Record<string, unknown>): Promise<ToolResult> {
    const params = new URLSearchParams({
      key: this.getApiKey(),
      part: "snippet,contentDetails,statistics",
      id: args.videoId as string,
    });

    const res = await fetch(`${BASE}/videos?${params}`);
    const data = await res.json() as any;

    if (!data.items?.length) {
      return this.error(`Video not found: ${args.videoId}`);
    }

    return this.ok(JSON.stringify(data.items[0], null, 2));
  }

  private async channel(args: Record<string, unknown>): Promise<ToolResult> {
    const params = new URLSearchParams({
      key: this.getApiKey(),
      part: "snippet,statistics,brandingSettings",
      id: args.channelId as string,
    });

    const res = await fetch(`${BASE}/channels?${params}`);
    const data = await res.json() as any;

    if (!data.items?.length) {
      return this.error(`Channel not found: ${args.channelId}`);
    }

    return this.ok(JSON.stringify(data.items[0], null, 2));
  }
}
