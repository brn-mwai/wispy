/**
 * Wispy API Key Management
 * Manages API keys for third-party integrations.
 * Keys are stored locally in the runtime directory.
 */

import { randomBytes, createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createLogger } from "../infra/logger.js";

const log = createLogger("api-keys");

export interface ApiKey {
  id: string;           // wsk_xxxx (public prefix)
  hash: string;         // SHA-256 hash of the full key
  name: string;         // Human-readable label
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;   // ISO date, undefined = never
  scopes: ApiScope[];   // What the key can access
  rateLimit: number;    // Requests per minute
  usage: {
    totalRequests: number;
    totalTokens: number;
    lastHour: number;
  };
  active: boolean;
}

export type ApiScope =
  | "chat"           // Send messages
  | "chat:stream"    // SSE streaming
  | "sessions"       // Read/manage sessions
  | "memory"         // Search memory
  | "marathon"       // Start/manage marathons
  | "marathon:read"  // Read marathon status only
  | "skills"         // List/use skills
  | "generate"       // Image generation
  | "tools"          // Direct tool execution
  | "admin"          // Full access
  | "*";             // All scopes

interface KeyStore {
  keys: ApiKey[];
  version: 1;
}

const DEFAULT_RATE_LIMIT = 60; // 60 req/min
const KEY_PREFIX = "wsk";      // wispy secret key

// In-memory rate limit tracking
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export class ApiKeyManager {
  private storePath: string;
  private store: KeyStore;

  constructor(runtimeDir: string) {
    const dir = resolve(runtimeDir, "api");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.storePath = resolve(dir, "keys.json");
    this.store = this.load();
  }

  private load(): KeyStore {
    if (existsSync(this.storePath)) {
      try {
        return JSON.parse(readFileSync(this.storePath, "utf-8"));
      } catch {
        return { keys: [], version: 1 };
      }
    }
    return { keys: [], version: 1 };
  }

  private save(): void {
    writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  private hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  /**
   * Create a new API key. Returns the full key (only shown once).
   */
  create(name: string, scopes: ApiScope[] = ["chat", "chat:stream"], options?: {
    rateLimit?: number;
    expiresInDays?: number;
  }): { key: string; record: ApiKey } {
    const raw = randomBytes(32).toString("base64url");
    const fullKey = `${KEY_PREFIX}_${raw}`;
    const id = `${KEY_PREFIX}_${raw.slice(0, 8)}`;
    const hash = this.hashKey(fullKey);

    const record: ApiKey = {
      id,
      hash,
      name,
      createdAt: new Date().toISOString(),
      scopes,
      rateLimit: options?.rateLimit || DEFAULT_RATE_LIMIT,
      usage: { totalRequests: 0, totalTokens: 0, lastHour: 0 },
      active: true,
    };

    if (options?.expiresInDays) {
      const exp = new Date();
      exp.setDate(exp.getDate() + options.expiresInDays);
      record.expiresAt = exp.toISOString();
    }

    this.store.keys.push(record);
    this.save();

    log.info("API key created: %s (%s)", id, name);
    return { key: fullKey, record };
  }

  /**
   * Validate an API key and check scopes + rate limits.
   * Returns the key record if valid, null if invalid.
   */
  validate(key: string, requiredScope?: ApiScope): ApiKey | null {
    if (!key || !key.startsWith(`${KEY_PREFIX}_`)) return null;

    const hash = this.hashKey(key);
    const record = this.store.keys.find(k => k.hash === hash && k.active);

    if (!record) return null;

    // Check expiry
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      log.warn("Expired API key used: %s", record.id);
      return null;
    }

    // Check scope
    if (requiredScope && !record.scopes.includes("*") && !record.scopes.includes("admin") && !record.scopes.includes(requiredScope)) {
      log.warn("Scope %s not allowed for key %s", requiredScope, record.id);
      return null;
    }

    // Check rate limit
    if (!this.checkRateLimit(record)) {
      return null; // Rate limited — caller checks via separate method
    }

    // Update usage
    record.lastUsedAt = new Date().toISOString();
    record.usage.totalRequests++;
    this.save();

    return record;
  }

  /**
   * Check rate limit for a key. Returns false if rate limited.
   */
  checkRateLimit(record: ApiKey): boolean {
    const now = Date.now();
    const state = rateLimitMap.get(record.id);

    if (!state || now > state.resetAt) {
      rateLimitMap.set(record.id, { count: 1, resetAt: now + 60_000 });
      return true;
    }

    if (state.count >= record.rateLimit) {
      return false;
    }

    state.count++;
    return true;
  }

  /**
   * Get rate limit info for a key.
   */
  getRateLimitInfo(keyId: string): { remaining: number; resetAt: number; limit: number } {
    const record = this.store.keys.find(k => k.id === keyId);
    const limit = record?.rateLimit || DEFAULT_RATE_LIMIT;
    const state = rateLimitMap.get(keyId);

    if (!state || Date.now() > state.resetAt) {
      return { remaining: limit, resetAt: Date.now() + 60_000, limit };
    }

    return {
      remaining: Math.max(0, limit - state.count),
      resetAt: state.resetAt,
      limit,
    };
  }

  /**
   * Track token usage for a key.
   */
  trackTokens(keyId: string, tokens: number): void {
    const record = this.store.keys.find(k => k.id === keyId);
    if (record) {
      record.usage.totalTokens += tokens;
      this.save();
    }
  }

  /**
   * Revoke (deactivate) an API key.
   */
  revoke(id: string): boolean {
    const record = this.store.keys.find(k => k.id === id);
    if (!record) return false;
    record.active = false;
    this.save();
    log.info("API key revoked: %s", id);
    return true;
  }

  /**
   * List all API keys (without hashes).
   */
  list(): Omit<ApiKey, "hash">[] {
    return this.store.keys.map(({ hash, ...rest }) => rest);
  }

  /**
   * Delete a key permanently.
   */
  delete(id: string): boolean {
    const idx = this.store.keys.findIndex(k => k.id === id);
    if (idx === -1) return false;
    this.store.keys.splice(idx, 1);
    this.save();
    return true;
  }
}
