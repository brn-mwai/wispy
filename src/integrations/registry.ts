/**
 * Central integration registry.
 *
 * Manages the lifecycle of all integrations: registration, enabling/disabling,
 * tool routing, and status reporting. Follows the Map-based registry pattern
 * from channels/dock.ts.
 */

import type {
  Integration,
  IntegrationCategory,
  IntegrationManifest,
  ToolDeclaration,
  ToolResult,
} from "./base.js";
import type { CredentialManager } from "./credential-manager.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("registry");

export type IntegrationStatus =
  | "active"
  | "disabled"
  | "error"
  | "auth-required";

export interface RegisteredIntegration {
  manifest: IntegrationManifest;
  instance: Integration;
  enabled: boolean;
  status: IntegrationStatus;
  error?: string;
  enabledAt?: string;
}

export class IntegrationRegistry {
  private integrations = new Map<string, RegisteredIntegration>();
  private toolMap = new Map<string, string>(); // tool name → integration ID
  private credentialManager: CredentialManager;

  constructor(credentialManager: CredentialManager) {
    this.credentialManager = credentialManager;
  }

  /**
   * Register an integration. Does not enable it.
   * Throws if any tool name conflicts with an existing tool.
   */
  register(integration: Integration): void {
    const { id } = integration.manifest;

    if (this.integrations.has(id)) {
      log.warn("Integration already registered: %s", id);
      return;
    }

    // Check for tool name conflicts
    for (const tool of integration.manifest.tools) {
      const existing = this.toolMap.get(tool.name);
      if (existing) {
        throw new Error(
          `Tool name conflict: "${tool.name}" already registered by "${existing}"`
        );
      }
    }

    // Register
    this.integrations.set(id, {
      manifest: integration.manifest,
      instance: integration,
      enabled: false,
      status: "disabled",
    });

    // Map tool names to integration ID
    for (const tool of integration.manifest.tools) {
      this.toolMap.set(tool.name, id);
    }

    log.debug("Registered integration: %s (%d tools)", id, integration.manifest.tools.length);
  }

  /**
   * Enable an integration. Checks credentials and calls onEnable().
   */
  async enable(id: string): Promise<void> {
    const reg = this.integrations.get(id);
    if (!reg) {
      throw new Error(`Integration not found: ${id}`);
    }

    // Check auth requirements
    if (reg.manifest.auth.type !== "none") {
      if (!this.credentialManager.has(id)) {
        reg.status = "auth-required";
        log.info("Integration %s requires authentication", id);
        return;
      }
    }

    // Check env var requirements
    if (reg.manifest.requires?.env) {
      for (const envVar of reg.manifest.requires.env) {
        if (!process.env[envVar]) {
          reg.status = "error";
          reg.error = `Missing env var: ${envVar}`;
          log.warn("Integration %s missing env: %s", id, envVar);
          return;
        }
      }
    }

    try {
      await reg.instance.onEnable();
      reg.enabled = true;
      reg.status = "active";
      reg.enabledAt = new Date().toISOString();
      reg.error = undefined;
      log.info("Enabled integration: %s", id);
    } catch (err) {
      reg.status = "error";
      reg.error = err instanceof Error ? err.message : String(err);
      log.error("Failed to enable %s: %s", id, reg.error);
    }
  }

  /**
   * Disable an integration. Calls onDisable().
   */
  async disable(id: string): Promise<void> {
    const reg = this.integrations.get(id);
    if (!reg) return;

    try {
      await reg.instance.onDisable();
    } catch {
      // Best-effort cleanup
    }

    reg.enabled = false;
    reg.status = "disabled";
    log.info("Disabled integration: %s", id);
  }

  /**
   * Execute a tool by name. Routes to the correct integration.
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult | null> {
    const integrationId = this.toolMap.get(toolName);
    if (!integrationId) return null; // Not an integration tool

    const reg = this.integrations.get(integrationId);
    if (!reg) {
      return { success: false, output: "", error: `Integration not found: ${integrationId}` };
    }
    if (!reg.enabled) {
      return {
        success: false,
        output: "",
        error: `Integration "${reg.manifest.name}" is not enabled. Run: wispy integrations enable ${integrationId}`,
      };
    }

    try {
      return await reg.instance.executeTool(toolName, args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Tool execution failed: %s.%s — %s", integrationId, toolName, message);
      return { success: false, output: "", error: message };
    }
  }

  /**
   * Get tool declarations for all enabled integrations.
   * Used to pass to Gemini function calling.
   */
  getToolDeclarations(): ToolDeclaration[] {
    const tools: ToolDeclaration[] = [];
    for (const reg of this.integrations.values()) {
      if (reg.enabled) {
        tools.push(...reg.manifest.tools);
      }
    }
    return tools;
  }

  /**
   * Get all tool declarations (including disabled) for discovery.
   */
  getAllToolDeclarations(): ToolDeclaration[] {
    const tools: ToolDeclaration[] = [];
    for (const reg of this.integrations.values()) {
      tools.push(...reg.manifest.tools);
    }
    return tools;
  }

  /**
   * Get integrations filtered by category.
   */
  getByCategory(category: IntegrationCategory): RegisteredIntegration[] {
    return Array.from(this.integrations.values()).filter(
      (r) => r.manifest.category === category
    );
  }

  /**
   * Get a single integration by ID.
   */
  get(id: string): RegisteredIntegration | undefined {
    return this.integrations.get(id);
  }

  /**
   * Get status of all integrations.
   */
  getStatus(): Array<{
    id: string;
    name: string;
    category: IntegrationCategory;
    status: IntegrationStatus;
    tools: number;
    error?: string;
  }> {
    return Array.from(this.integrations.values()).map((reg) => ({
      id: reg.manifest.id,
      name: reg.manifest.name,
      category: reg.manifest.category,
      status: reg.status,
      tools: reg.manifest.tools.length,
      error: reg.error,
    }));
  }

  /**
   * Total count of registered integrations.
   */
  get size(): number {
    return this.integrations.size;
  }

  /**
   * Count of enabled integrations.
   */
  get enabledCount(): number {
    return Array.from(this.integrations.values()).filter((r) => r.enabled).length;
  }
}
