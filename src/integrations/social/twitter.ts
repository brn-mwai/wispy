/**
 * Twitter/X Integration
 *
 * Posts tweets, threads, and searches via the Twitter API v2.
 * Uses OAuth 1.0a User Context for posting and App/User context for search.
 *
 * @requires TWITTER_API_KEY - Consumer API key.
 * @requires TWITTER_API_SECRET - Consumer API secret.
 * @requires TWITTER_ACCESS_TOKEN - User access token.
 * @requires TWITTER_ACCESS_SECRET - User access token secret.
 * @see https://developer.twitter.com/en/docs/twitter-api
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";
import { createHmac, randomBytes } from "node:crypto";

const API_BASE = "https://api.twitter.com/2";

interface TwitterCreds {
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
}

export default class TwitterIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "twitter",
    name: "Twitter / X",
    category: "social",
    version: "1.0.0",
    description: "Post tweets, threads, and search on Twitter/X.",
    auth: {
      type: "oauth2",
      envVars: ["TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_SECRET"],
    },
    tools: [
      {
        name: "twitter_post",
        description: "Post a tweet.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Tweet text (max 280 characters)." },
          },
          required: ["text"],
        },
      },
      {
        name: "twitter_thread",
        description: "Post a thread of tweets.",
        parameters: {
          type: "object",
          properties: {
            tweets: { type: "array", description: "Array of tweet texts.", items: { type: "string", description: "Individual tweet text." } },
          },
          required: ["tweets"],
        },
      },
      {
        name: "twitter_search",
        description: "Search for recent tweets.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." },
          },
          required: ["query"],
        },
      },
    ],
  };

  private async getCreds(): Promise<TwitterCreds> {
    const creds = await this.getCredentials<TwitterCreds>();
    if (!creds?.TWITTER_API_KEY || !creds?.TWITTER_ACCESS_TOKEN) {
      throw new Error("Missing Twitter credentials");
    }
    return creds;
  }

  /**
   * Generate OAuth 1.0a Authorization header.
   * Required for user-context endpoints (posting tweets).
   */
  private buildOAuthHeader(method: string, url: string, creds: TwitterCreds): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");

    const params: Record<string, string> = {
      oauth_consumer_key: creds.TWITTER_API_KEY,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: creds.TWITTER_ACCESS_TOKEN,
      oauth_version: "1.0",
    };

    const sortedKeys = Object.keys(params).sort();
    const paramStr = sortedKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
    const baseStr = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
    const signingKey = `${encodeURIComponent(creds.TWITTER_API_SECRET)}&${encodeURIComponent(creds.TWITTER_ACCESS_SECRET)}`;
    const signature = createHmac("sha1", signingKey).update(baseStr).digest("base64");

    params.oauth_signature = signature;
    const header = Object.keys(params)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
      .join(", ");

    return `OAuth ${header}`;
  }

  private async postTweet(text: string, replyToId?: string): Promise<any> {
    const creds = await this.getCreds();
    const url = `${API_BASE}/tweets`;
    const body: Record<string, unknown> = { text };
    if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.buildOAuthHeader("POST", url, creds),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Twitter ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "twitter_post":
          return await this.post(args.text as string);
        case "twitter_thread":
          return await this.thread(args.tweets as string[]);
        case "twitter_search":
          return await this.search(args.query as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Twitter error: ${(err as Error).message}`);
    }
  }

  private async post(text: string): Promise<ToolResult> {
    const data = await this.postTweet(text);
    const id = data.data?.id;
    return this.ok(`Tweet posted (id: ${id})`, { tweetId: id });
  }

  private async thread(tweets: string[]): Promise<ToolResult> {
    if (!tweets.length) return this.error("Thread must contain at least one tweet.");
    const ids: string[] = [];
    let lastId: string | undefined;

    for (const text of tweets) {
      const data = await this.postTweet(text, lastId);
      lastId = data.data?.id;
      if (lastId) ids.push(lastId);
    }

    return this.ok(`Thread posted (${ids.length} tweets)`, { tweetIds: ids });
  }

  private async search(query: string): Promise<ToolResult> {
    const creds = await this.getCreds();
    const url = `${API_BASE}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=author_id,created_at,text`;

    const res = await fetch(url, {
      headers: {
        Authorization: this.buildOAuthHeader("GET", url.split("?")[0], creds),
      },
    });

    if (!res.ok) throw new Error(`Search failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const tweets = data.data ?? [];
    const summary = tweets
      .map((t: any) => `[${t.author_id}] ${t.text}`)
      .join("\n---\n");

    return this.ok(summary || "No results found.", { count: tweets.length });
  }
}
