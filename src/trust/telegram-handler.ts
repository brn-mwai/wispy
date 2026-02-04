/**
 * Telegram Trust Handler
 *
 * Sends inline keyboard buttons for approval requests
 * and handles callback responses.
 */

import { Bot, InlineKeyboard, type Context } from "grammy";
import {
  getTrustController,
  type ApprovalRequest,
  type TrustController,
} from "./controller.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("trust:telegram");

// Map chatId -> userId for approval routing
const userChatMap = new Map<string, string>();

/**
 * Format approval request for Telegram display
 */
function formatApprovalMessage(request: ApprovalRequest): string {
  const icons: Record<string, string> = {
    wallet_pay: "💰",
    x402_payment: "💳",
    send_email: "📧",
    tweet: "🐦",
    file_delete: "🗑️",
    send_message: "💬",
    post_content: "📝",
  };

  const icon = icons[request.action] || "⚡";
  const expiresIn = Math.max(0, Math.round(
    (request.expiresAt.getTime() - Date.now()) / 1000 / 60
  ));

  let msg = `${icon} *Approval Required*\n\n`;
  msg += `*Action:* \`${request.action}\`\n`;
  msg += `*Description:* ${request.description}\n`;

  // Show relevant metadata
  if (request.metadata.amount) {
    msg += `*Amount:* ${request.metadata.amount} ${request.metadata.currency || "USDC"}\n`;
  }
  if (request.metadata.recipient) {
    msg += `*To:* \`${String(request.metadata.recipient).slice(0, 10)}...\`\n`;
  }
  if (request.metadata.url) {
    msg += `*URL:* ${request.metadata.url}\n`;
  }

  msg += `\n⏱️ Expires in ${expiresIn} minutes`;

  return msg;
}

/**
 * Create inline keyboard for approval
 */
function createApprovalKeyboard(approvalId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Approve", `approve:${approvalId}`)
    .text("❌ Deny", `deny:${approvalId}`)
    .row()
    .text("✅ Allow Session", `approve_session:${approvalId}`);
}

/**
 * Initialize Telegram trust handler
 */
export function initTelegramTrustHandler(
  bot: Bot,
  controller?: TrustController
): void {
  const trust = controller || getTrustController();

  // Handle approval requests
  trust.on("approval:requested", async (request: ApprovalRequest) => {
    if (request.channel !== "telegram") return;

    const chatId = userChatMap.get(request.userId) || request.userId;

    try {
      await bot.api.sendMessage(
        chatId,
        formatApprovalMessage(request),
        {
          parse_mode: "Markdown",
          reply_markup: createApprovalKeyboard(request.id),
        }
      );
      log.info("Approval request sent to Telegram: %s", request.id);
    } catch (err) {
      log.error({ err }, "Failed to send approval request");
    }
  });

  // Handle callback queries (button presses)
  bot.on("callback_query:data", async (ctx: Context) => {
    const data = ctx.callbackQuery?.data || "";
    const userId = String(ctx.from?.id || "");

    // Parse callback data
    const [action, approvalId] = data.split(":");
    if (!approvalId) {
      await ctx.answerCallbackQuery("Invalid action");
      return;
    }

    const request = trust.getApproval(approvalId);
    if (!request) {
      await ctx.answerCallbackQuery("Approval expired or not found");
      await ctx.editMessageText("❌ *Approval expired or not found*", {
        parse_mode: "Markdown",
      });
      return;
    }

    // Verify user owns this approval
    if (request.userId !== userId) {
      await ctx.answerCallbackQuery("Not your approval request");
      return;
    }

    let approved = false;
    let allowSession = false;
    let responseText = "";

    switch (action) {
      case "approve":
        approved = true;
        responseText = "✅ *Approved*";
        break;
      case "approve_session":
        approved = true;
        allowSession = true;
        responseText = "✅ *Approved for this session*";
        break;
      case "deny":
        approved = false;
        responseText = "❌ *Denied*";
        break;
      default:
        await ctx.answerCallbackQuery("Unknown action");
        return;
    }

    // Process the response
    const success = trust.respond(approvalId, approved, allowSession);

    if (success) {
      await ctx.answerCallbackQuery(approved ? "Approved!" : "Denied");
      await ctx.editMessageText(
        `${responseText}\n\n` +
        `*Action:* \`${request.action}\`\n` +
        `*Description:* ${request.description}`,
        { parse_mode: "Markdown" }
      );
      log.info("Telegram approval response: %s -> %s", approvalId, action);
    } else {
      await ctx.answerCallbackQuery("Failed to process");
    }
  });

  // /approvals command to list pending
  bot.command("approvals", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    // Store chatId for this user
    userChatMap.set(userId, String(ctx.chat?.id || ""));

    const pending = trust.listPending()
      .filter(a => a.channel === "telegram" && a.userId === userId);

    if (pending.length === 0) {
      await ctx.reply("📭 No pending approvals.");
      return;
    }

    for (const request of pending) {
      await ctx.reply(
        formatApprovalMessage(request),
        {
          parse_mode: "Markdown",
          reply_markup: createApprovalKeyboard(request.id),
        }
      );
    }
  });

  // /trustlevel command to check action level
  bot.command("trustlevel", async (ctx: Context) => {
    const action = ctx.message?.text?.replace(/^\/trustlevel\s*/i, "").trim();

    if (!action) {
      await ctx.reply(
        "🔐 *Trust Levels*\n\n" +
        "*Usage:* `/trustlevel <action>`\n\n" +
        "*Levels:*\n" +
        "• `auto` - Automatically approved\n" +
        "• `notify` - Notified but not blocked\n" +
        "• `approve` - Requires explicit approval\n" +
        "• `deny` - Always denied\n\n" +
        "*Example:* `/trustlevel wallet_pay`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const level = trust.getLevel(action);
    const icons: Record<string, string> = {
      auto: "🟢",
      notify: "🟡",
      approve: "🟠",
      deny: "🔴",
    };

    await ctx.reply(
      `${icons[level]} *Trust Level for* \`${action}\`\n\n` +
      `Level: **${level.toUpperCase()}**`,
      { parse_mode: "Markdown" }
    );
  });

  log.info("Telegram trust handler initialized");
}

/**
 * Register user chat mapping (call on /start or first interaction)
 */
export function registerTelegramUser(userId: string, chatId: string): void {
  userChatMap.set(userId, chatId);
}
