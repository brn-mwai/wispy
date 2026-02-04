/**
 * Trust Controls Module
 *
 * Central export for Wispy trust infrastructure:
 * - TrustController: Approval workflows
 * - Telegram Handler: Inline button approvals
 * - ERC-8004: On-chain identity & reputation
 */

export {
  TrustController,
  getTrustController,
  initTrustController,
  type TrustConfig,
  type TrustRule,
  type TrustLevel,
  type ApprovalRequest,
} from "./controller.js";

export {
  initTelegramTrustHandler,
  registerTelegramUser,
} from "./telegram-handler.js";

export {
  ERC8004Client,
  getERC8004Client,
  initERC8004Client,
  type AgentRegistrationFile,
  type ReputationSummary,
  type ValidationStatus,
  type ERC8004Addresses,
} from "./erc8004.js";
