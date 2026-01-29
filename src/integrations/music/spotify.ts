/**
 * Spotify Integration
 *
 * Provides playback control, search, and playlist management via the Spotify Web API.
 * Requires OAuth2 with appropriate scopes for playback and playlist access.
 *
 * @requires SPOTIFY_ACCESS_TOKEN - OAuth2 access token (refreshed externally).
 * @see https://developer.spotify.com/documentation/web-api
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://api.spotify.com/v1";

export default class SpotifyIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "spotify",
    name: "Spotify",
    category: "music",
    version: "1.0.0",
    description: "Control playback, search tracks, and manage playlists on Spotify.",
    auth: {
      type: "oauth2",
      scopes: ["user-read-playback-state", "user-modify-playback-state", "playlist-read-private", "playlist-modify-public"],
      envVars: ["SPOTIFY_ACCESS_TOKEN"],
    },
    tools: [
      {
        name: "spotify_now_playing",
        description: "Get the currently playing track.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "spotify_play",
        description: "Start or resume playback, optionally with a specific URI.",
        parameters: {
          type: "object",
          properties: {
            uri: { type: "string", description: "Spotify URI to play (e.g. spotify:track:xxx). Optional." },
          },
        },
      },
      {
        name: "spotify_pause",
        description: "Pause playback.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "spotify_search",
        description: "Search for tracks, albums, or artists.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." },
            type: { type: "string", description: "Type to search for.", enum: ["track", "album", "artist"], default: "track" },
          },
          required: ["query"],
        },
      },
      {
        name: "spotify_add_to_playlist",
        description: "Add a track to a playlist.",
        parameters: {
          type: "object",
          properties: {
            playlistId: { type: "string", description: "Playlist ID." },
            uri: { type: "string", description: "Spotify URI of the track to add." },
          },
          required: ["playlistId", "uri"],
        },
      },
    ],
  };

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const creds = await this.getCredentials<{ SPOTIFY_ACCESS_TOKEN: string }>();
    if (!creds?.SPOTIFY_ACCESS_TOKEN) throw new Error("Missing SPOTIFY_ACCESS_TOKEN");

    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${creds.SPOTIFY_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "spotify_now_playing":
          return await this.nowPlaying();
        case "spotify_play":
          return await this.play(args.uri as string | undefined);
        case "spotify_pause":
          return await this.pause();
        case "spotify_search":
          return await this.search(args.query as string, (args.type as string) ?? "track");
        case "spotify_add_to_playlist":
          return await this.addToPlaylist(args.playlistId as string, args.uri as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Spotify error: ${(err as Error).message}`);
    }
  }

  private async nowPlaying(): Promise<ToolResult> {
    const res = await this.request("/me/player/currently-playing");
    if (res.status === 204) return this.ok("Nothing is currently playing.");
    if (!res.ok) return this.error(`Failed: ${res.status}`);
    const data = await res.json() as any;
    if (!data.item) return this.ok("Nothing is currently playing.");
    const track = data.item;
    const artists = track.artists.map((a: any) => a.name).join(", ");
    return this.ok(`Now playing: ${track.name} by ${artists} (${track.album.name})`, {
      uri: track.uri,
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
    });
  }

  private async play(uri?: string): Promise<ToolResult> {
    const body = uri ? JSON.stringify({ uris: [uri] }) : undefined;
    const res = await this.request("/me/player/play", { method: "PUT", body });
    if (!res.ok && res.status !== 204) return this.error(`Play failed: ${res.status}`);
    return this.ok(uri ? `Playing: ${uri}` : "Playback resumed.");
  }

  private async pause(): Promise<ToolResult> {
    const res = await this.request("/me/player/pause", { method: "PUT" });
    if (!res.ok && res.status !== 204) return this.error(`Pause failed: ${res.status}`);
    return this.ok("Playback paused.");
  }

  private async search(query: string, type: string): Promise<ToolResult> {
    const res = await this.request(`/search?q=${encodeURIComponent(query)}&type=${type}&limit=10`);
    if (!res.ok) return this.error(`Search failed: ${res.status}`);
    const data = await res.json() as any;

    const key = `${type}s` as string;
    const items = data[key]?.items ?? [];
    const summary = items
      .map((item: any) => {
        const artists = item.artists?.map((a: any) => a.name).join(", ") ?? "";
        return `${item.name}${artists ? ` - ${artists}` : ""} (${item.uri})`;
      })
      .join("\n");

    return this.ok(summary || "No results found.", { count: items.length });
  }

  private async addToPlaylist(playlistId: string, uri: string): Promise<ToolResult> {
    const res = await this.request(`/playlists/${playlistId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris: [uri] }),
    });
    if (!res.ok) return this.error(`Add to playlist failed: ${res.status}`);
    const data = await res.json() as any;
    return this.ok(`Track added to playlist.`, { snapshotId: data.snapshot_id });
  }
}
