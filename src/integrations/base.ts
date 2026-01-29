/**
 * Base integration interface and abstract class.
 *
 * Every integration (Google Calendar, Slack, GitHub, etc.) extends this class.
 * It provides a standard contract for:
 * - Manifest declaration (id, name, auth, tools)
 * - Lifecycle hooks (onEnable, onDisable)
 * - Tool execution dispatch
 * - Health checks
 */

import type { WispyConfig } from "../config/schema.js";
import type { CredentialManager } from "./credential-manager.js";
import type { Logger } from "pino";

// ─── Tool Types ─────────────────────────────────────────────

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: ToolParameter;
  default?: unknown;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ─── Integration Types ──────────────────────────────────────

export type IntegrationCategory =
  | "google"
  | "chat"
  | "ai-models"
  | "productivity"
  | "music"
  | "smart-home"
  | "tools"
  | "media"
  | "social"
  | "built-in";

export type AuthType = "oauth2" | "api-key" | "token" | "none";

export interface IntegrationManifest {
  id: string;
  name: string;
  category: IntegrationCategory;
  version: string;
  description: string;
  author?: string;
  website?: string;

  auth: {
    type: AuthType;
    scopes?: string[];
    authUrl?: string;
    tokenUrl?: string;
    envVars?: string[];
  };

  tools: ToolDeclaration[];

  config?: {
    schema: Record<string, unknown>;
    defaults?: Record<string, unknown>;
  };

  requires?: {
    env?: string[];
    bins?: string[];
    integrations?: string[];
  };

  capabilities?: {
    offline?: boolean;
    streaming?: boolean;
    webhooks?: boolean;
  };
}

export interface IntegrationContext {
  config: WispyConfig;
  runtimeDir: string;
  soulDir: string;
  credentialManager: CredentialManager;
  logger: Logger;
}

// ─── Base Class ─────────────────────────────────────────────

export abstract class Integration {
  abstract readonly manifest: IntegrationManifest;
  protected ctx: IntegrationContext;

  constructor(ctx: IntegrationContext) {
    this.ctx = ctx;
  }

  /** Called when the integration is enabled. Set up clients, connections. */
  async onEnable(): Promise<void> {}

  /** Called when the integration is disabled. Clean up resources. */
  async onDisable(): Promise<void> {}

  /** Called when credentials are updated (e.g., token refresh). */
  async onCredentialUpdate(): Promise<void> {}

  /** Execute a tool by name with the given arguments. */
  abstract executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult>;

  /** Check if the integration is healthy and connected. */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }

  /** Helper: check if required credentials exist. */
  protected hasCredentials(): boolean {
    return this.ctx.credentialManager.has(this.manifest.id);
  }

  /** Helper: get decrypted credentials. */
  protected async getCredentials<T = unknown>(): Promise<T | null> {
    return this.ctx.credentialManager.get(this.manifest.id) as Promise<T | null>;
  }

  /** Helper: return a tool error result. */
  protected error(message: string): ToolResult {
    return { success: false, output: "", error: message };
  }

  /** Helper: return a tool success result. */
  protected ok(output: string, metadata?: Record<string, unknown>): ToolResult {
    return { success: true, output, metadata };
  }
}
