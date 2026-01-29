import { createLogger } from "../infra/logger.js";

const log = createLogger("action-guard");

export type ActionCategory = "internal" | "external" | "destructive";

const EXTERNAL_ACTIONS = new Set([
  "send_message",
  "post_content",
  "wallet_pay",
  "send_email",
  "tweet",
]);

const DESTRUCTIVE_ACTIONS = new Set([
  "file_delete",
  "rm",
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

let approvalHandler: ApprovalCallback | null = null;

export function setApprovalHandler(handler: ApprovalCallback) {
  approvalHandler = handler;
}

export async function requestApproval(
  toolName: string,
  description: string,
  params: Record<string, unknown>
): Promise<boolean> {
  const category = categorizeAction(toolName);

  if (category === "internal") return true;

  if (!approvalHandler) {
    log.warn("No approval handler set, blocking %s action: %s", category, toolName);
    return false;
  }

  return approvalHandler({ toolName, category, description, params });
}
