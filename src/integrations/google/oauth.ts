/**
 * Shared Google OAuth2 helper.
 *
 * All Google integrations use this module for authentication.
 * Supports the OAuth2 authorization code flow with automatic token refresh.
 */

import type { IntegrationContext } from "../base.js";
import type { OAuthTokens } from "../credential-manager.js";
import { createLogger } from "../../infra/logger.js";

const log = createLogger("google-oauth");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Get Google OAuth config from environment.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:4001/oauth/callback";

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate an OAuth2 authorization URL for the given scopes.
 */
export function generateAuthUrl(scopes: string[], state: string): string | null {
  const config = getGoogleOAuthConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<OAuthTokens | null> {
  const config = getGoogleOAuthConfig();
  if (!config) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log.error("Token exchange failed: %s", err);
      return null;
    }

    return (await res.json() as any) as OAuthTokens;
  } catch (err) {
    log.error("Token exchange error: %s", err);
    return null;
  }
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<OAuthTokens | null> {
  const config = getGoogleOAuthConfig();
  if (!config) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      log.error("Token refresh failed: %d", res.status);
      return null;
    }

    const tokens = (await res.json() as any) as OAuthTokens;
    tokens.refresh_token = tokens.refresh_token || refreshToken;
    return tokens;
  } catch (err) {
    log.error("Token refresh error: %s", err);
    return null;
  }
}

/**
 * Get a valid access token, refreshing if needed.
 */
export async function getAccessToken(
  ctx: IntegrationContext,
  integrationId: string
): Promise<string | null> {
  const tokens = ctx.credentialManager.get(integrationId) as OAuthTokens | null;
  if (!tokens) return null;

  // Check if expired
  if (ctx.credentialManager.isExpired(integrationId) && tokens.refresh_token) {
    log.debug("Refreshing expired token for: %s", integrationId);
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (refreshed) {
      ctx.credentialManager.setOAuth2(integrationId, refreshed);
      return refreshed.access_token;
    }
    return null;
  }

  return tokens.access_token;
}

/**
 * Make an authenticated Google API request.
 */
export async function googleApiFetch(
  ctx: IntegrationContext,
  integrationId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await getAccessToken(ctx, integrationId);
  if (!accessToken) {
    throw new Error(`No valid access token for ${integrationId}. Re-authenticate.`);
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(url, { ...options, headers });
}
