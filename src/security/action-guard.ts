/**
 * Action Guard - Security layer for tool execution
 *
 * Integrates with TrustController for approval requests
 * via Telegram inline buttons, CLI, or REST API.
 */

import { createLogger } from "../infra/logger.js";
import { getTrustController, type TrustLevel } from "../trust/controller.js";

const log = createLogger("action-guard");

export type ActionCategory = "internal" | "external" | "destructive";

const EXTERNAL_ACTIONS = new Set([
  "send_message",
  "post_content",
  "wallet_pay",
  "x402_payment",
  "send_email",
  "tweet",
  "a2a_delegate",
]);

const DESTRUCTIVE_ACTIONS = new Set([
  "file_delete",
  "rm",
  "rm_rf",
  "drop_table",
  "wallet_transfer_all",
]);

export function categorizeAction(toolName: string): ActionCategory {
  if (DESTRUCTIVE_ACTIONS.has(toolName)) return "destructive";
  if (EXTERNAL_ACTIONS.has(toolName)) return "external";
  return "internal";
}

export interface ApprovalRequest {
  toolName: string;
  category: ActionCategory;
  description: string;
  params: Record<string, unknown>;
}

export type ApprovalCallback = (req: ApprovalRequest) => Promise<boolean>;

// Legacy callback for CLI mode
let legacyApprovalHandler: ApprovalCallback | null = null;

export function setApprovalHandler(handler: ApprovalCallback) {
  legacyApprovalHandler = handler;
}

/**
 * Request approval for an action through TrustController
 */
export async function requestApproval(
  toolName: string,
  description: string,
  params: Record<string, unknown>,
  context?: { channel?: string; userId?: string }
): Promise<boolean> {
  const category = categorizeAction(toolName);

  // Always allow internal actions
  if (category === "internal") return true;

  const trust = getTrustController();
  const channel = context?.channel || "cli";
  const userId = context?.userId || "default";

  // Use TrustController for channel-aware approval
  try {
    const approved = await trust.requestApproval({
      action: toolName,
      description,
      metadata: params,
      channel,
      userId,
    });

    if (!approved) {
      log.warn("Action %s denied by trust controls", toolName);
    }

    return approved;
  } catch (err) {
    // Fallback to legacy handler if TrustController fails
    if (legacyApprovalHandler) {
      log.debug("Falling back to legacy approval handler");
      return legacyApprovalHandler({ toolName, category, description, params });
    }

    log.warn("No approval handler available, blocking %s action: %s", category, toolName);
    return false;
  }
}

/**
 * Check if an action would require approval
 */
export function wouldRequireApproval(toolName: string): boolean {
  const category = categorizeAction(toolName);
  if (category === "internal") return false;

  const trust = getTrustController();
  const level = trust.getLevel(toolName);
  return level === "approve";
}

/**
 * Get trust level for an action
 */
export function getTrustLevel(toolName: string): TrustLevel {
  const trust = getTrustController();
  return trust.getLevel(toolName);
}
