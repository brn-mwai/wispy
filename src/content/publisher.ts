import { createHmac, randomBytes } from "crypto";
import { createLogger } from "../infra/logger.js";

const log = createLogger("publisher");

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface TweetOptions {
  text: string;
  mediaIds?: string[];
  replyToId?: string;
}

export class TwitterPublisher {
  private creds: TwitterCredentials;

  constructor(creds: TwitterCredentials) {
    this.creds = creds;
  }

  async postTweet(opts: TweetOptions): Promise<{ id: string; text: string } | null> {
    const url = "https://api.twitter.com/2/tweets";
    const body: Record<string, unknown> = { text: opts.text };
    if (opts.mediaIds && opts.mediaIds.length > 0) {
      body.media = { media_ids: opts.mediaIds };
    }
    if (opts.replyToId) {
      body.reply = { in_reply_to_tweet_id: opts.replyToId };
    }

    try {
      const authHeader = this.buildOAuth1Header("POST", url, {});
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        log.error("Tweet failed: %d %s", res.status, err);
        return null;
      }

      const data = (await res.json()) as { data: { id: string; text: string } };
      log.info("Tweet posted: %s", data.data.id);
      return data.data;
    } catch (err) {
      log.error({ err }, "Failed to post tweet");
      return null;
    }
  }

  async postThread(tweets: string[]): Promise<Array<{ id: string; text: string }>> {
    const posted: Array<{ id: string; text: string }> = [];
    let replyToId: string | undefined;

    for (const text of tweets) {
      const result = await this.postTweet({ text, replyToId });
      if (result) {
        posted.push(result);
        replyToId = result.id;
      } else {
        log.error("Thread broken at tweet %d", posted.length + 1);
        break;
      }
    }

    return posted;
  }

  // OAuth 1.0a signature for Twitter API v2
  private buildOAuth1Header(method: string, url: string, params: Record<string, string>): string {
    const { apiKey, apiSecret, accessToken, accessSecret } = this.creds;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: accessToken,
      oauth_version: "1.0",
    };

    const allParams = { ...oauthParams, ...params };
    const paramString = Object.keys(allParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
      .join("&");

    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(paramString),
    ].join("&");

    const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
    const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

    oauthParams.oauth_signature = signature;

    const authString = Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(", ");

    return `OAuth ${authString}`;
  }
}

export function createPublisherFromEnv(): TwitterPublisher | null {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return null;
  }

  return new TwitterPublisher({ apiKey, apiSecret, accessToken, accessSecret });
}
