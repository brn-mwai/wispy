/**
 * Trust Controller - Central approval system for Wispy
 *
 * Integrates with Telegram inline buttons, CLI, and REST API
 * for human-in-the-loop approval of sensitive actions.
 */

import { createLogger } from "../infra/logger.js";
import { EventEmitter } from "events";

const log = createLogger("trust");

export type TrustLevel = "auto" | "notify" | "approve" | "deny";

export interface ApprovalRequest {
  id: string;
  action: string;
  description: string;
  metadata: Record<string, unknown>;
  level: TrustLevel;
  channel: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "approved" | "denied" | "expired";
}

export interface TrustConfig {
  defaultLevel: TrustLevel;
  approvalTimeoutMs: number;
  rules: TrustRule[];
}

export interface TrustRule {
  action: string | RegExp;
  level: TrustLevel;
  maxAmount?: number; // For payments
  conditions?: Record<string, unknown>;
}

// Autonomous mode rules - auto-approve most actions for coding/development
const AUTONOMOUS_RULES: TrustRule[] = [
  // Auto-approve file operations
  { action: "file_read", level: "auto" },
  { action: "file_write", level: "auto" },
  { action: "file_search", level: "auto" },
  { action: "file_delete", level: "auto" },
  { action: "file_copy", level: "auto" },
  { action: "file_move", level: "auto" },
  { action: "create_folder", level: "auto" },
  { action: "list_directory", level: "auto" },

  // Auto-approve bash/code execution
  { action: "bash", level: "auto" },
  { action: "localhost_serve", level: "auto" },

  // Auto-approve web and memory
  { action: "web_search", level: "auto" },
  { action: "web_fetch", level: "auto" },
  { action: "memory_recall", level: "auto" },
  { action: "memory_save", level: "auto" },
  { action: "memory_search", level: "auto" },

  // Auto-approve browser automation
  { action: "browser_navigate", level: "auto" },
  { action: "browser_click", level: "auto" },
  { action: "browser_type", level: "auto" },
  { action: "browser_screenshot", level: "auto" },
  { action: "browser_snapshot", level: "auto" },
  { action: "browser_scroll", level: "auto" },

  // Notify only for messaging
  { action: "send_message", level: "notify" },
  { action: "post_content", level: "notify" },

  // Still require approval for payments
  { action: "wallet_pay", level: "approve" },
  { action: "x402_payment", level: "approve" },
  { action: "tweet", level: "approve" },
  { action: "send_email", level: "approve" },

  // Deny dangerous
  { action: "wallet_transfer_all", level: "deny" },
  { action: "rm_rf", level: "deny" },
];

// Standard mode rules - require approval for most actions
const STANDARD_RULES: TrustRule[] = [
  // Auto-approve internal actions
  { action: "file_read", level: "auto" },
  { action: "web_search", level: "auto" },
  { action: "memory_recall", level: "auto" },

  // Notify for external but non-destructive
  { action: "send_message", level: "notify" },
  { action: "post_content", level: "notify" },

  // Require approval for payments and destructive
  { action: "wallet_pay", level: "approve" },
  { action: "x402_payment", level: "approve" },
  { action: "file_delete", level: "approve" },
  { action: "file_write", level: "approve" },
  { action: "bash", level: "approve" },
  { action: "tweet", level: "approve" },
  { action: "send_email", level: "approve" },

  // Deny by default
  { action: "wallet_transfer_all", level: "deny" },
  { action: "rm_rf", level: "deny" },
];

const DEFAULT_CONFIG: TrustConfig = {
  defaultLevel: "approve",
  approvalTimeoutMs: 5 * 60 * 1000, // 5 minutes
  rules: STANDARD_RULES,
};

/**
 * Enable autonomous mode - auto-approve file/code operations
 */
export function enableAutonomousMode(): void {
  const controller = getTrustController();
  // Clear existing rules and add autonomous rules
  controller.setRules(AUTONOMOUS_RULES);
  log.info("Autonomous mode enabled - file and code operations auto-approved");
}

/**
 * Enable standard mode - require approval for most actions
 */
export function enableStandardMode(): void {
  const controller = getTrustController();
  controller.setRules(STANDARD_RULES);
  log.info("Standard mode enabled - approval required for file/code operations");
}

export class TrustController extends EventEmitter {
  private config: TrustConfig;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private resolvers: Map<string, (approved: boolean) => void> = new Map();
  private sessionApprovals: Set<string> = new Set(); // "always allow" for session

  constructor(config: Partial<TrustConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Cleanup expired approvals every minute
    setInterval(() => this.cleanupExpired(), 60_000);
  }

  /**
   * Generate unique approval ID
   */
  private generateId(): string {
    return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get trust level for an action
   */
  getLevel(action: string, metadata?: Record<string, unknown>): TrustLevel {
    for (const rule of this.config.rules) {
      const matches = typeof rule.action === "string"
        ? rule.action === action
        : rule.action.test(action);

      if (matches) {
        // Check amount threshold for payments
        if (rule.maxAmount !== undefined && metadata?.amount !== undefined) {
          const amount = Number(metadata.amount);
          if (amount > rule.maxAmount) {
            return "approve"; // Escalate if over threshold
          }
        }
        return rule.level;
      }
    }
    return this.config.defaultLevel;
  }

  /**
   * Create an approval request
   */
  async createApproval(params: {
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
    channel: string;
    userId: string;
    timeout?: number;
  }): Promise<{ id: string; level: TrustLevel }> {
    const level = this.getLevel(params.action, params.metadata);

    // Handle auto and deny without creating approval
    if (level === "auto") {
      return { id: "auto", level };
    }

    if (level === "deny") {
      log.warn("Action denied by policy: %s", params.action);
      return { id: "denied", level };
    }

    // Check session approvals
    const sessionKey = `${params.action}:${params.channel}:${params.userId}`;
    if (this.sessionApprovals.has(sessionKey)) {
      log.debug("Action auto-approved by session: %s", params.action);
      return { id: "session", level: "auto" };
    }

    const id = this.generateId();
    const timeout = params.timeout || this.config.approvalTimeoutMs;

    const request: ApprovalRequest = {
      id,
      action: params.action,
      description: params.description,
      metadata: params.metadata || {},
      level,
      channel: params.channel,
      userId: params.userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + timeout),
      status: "pending",
    };

    this.pendingApprovals.set(id, request);

    // Emit event for channel handlers
    this.emit("approval:requested", request);

    log.info("Approval requested: %s for %s (%s)", id, params.action, level);
    return { id, level };
  }

  /**
   * Request approval and wait for response
   */
  async requestApproval(params: {
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
    channel: string;
    userId: string;
    timeout?: number;
  }): Promise<boolean> {
    const { id, level } = await this.createApproval(params);

    if (level === "auto" || id === "session") return true;
    if (level === "deny" || id === "denied") return false;
    if (level === "notify") {
      // Notify only - don't wait for approval
      return true;
    }

    // Wait for approval response
    return new Promise<boolean>((resolve) => {
      this.resolvers.set(id, resolve);

      // Auto-deny on timeout
      const timeout = params.timeout || this.config.approvalTimeoutMs;
      setTimeout(() => {
        if (this.resolvers.has(id)) {
          log.warn("Approval timed out: %s", id);
          this.resolvers.delete(id);
          this.updateStatus(id, "expired");
          resolve(false);
        }
      }, timeout);
    });
  }

  /**
   * Respond to an approval request
   */
  respond(id: string, approved: boolean, allowSession: boolean = false): boolean {
    const request = this.pendingApprovals.get(id);
    if (!request || request.status !== "pending") {
      log.warn("Invalid or already processed approval: %s", id);
      return false;
    }

    request.status = approved ? "approved" : "denied";

    // Handle session approval
    if (approved && allowSession) {
      const sessionKey = `${request.action}:${request.channel}:${request.userId}`;
      this.sessionApprovals.add(sessionKey);
      log.info("Session approval granted for: %s", request.action);
    }

    // Resolve waiting promise
    const resolver = this.resolvers.get(id);
    if (resolver) {
      resolver(approved);
      this.resolvers.delete(id);
    }

    this.emit("approval:responded", { ...request, approved });
    log.info("Approval %s: %s (%s)", approved ? "granted" : "denied", id, request.action);

    return true;
  }

  /**
   * Get pending approval by ID
   */
  getApproval(id: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(id);
  }

  /**
   * List all pending approvals
   */
  listPending(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(a => a.status === "pending");
  }

  /**
   * Check if approval is approved
   */
  isApproved(id: string): boolean {
    const request = this.pendingApprovals.get(id);
    return request?.status === "approved";
  }

  /**
   * Verify an approval (for CRE/x402 callbacks)
   */
  verifyApproval(id: string): { valid: boolean; request?: ApprovalRequest } {
    const request = this.pendingApprovals.get(id);
    if (!request) {
      return { valid: false };
    }
    return { valid: request.status === "approved", request };
  }

  /**
   * Update approval status
   */
  private updateStatus(id: string, status: ApprovalRequest["status"]) {
    const request = this.pendingApprovals.get(id);
    if (request) {
      request.status = status;
    }
  }

  /**
   * Cleanup expired approvals
   */
  private cleanupExpired() {
    const now = Date.now();
    for (const [id, request] of this.pendingApprovals) {
      if (request.status === "pending" && request.expiresAt.getTime() < now) {
        this.updateStatus(id, "expired");
        const resolver = this.resolvers.get(id);
        if (resolver) {
          resolver(false);
          this.resolvers.delete(id);
        }
      }
    }
  }

  /**
   * Add a trust rule
   */
  addRule(rule: TrustRule) {
    this.config.rules.unshift(rule); // Add at beginning for priority
  }

  /**
   * Set all rules (replaces existing)
   */
  setRules(rules: TrustRule[]) {
    this.config.rules = [...rules];
  }

  /**
   * Enable autonomous mode for a specific user/channel
   */
  enableAutonomousForSession(channel: string, userId: string) {
    // Add all autonomous actions to session approvals
    const autonomousActions = [
      "file_write", "file_delete", "file_copy", "file_move",
      "create_folder", "bash", "localhost_serve",
      "browser_navigate", "browser_click", "browser_type",
    ];
    for (const action of autonomousActions) {
      const sessionKey = `${action}:${channel}:${userId}`;
      this.sessionApprovals.add(sessionKey);
    }
    log.info("Autonomous mode enabled for %s:%s", channel, userId);
  }

  /**
   * Clear session approvals
   */
  clearSessionApprovals() {
    this.sessionApprovals.clear();
    log.info("Session approvals cleared");
  }
}

// Global instance
let globalController: TrustController | null = null;

export function getTrustController(): TrustController {
  if (!globalController) {
    globalController = new TrustController();
  }
  return globalController;
}

export function initTrustController(config?: Partial<TrustConfig>): TrustController {
  globalController = new TrustController(config);
  return globalController;
}
