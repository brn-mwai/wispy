/**
 * Encrypted credential storage for integrations.
 *
 * All credentials (OAuth tokens, API keys) are encrypted at rest using the
 * device's Ed25519-derived AES-256 key. Credentials are decrypted on-demand
 * and cached in memory for the session.
 */

import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { encrypt, decrypt, deriveKey } from "../utils/crypto.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("credentials");

export interface StoredCredential {
  integrationId: string;
  type: "oauth2" | "api-key" | "token";
  encryptedData: string;
  createdAt: string;
  expiresAt?: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface CredentialStore {
  version: 1;
  credentials: StoredCredential[];
}

export class CredentialManager {
  private runtimeDir: string;
  private encryptionKey: Buffer;
  private credentials = new Map<string, StoredCredential>();
  private cache = new Map<string, unknown>();

  constructor(runtimeDir: string, deviceSecret: Buffer) {
    this.runtimeDir = runtimeDir;
    this.encryptionKey = deriveKey(deviceSecret);
    this.load();
  }

  private getStorePath(): string {
    return resolve(this.runtimeDir, "integrations", "credentials.json");
  }

  private load(): void {
    const store = readJSON<CredentialStore>(this.getStorePath());
    if (store?.credentials) {
      for (const cred of store.credentials) {
        this.credentials.set(cred.integrationId, cred);
      }
      log.debug("Loaded %d stored credential(s)", this.credentials.size);
    }
  }

  private save(): void {
    ensureDir(resolve(this.runtimeDir, "integrations"));
    const store: CredentialStore = {
      version: 1,
      credentials: Array.from(this.credentials.values()),
    };
    writeJSON(this.getStorePath(), store);
  }

  /**
   * Store OAuth2 tokens (encrypted).
   */
  setOAuth2(integrationId: string, tokens: OAuthTokens): void {
    const encrypted = encrypt(JSON.stringify(tokens), this.encryptionKey);
    const cred: StoredCredential = {
      integrationId,
      type: "oauth2",
      encryptedData: encrypted,
      createdAt: new Date().toISOString(),
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined,
    };
    this.credentials.set(integrationId, cred);
    this.cache.delete(integrationId);
    this.save();
    log.info("OAuth2 credentials stored for: %s", integrationId);
  }

  /**
   * Store an API key (encrypted).
   */
  setApiKey(integrationId: string, apiKey: string): void {
    const encrypted = encrypt(apiKey, this.encryptionKey);
    const cred: StoredCredential = {
      integrationId,
      type: "api-key",
      encryptedData: encrypted,
      createdAt: new Date().toISOString(),
    };
    this.credentials.set(integrationId, cred);
    this.cache.delete(integrationId);
    this.save();
    log.info("API key stored for: %s", integrationId);
  }

  /**
   * Store a bearer/access token (encrypted).
   */
  setToken(integrationId: string, token: string): void {
    const encrypted = encrypt(token, this.encryptionKey);
    const cred: StoredCredential = {
      integrationId,
      type: "token",
      encryptedData: encrypted,
      createdAt: new Date().toISOString(),
    };
    this.credentials.set(integrationId, cred);
    this.cache.delete(integrationId);
    this.save();
    log.info("Token stored for: %s", integrationId);
  }

  /**
   * Retrieve and decrypt credentials. Returns cached value if available.
   */
  get(integrationId: string): unknown | null {
    if (this.cache.has(integrationId)) {
      return this.cache.get(integrationId)!;
    }

    const cred = this.credentials.get(integrationId);
    if (!cred) return null;

    try {
      const decrypted = decrypt(cred.encryptedData, this.encryptionKey);
      const parsed = cred.type === "oauth2" ? JSON.parse(decrypted) : decrypted;
      this.cache.set(integrationId, parsed);
      return parsed;
    } catch (err) {
      log.error("Failed to decrypt credentials for: %s", integrationId);
      return null;
    }
  }

  /**
   * Check if credentials exist for an integration.
   */
  has(integrationId: string): boolean {
    return this.credentials.has(integrationId);
  }

  /**
   * Check if OAuth tokens are expired.
   */
  isExpired(integrationId: string): boolean {
    const cred = this.credentials.get(integrationId);
    if (!cred?.expiresAt) return false;
    return new Date(cred.expiresAt) < new Date();
  }

  /**
   * Delete credentials for an integration.
   */
  delete(integrationId: string): void {
    this.credentials.delete(integrationId);
    this.cache.delete(integrationId);
    this.save();
    log.info("Credentials deleted for: %s", integrationId);
  }

  /**
   * List all stored credential IDs.
   */
  listIds(): string[] {
    return Array.from(this.credentials.keys());
  }

  /**
   * Get credential metadata (without decrypting).
   */
  getMetadata(integrationId: string): Omit<StoredCredential, "encryptedData"> | null {
    const cred = this.credentials.get(integrationId);
    if (!cred) return null;
    const { encryptedData: _, ...meta } = cred;
    return meta;
  }
}
