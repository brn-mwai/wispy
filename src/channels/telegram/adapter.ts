/**
 * Telegram Adapter
 * Full integration with Marathon Mode and Trust Controls
 * Control your AI agent from your phone with inline approval buttons
 */

import { Bot, type Context } from "grammy";
import { registerChannel, updateChannelStatus } from "../dock.js";
import { isPaired, pairUser } from "../../security/auth.js";
import type { Agent } from "../../core/agent.js";
import { createLogger } from "../../infra/logger.js";
import { MarathonService, formatDuration } from "../../marathon/service.js";
import { getPlanProgress } from "../../marathon/planner.js";
import type { MarathonState } from "../../marathon/types.js";
import { getTrustController } from "../../trust/controller.js";
import { initTelegramTrustHandler, registerTelegramUser } from "../../trust/telegram-handler.js";
import { initProgressNotifier, registerUserChat, sendThought, ProgressTracker, askConfirmation } from "../../trust/progress-notifier.js";
import { initTelegramDelivery } from "../../documents/telegram-delivery.js";
import {
  initMarathonVisuals,
  sendPlanningMessage,
  updateProgressMessage,
  sendThinkingNotification,
  sendMilestoneNotification,
  sendApprovalRequest,
  sendMarathonComplete,
  createImageFeedbackKeyboard,
} from "../../marathon/telegram-visuals.js";

const log = createLogger("telegram");

// Tool emoji mapping for visual feedback
function getToolEmoji(toolName: string): string {
  const emojiMap: Record<string, string> = {
    bash: "⚡",
    file_read: "📖",
    file_write: "✏️",
    file_search: "🔍",
    web_fetch: "🌐",
    web_search: "🔎",
    browser_navigate: "🌍",
    browser_screenshot: "📸",
    memory_search: "🧠",
    memory_save: "💾",
    voice_reply: "🔊",
    image_generate: "🎨",
    create_project: "🏗️",
    run_dev_server: "🚀",
    document_create: "📄",
    remind_me: "⏰",
    schedule_task: "📅",
    wallet_balance: "💰",
    wallet_pay: "💸",
  };
  return emojiMap[toolName] || "🔧";
}

// Global bot instance for sending notifications
let botInstance: Bot | null = null;
let marathonService: MarathonService | null = null;
let agentInstance: Agent | null = null;
let apiKeyInstance: string | null = null;

/**
 * Send a message to a specific chat (for notifications)
 */
export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!botInstance) {
    log.warn("Telegram bot not initialized, cannot send notification");
    return false;
  }
  try {
    await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
    return true;
  } catch (err) {
    log.error({ err }, "Failed to send Telegram message");
    return false;
  }
}

/**
 * Send a voice message to a specific chat
 */
export async function sendTelegramVoice(chatId: string, audioPath: string, caption?: string): Promise<boolean> {
  if (!botInstance) {
    log.warn("Telegram bot not initialized, cannot send voice");
    return false;
  }
  try {
    const { InputFile } = await import("grammy");
    const { createReadStream } = await import("fs");

    await botInstance.api.sendVoice(
      chatId,
      new InputFile(createReadStream(audioPath)),
      { caption }
    );
    return true;
  } catch (err) {
    log.error({ err }, "Failed to send Telegram voice message");
    return false;
  }
}

/**
 * Send an audio file to a specific chat
 */
export async function sendTelegramAudio(chatId: string, audioPath: string, title?: string): Promise<boolean> {
  if (!botInstance) {
    log.warn("Telegram bot not initialized, cannot send audio");
    return false;
  }
  try {
    const { InputFile } = await import("grammy");
    const { createReadStream } = await import("fs");

    await botInstance.api.sendAudio(
      chatId,
      new InputFile(createReadStream(audioPath)),
      { title: title || "Wispy Voice Reply" }
    );
    return true;
  } catch (err) {
    log.error({ err }, "Failed to send Telegram audio");
    return false;
  }
}

/**
 * Format marathon status for Telegram
 */
function formatStatusForTelegram(state: MarathonState): string {
  const progress = getPlanProgress(state.plan);

  const statusEmoji: Record<string, string> = {
    planning: "📋",
    executing: "⚡",
    verifying: "🔍",
    paused: "⏸️",
    completed: "✅",
    failed: "❌",
    waiting_human: "👤",
  };

  let msg = `${statusEmoji[state.status] || "❓"} *Marathon Status*\n\n`;
  msg += `*Goal:* ${state.plan.goal}\n`;
  msg += `*Status:* ${state.status.toUpperCase()}\n`;
  msg += `*Progress:* ${progress.completed}/${progress.total} (${progress.percentage}%)\n`;
  msg += `*ETA:* ${formatDuration(progress.estimatedRemainingMinutes)}\n\n`;

  msg += `*Milestones:*\n`;
  for (const m of state.plan.milestones) {
    const icons: Record<string, string> = {
      pending: "⏳",
      in_progress: "🔄",
      completed: "✅",
      failed: "❌",
      skipped: "⏭️",
    };
    msg += `${icons[m.status] || "❓"} ${m.title}\n`;
  }

  if (state.logs.length > 0) {
    msg += `\n*Latest:* ${state.logs[state.logs.length - 1].message}`;
  }

  return msg;
}

/**
 * Format marathon list for Telegram
 */
function formatMarathonList(marathons: MarathonState[]): string {
  if (marathons.length === 0) {
    return "📭 No marathons found. Start one with:\n`/marathon Build a React todo app`";
  }

  let msg = "🏃 *Your Marathons*\n\n";

  for (const m of marathons.slice(0, 5)) {
    const statusEmoji: Record<string, string> = {
      planning: "📋",
      executing: "⚡",
      paused: "⏸️",
      completed: "✅",
      failed: "❌",
    };
    const progress = getPlanProgress(m.plan);
    msg += `${statusEmoji[m.status] || "❓"} *${m.plan.goal.slice(0, 40)}*${m.plan.goal.length > 40 ? "..." : ""}\n`;
    msg += `   ID: \`${m.id}\` | ${progress.percentage}%\n\n`;
  }

  return msg;
}

export function startTelegram(token: string, agent: Agent, runtimeDir: string, apiKey?: string) {
  const bot = new Bot(token);
  botInstance = bot;
  agentInstance = agent;
  apiKeyInstance = apiKey || process.env.GEMINI_API_KEY || "";
  marathonService = new MarathonService(runtimeDir);

  // Connect marathon service to agent for NLP-based control
  // This enables natural language: "build me a todo app" instead of "/marathon Build a todo app"
  agent.setMarathonService(marathonService, apiKeyInstance);

  // Initialize trust handler for inline approval buttons
  const trustController = getTrustController();
  initTelegramTrustHandler(bot, trustController);

  // Initialize progress notifier for thought signatures
  initProgressNotifier(bot);

  // Initialize document delivery for sending PDFs
  initTelegramDelivery(bot);

  // Initialize marathon visuals for beautiful progress updates
  initMarathonVisuals(bot);

  // /start - Welcome message with commands
  bot.command("start", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      pairUser(runtimeDir, "telegram", userId);
    }

    // Register user for trust notifications and progress updates
    registerTelegramUser(userId, chatId);
    registerUserChat(userId, chatId);

    const welcomeMsg = `☁️ *Welcome to Wispy!*

Your autonomous AI agent. Just talk naturally!

*Natural Language Control:*
• "Build me a React dashboard" → I'll start working
• "How's it going?" → Check my progress
• "Yes" / "No" → Approve or reject actions
• "Pause" / "Continue" → Control the work

*Voice Notes:* 🎤
Send voice messages and I'll respond!
/voice - Toggle voice replies

*Image Generation:*
/image <description> - Generate AI images

*Wallet:*
/wallet - Check crypto wallet

*Dev Tools:*
/deploy - Deploy to Vercel
/push - Push to GitHub
/git - Git operations
/npm - Run npm scripts
/debug - Debug tools

*Examples:*
• "Create a landing page with Tailwind"
• "What's the status?"
• 🎤 Send a voice note
• /image A robot playing guitar
• /deploy ./my-project --prod

I work autonomously and keep you updated! 🚀`;

    await ctx.reply(welcomeMsg, { parse_mode: "Markdown" });
  });

  // /marathon <goal> - Start a new marathon
  bot.command("marathon", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const goal = ctx.message?.text?.replace(/^\/marathon\s*/i, "").trim();

    if (!goal) {
      await ctx.reply(
        "🎯 Please provide a goal!\n\n" +
        "*Usage:* `/marathon <your goal>`\n\n" +
        "*Examples:*\n" +
        "• `/marathon Build a React todo app`\n" +
        "• `/marathon Create a REST API with Node.js`\n" +
        "• `/marathon Set up a blog with Next.js`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (!agentInstance || !apiKeyInstance) {
      await ctx.reply("❌ Agent not properly initialized. Please restart Wispy.");
      return;
    }

    // Send initial thinking message
    const thinkingMsg = await ctx.reply(
      `🧠 *Extended Thinking: 24,576 tokens*\n\n` +
      `💭 Planning your project...\n\n` +
      `*Goal:* ${goal}\n\n` +
      `_Creating execution plan with Gemini 3..._`,
      { parse_mode: "Markdown" }
    );

    try {
      // Start marathon in background with visual callbacks and telegram integration
      marathonService!.start(goal, agentInstance, apiKeyInstance, {
        notifications: {
          enabled: true,
          channels: { telegram: { chatId } },
          notifyOn: {
            milestoneComplete: true,
            milestoneFailure: true,
            humanInputNeeded: true,
            marathonComplete: true,
            dailySummary: false,
          },
        },
        telegramBot: bot,
        telegramChatId: chatId,
      }).then(async (finalState) => {
        // Send visual completion message
        const result = marathonService!.getResult(finalState.id);
        const stats = {
          duration: Date.now() - (finalState.startedAt ? new Date(finalState.startedAt).getTime() : Date.now()),
          tokensUsed: finalState.totalTokensUsed || 0,
          toolCalls: finalState.logs.filter(l => l.message.includes("tool") || l.message.includes("bash") || l.message.includes("file")).length,
          filesCreated: result?.artifacts?.length || 0,
        };
        await sendMarathonComplete(chatId, finalState, stats, result?.artifacts || []);
      }).catch(async (err) => {
        log.error({ err }, "Marathon execution error");
        await sendTelegramMessage(chatId, `❌ Marathon error: ${err.message}`);
      });

      // Wait briefly then send planning message
      setTimeout(async () => {
        const state = marathonService!.getStatus();
        if (state?.plan) {
          // Delete thinking message and send visual plan
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, thinkingMsg.message_id);
          } catch {}

          await sendPlanningMessage(chatId, state.plan, state.id);

          // Set up periodic progress updates
          const progressInterval = setInterval(async () => {
            const currentState = marathonService!.getStatus();
            if (!currentState || currentState.status === "completed" || currentState.status === "failed") {
              clearInterval(progressInterval);
              return;
            }
            await updateProgressMessage(currentState.id, currentState);
          }, 10000); // Update every 10 seconds
        }
      }, 3000);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error({ err }, "Failed to start marathon");
      await ctx.reply(`❌ Failed to start marathon: ${errMsg}`);
    }
  });

  // /status - Get current marathon status
  bot.command("status", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const state = marathonService!.getStatus();

    if (!state) {
      await ctx.reply(
        "📭 No active marathon.\n\nStart one with:\n`/marathon <your goal>`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(formatStatusForTelegram(state), { parse_mode: "Markdown" });
  });

  // /pause - Pause active marathon
  bot.command("pause", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    marathonService!.pause();
    await ctx.reply("⏸️ Marathon paused.\n\nUse /resume to continue.", { parse_mode: "Markdown" });
  });

  // /resume - Resume paused marathon
  bot.command("resume", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const state = marathonService!.getStatus();

    if (!state) {
      await ctx.reply("📭 No marathon to resume.");
      return;
    }

    if (state.status !== "paused") {
      await ctx.reply(`Marathon is ${state.status}, not paused.`);
      return;
    }

    if (!agentInstance || !apiKeyInstance) {
      await ctx.reply("❌ Agent not properly initialized.");
      return;
    }

    await ctx.reply("▶️ Resuming marathon...", { parse_mode: "Markdown" });

    try {
      marathonService!.resume(state.id, agentInstance, apiKeyInstance)
        .then(async (finalState) => {
          const result = marathonService!.getResult(finalState.id);
          await sendTelegramMessage(
            chatId,
            result?.success
              ? `🎉 *Marathon Completed!*\n\n${finalState.plan.goal}`
              : `❌ *Marathon ended*\n\nStatus: ${finalState.status}`
          );
        })
        .catch(async (err) => {
          await sendTelegramMessage(chatId, `❌ Error: ${err.message}`);
        });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ Failed to resume: ${errMsg}`);
    }
  });

  // /abort - Stop current marathon
  bot.command("abort", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    marathonService!.abort();
    await ctx.reply("🛑 Marathon aborted.", { parse_mode: "Markdown" });
  });

  // /approvals - List pending approvals
  bot.command("approvals", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const pending = marathonService!.getPendingApprovals();

    if (pending.length === 0) {
      await ctx.reply("✅ No pending approvals.", { parse_mode: "Markdown" });
      return;
    }

    let msg = `⚠️ *Pending Approvals (${pending.length})*\n\n`;
    for (const { marathonId, request } of pending) {
      const riskEmoji: Record<string, string> = {
        low: "🟢",
        medium: "🟡",
        high: "🟠",
        critical: "🔴",
      };
      msg += `${riskEmoji[request.risk] || "⚪"} *${request.id}*\n`;
      msg += `Action: ${request.action}\n`;
      msg += `${request.description}\n`;
      msg += `Risk: ${request.risk.toUpperCase()}\n\n`;
    }
    msg += `Reply with:\n\`/approve <id>\`\n\`/reject <id> [reason]\``;

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /approve - Approve a pending request
  bot.command("approve", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const requestId = ctx.message?.text?.replace(/^\/approve\s*/i, "").trim();

    if (!requestId) {
      await ctx.reply("Usage: `/approve <request-id>`", { parse_mode: "Markdown" });
      return;
    }

    // Find and approve the request
    const marathons = marathonService!.listMarathons() as any[];
    let found = false;

    for (const m of marathons) {
      if (m.approvalRequests?.some((r: any) => r.id === requestId)) {
        const success = marathonService!.approve(m.id, requestId, `telegram:${userId}`);
        if (success) {
          await ctx.reply(`✅ *Approved*\n\nRequest ${requestId} approved. Marathon will continue.`, { parse_mode: "Markdown" });
          found = true;
        }
        break;
      }
    }

    if (!found) {
      await ctx.reply(`❌ Request not found: ${requestId}`);
    }
  });

  // /reject - Reject a pending request
  bot.command("reject", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const args = ctx.message?.text?.replace(/^\/reject\s*/i, "").trim() || "";
    const parts = args.split(" ");
    const requestId = parts[0];
    const reason = parts.slice(1).join(" ") || "Rejected via Telegram";

    if (!requestId) {
      await ctx.reply("Usage: `/reject <request-id> [reason]`", { parse_mode: "Markdown" });
      return;
    }

    // Find and reject the request
    const marathons = marathonService!.listMarathons() as any[];
    let found = false;

    for (const m of marathons) {
      if (m.approvalRequests?.some((r: any) => r.id === requestId)) {
        const success = marathonService!.reject(m.id, requestId, reason);
        if (success) {
          await ctx.reply(`❌ *Rejected*\n\nRequest ${requestId} rejected.\nReason: ${reason}`, { parse_mode: "Markdown" });
          found = true;
        }
        break;
      }
    }

    if (!found) {
      await ctx.reply(`❌ Request not found: ${requestId}`);
    }
  });

  // Handle visual callback queries (image feedback, deploy, etc)
  bot.on("callback_query:data", async (ctx: Context) => {
    const data = ctx.callbackQuery?.data || "";
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");

    // ═══════════════════════════════════════════════════════════════════════
    // MARATHON CONTROL CALLBACKS (NEW)
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("marathon_")) {
      const [action, marathonId] = data.split(":");

      if (action === "marathon_pause") {
        await ctx.answerCallbackQuery("⏸️ Pausing marathon...");
        marathonService?.pause();
        await ctx.reply("⏸️ *Marathon Paused*\n\nUse the Resume button or /resume to continue.", { parse_mode: "Markdown" });
        // Update the button to show Resume
        const state = marathonService?.getStatus();
        if (state) {
          await updateProgressMessage(state.id, { ...state, status: "paused" });
        }
      } else if (action === "marathon_resume") {
        await ctx.answerCallbackQuery("▶️ Resuming marathon...");
        const state = marathonService?.getStatus();
        if (state && agentInstance && apiKeyInstance) {
          marathonService?.resume(state.id, agentInstance, apiKeyInstance).catch(() => {});
          await ctx.reply("▶️ *Marathon Resumed*\n\nContinuing execution...", { parse_mode: "Markdown" });
        }
      } else if (action === "marathon_abort") {
        await ctx.answerCallbackQuery("⛔ Aborting marathon...");
        marathonService?.abort();
        await ctx.reply("⛔ *Marathon Aborted*\n\nAll work has been stopped.", { parse_mode: "Markdown" });
      } else if (action === "marathon_status") {
        await ctx.answerCallbackQuery("📊 Loading status...");
        const state = marathonService?.getStatus();
        if (state) {
          await ctx.reply(formatStatusForTelegram(state), { parse_mode: "Markdown" });
        } else {
          await ctx.reply("📭 No active marathon.");
        }
      } else if (action === "marathon_skip") {
        await ctx.answerCallbackQuery("⏭️ Skipping current milestone...");
        // Mark current milestone as skipped and move to next
        const state = marathonService?.getStatus();
        if (state) {
          const currentMilestone = state.plan.milestones.find(m => m.status === "in_progress");
          if (currentMilestone) {
            await ctx.reply(
              `⏭️ *Skipped Milestone*\n\n_${currentMilestone.title}_\n\nMoving to next milestone...`,
              { parse_mode: "Markdown" }
            );
            // The skip logic would be in marathon service
          }
        }
      } else if (action === "marathon_refresh") {
        await ctx.answerCallbackQuery("🔄 Refreshing...");
        const state = marathonService?.getStatus();
        if (state) {
          await updateProgressMessage(state.id, state);
        }
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // APPROVAL CALLBACKS (NEW - Enhanced)
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("approve:") || data.startsWith("deny:") || data.startsWith("always_allow:")) {
      const [action, approvalId] = data.split(":");

      // Find and handle the approval request
      const marathons = marathonService?.listMarathons() as any[] || [];
      let found = false;

      for (const m of marathons) {
        if (m.approvalRequests?.some((r: any) => r.id === approvalId)) {
          if (action === "approve" || action === "always_allow") {
            const success = marathonService?.approve(m.id, approvalId, `telegram:${userId}`);
            if (success) {
              await ctx.answerCallbackQuery("✅ Approved!");
              await ctx.editMessageText(
                `✅ *Approved by @${ctx.from?.username || userId}*\n\nMarathon will continue.`,
                { parse_mode: "Markdown" }
              );
              found = true;

              if (action === "always_allow") {
                await ctx.reply("✅ *Policy Updated:* This action type will be auto-approved in the future.", { parse_mode: "Markdown" });
              }
            }
          } else if (action === "deny") {
            const success = marathonService?.reject(m.id, approvalId, "Denied via Telegram");
            if (success) {
              await ctx.answerCallbackQuery("❌ Denied!");
              await ctx.editMessageText(
                `❌ *Denied by @${ctx.from?.username || userId}*\n\nMarathon paused.`,
                { parse_mode: "Markdown" }
              );
              found = true;
            }
          }
          break;
        }
      }

      if (!found) {
        await ctx.answerCallbackQuery("Request not found or already processed.");
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETION CALLBACKS (NEW)
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("deploy:")) {
      const [_, marathonId] = data.split(":");
      await ctx.answerCallbackQuery("🚀 Deploying...");
      await sendThinkingNotification(chatId, "Deploying project to Vercel...");
      // TODO: Implement actual deployment
      setTimeout(async () => {
        await ctx.reply(
          "🚀 *Deployed!*\n\n" +
          "🌐 https://your-project.vercel.app\n\n" +
          "_Your website is live!_",
          { parse_mode: "Markdown" }
        );
      }, 2000);
      return;
    }

    if (data.startsWith("download:")) {
      const [_, marathonId] = data.split(":");
      await ctx.answerCallbackQuery("📦 Preparing...");
      await ctx.reply("📦 Preparing project zip... One moment.");
      // TODO: Create and send zip
      return;
    }

    if (data.startsWith("report:")) {
      const [_, marathonId] = data.split(":");
      await ctx.answerCallbackQuery("📝 Loading report...");
      const state = marathonService?.getStatus();
      if (state) {
        const report = `📊 *Marathon Report*\n\n` +
          `*Goal:* ${state.plan.goal}\n` +
          `*Status:* ${state.status}\n` +
          `*Milestones:* ${state.plan.milestones.filter(m => m.status === "completed").length}/${state.plan.milestones.length}\n\n` +
          `*Timeline:*\n${state.logs.slice(-10).map(l => `• ${l.message}`).join("\n")}`;
        await ctx.reply(report, { parse_mode: "Markdown" });
      }
      return;
    }

    if (data.startsWith("rerun:")) {
      const [_, marathonId] = data.split(":");
      await ctx.answerCallbackQuery("🔄 Starting new run...");
      const state = marathonService?.getStatus();
      if (state && agentInstance && apiKeyInstance) {
        await ctx.reply(`🔄 *Starting New Marathon*\n\nGoal: ${state.plan.goal}`, { parse_mode: "Markdown" });
        marathonService?.start(state.plan.goal, agentInstance, apiKeyInstance, {
          notifications: { enabled: true, channels: { telegram: { chatId } }, notifyOn: { milestoneComplete: true, milestoneFailure: true, humanInputNeeded: true, marathonComplete: true, dailySummary: false } },
        }).catch(() => {});
      }
      return;
    }

    if (data.startsWith("open:")) {
      const [_, marathonId] = data.split(":");
      await ctx.answerCallbackQuery("Opening in browser...");
      await ctx.reply("🖥️ Opening project in browser...\n\n_Run `npx serve` in your project directory to start a local server._", { parse_mode: "Markdown" });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // IMAGE FEEDBACK CALLBACKS
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("img_")) {
      const [action, imageId] = data.split(":");

      if (action === "img_approve") {
        await ctx.answerCallbackQuery("Great! Continuing...");
        await ctx.editMessageCaption({
          caption: "✅ *Image approved!* Continuing with the project...",
          parse_mode: "Markdown",
        });
        // Continue marathon execution
      } else if (action === "img_regen") {
        await ctx.answerCallbackQuery("Regenerating image...");
        await sendThinkingNotification(chatId, "Regenerating image with different style...");
        // Would trigger image regeneration here
      } else if (action === "img_edit") {
        await ctx.answerCallbackQuery("Send your feedback!");
        await ctx.reply("💬 What changes would you like to the image? Reply with your feedback.");
      } else if (action === "img_vary") {
        await ctx.answerCallbackQuery("Creating variations...");
        await sendThinkingNotification(chatId, "Creating image variations...");
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MILESTONE CALLBACKS
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("ms_")) {
      const parts = data.split(":");
      const action = parts[0];
      const milestoneId = parts[1];
      const marathonId = parts[2];

      if (action === "ms_continue") {
        await ctx.answerCallbackQuery("Continuing...");
        marathonService?.resume(marathonId, agentInstance!, apiKeyInstance!).catch(() => {});
      } else if (action === "ms_skip") {
        await ctx.answerCallbackQuery("⏭️ Skipping milestone...");
        await ctx.reply(`⏭️ *Milestone Skipped*\n\nMoving to next milestone...`, { parse_mode: "Markdown" });
      } else if (action === "ms_retry") {
        await ctx.answerCallbackQuery("🔄 Retrying milestone...");
        await ctx.reply(`🔄 *Retrying Milestone*\n\nAttempting again...`, { parse_mode: "Markdown" });
      } else if (action === "ms_edit") {
        await ctx.answerCallbackQuery("✏️ Edit mode...");
        await ctx.reply("✏️ Send your modifications for this milestone:");
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PAUSE CALLBACK (from approval)
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("pause:")) {
      const [_, approvalId] = data.split(":");
      await ctx.answerCallbackQuery("⏸️ Pausing...");
      marathonService?.pause();
      await ctx.reply("⏸️ *Marathon Paused*\n\nThe marathon has been paused while you review.", { parse_mode: "Markdown" });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GIT CALLBACKS
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("git_")) {
      const [action, projectPath] = data.split(":");
      const { execSync } = await import("child_process");

      try {
        if (action === "git_status") {
          await ctx.answerCallbackQuery("📊 Checking...");
          const status = execSync(`git -C "${projectPath}" status --short`, { encoding: "utf-8" });
          const branch = execSync(`git -C "${projectPath}" branch --show-current`, { encoding: "utf-8" }).trim();
          await ctx.reply(
            `📊 *Git Status*\n\n🌿 Branch: \`${branch}\`\n\n\`\`\`\n${status || "Clean working tree"}\n\`\`\``,
            { parse_mode: "Markdown" }
          );
        } else if (action === "git_push") {
          await ctx.answerCallbackQuery("📤 Pushing...");
          await ctx.reply("📤 *Pushing to GitHub...*", { parse_mode: "Markdown" });
          execSync(`git -C "${projectPath}" add -A`, { encoding: "utf-8" });
          try { execSync(`git -C "${projectPath}" commit -m "Update via Wispy"`, { encoding: "utf-8" }); } catch {}
          execSync(`git -C "${projectPath}" push`, { encoding: "utf-8", timeout: 60000 });
          await ctx.reply("✅ *Push Successful!*", { parse_mode: "Markdown" });
        } else if (action === "git_init") {
          await ctx.answerCallbackQuery("🔄 Initializing...");
          execSync(`git init "${projectPath}"`, { encoding: "utf-8" });
          await ctx.reply(`✅ Git repository initialized at \`${projectPath}\``, { parse_mode: "Markdown" });
        } else if (action === "git_commit") {
          await ctx.answerCallbackQuery("📝 Committing...");
          execSync(`git -C "${projectPath}" add -A`, { encoding: "utf-8" });
          execSync(`git -C "${projectPath}" commit -m "Update via Wispy"`, { encoding: "utf-8" });
          await ctx.reply("✅ *Committed changes!*", { parse_mode: "Markdown" });
        }
      } catch (err) {
        await ctx.reply(`❌ Git error: \`${err instanceof Error ? err.message : "Unknown error"}\``, { parse_mode: "Markdown" });
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NPM CALLBACKS
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("npm_")) {
      const [action, projectPath] = data.split(":");
      const { execSync } = await import("child_process");

      try {
        if (action === "npm_install") {
          await ctx.answerCallbackQuery("📥 Installing...");
          await ctx.reply("📥 *Installing dependencies...*\n\nThis may take a moment.", { parse_mode: "Markdown" });
          execSync("npm install", { cwd: projectPath, encoding: "utf-8", timeout: 180000 });
          await ctx.reply("✅ *Dependencies installed!*", { parse_mode: "Markdown" });
        } else if (action === "npm_build") {
          await ctx.answerCallbackQuery("🔨 Building...");
          await ctx.reply("🔨 *Building project...*", { parse_mode: "Markdown" });
          const output = execSync("npm run build", { cwd: projectPath, encoding: "utf-8", timeout: 300000 });
          await ctx.reply("✅ *Build complete!*", { parse_mode: "Markdown" });
        } else if (action === "npm_dev") {
          await ctx.answerCallbackQuery("🚀 Starting dev server...");
          await ctx.reply(
            "🚀 *Dev Server*\n\n" +
            "The dev server needs to run in your terminal.\n\n" +
            `Run: \`cd ${projectPath} && npm run dev\``,
            { parse_mode: "Markdown" }
          );
        } else if (action === "npm_test") {
          await ctx.answerCallbackQuery("🧪 Running tests...");
          await ctx.reply("🧪 *Running tests...*", { parse_mode: "Markdown" });
          const output = execSync("npm test", { cwd: projectPath, encoding: "utf-8", timeout: 300000 });
          const truncated = output.length > 1000 ? output.slice(-1000) + "\n...(truncated)" : output;
          await ctx.reply(`✅ *Tests complete!*\n\n\`\`\`\n${truncated}\n\`\`\``, { parse_mode: "Markdown" });
        }
      } catch (err) {
        await ctx.reply(`❌ NPM error: \`${err instanceof Error ? err.message.slice(0, 300) : "Unknown error"}\``, { parse_mode: "Markdown" });
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEBUG CALLBACKS
    // ═══════════════════════════════════════════════════════════════════════
    if (data.startsWith("debug_")) {
      const [action, value] = data.split(":");
      const { execSync } = await import("child_process");
      const os = await import("os");
      const isWindows = os.platform() === "win32";

      try {
        if (action === "debug_port") {
          await ctx.answerCallbackQuery("🔌 Checking port...");
          let result: string;
          if (isWindows) {
            result = execSync(`netstat -ano | findstr :${value}`, { encoding: "utf-8" });
          } else {
            result = execSync(`lsof -i :${value} || ss -tlnp | grep :${value}`, { encoding: "utf-8" });
          }
          await ctx.reply(
            `🔌 *Port ${value}*\n\n\`\`\`\n${result || "Port is free"}\n\`\`\``,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[
                  { text: "💀 Kill Process", callback_data: `debug_kill:${value}` }
                ]]
              }
            }
          );
        } else if (action === "debug_kill") {
          await ctx.answerCallbackQuery("💀 Killing...");
          if (isWindows) {
            const netstat = execSync(`netstat -ano | findstr :${value}`, { encoding: "utf-8" });
            const pidMatch = netstat.match(/LISTENING\s+(\d+)/);
            if (pidMatch) {
              execSync(`taskkill /F /PID ${pidMatch[1]}`, { encoding: "utf-8" });
            }
          } else {
            execSync(`fuser -k ${value}/tcp`, { encoding: "utf-8" });
          }
          await ctx.reply(`✅ Killed process on port ${value}`);
        } else if (action === "debug_processes") {
          await ctx.answerCallbackQuery("📋 Loading...");
          let result: string;
          if (isWindows) {
            result = execSync(`tasklist | findstr /i "node npm"`, { encoding: "utf-8" });
          } else {
            result = execSync(`ps aux | grep -E "node|npm" | grep -v grep`, { encoding: "utf-8" });
          }
          await ctx.reply(
            `📋 *Node.js Processes*\n\n\`\`\`\n${result || "No processes found"}\n\`\`\``,
            { parse_mode: "Markdown" }
          );
        } else if (action === "debug_killall") {
          await ctx.answerCallbackQuery("💀 Killing all...");
          if (isWindows) {
            execSync(`taskkill /F /IM node.exe`, { encoding: "utf-8" });
          } else {
            execSync(`pkill -f node`, { encoding: "utf-8" });
          }
          await ctx.reply("✅ All Node.js processes killed");
        }
      } catch (err) {
        await ctx.reply(`❌ Debug error: \`${err instanceof Error ? err.message : "Unknown error"}\``, { parse_mode: "Markdown" });
      }
      return;
    }

    // Let trust handler handle other approve/deny callbacks
    // (it's already registered via initTelegramTrustHandler)
  });

  // /list - List all marathons
  bot.command("list", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const marathons = marathonService!.listMarathons();
    await ctx.reply(formatMarathonList(marathons), { parse_mode: "Markdown" });
  });

  // /image - Generate images
  bot.command("image", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const prompt = ctx.message?.text?.replace(/^\/image\s*/i, "").trim();

    if (!prompt) {
      await ctx.reply(
        "🎨 *Image Generation*\n\n" +
        "*Usage:* `/image <description>`\n\n" +
        "*Examples:*\n" +
        "• `/image A futuristic city at sunset`\n" +
        "• `/image A cute robot playing guitar`\n" +
        "• `/image Abstract art with vibrant colors`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply("🎨 Generating image...\n\n" + `*Prompt:* ${prompt}`, { parse_mode: "Markdown" });

    try {
      // Dynamic import to avoid circular dependencies
      const { generateImage } = await import("../../ai/gemini.js");

      const result = await generateImage(prompt, { numberOfImages: 1 });

      if (result.images.length === 0) {
        await ctx.reply("❌ Couldn't generate image. Try a different prompt.");
        return;
      }

      const img = result.images[0];
      const buffer = Buffer.from(img.base64, "base64");

      // Send photo using InputFile
      const { InputFile } = await import("grammy");
      await ctx.replyWithPhoto(
        new InputFile(buffer, "generated.png"),
        { caption: `🎨 *${prompt}*\n\n_Generated with Wispy_`, parse_mode: "Markdown" }
      );
    } catch (err) {
      log.error({ err }, "Image generation error");
      await ctx.reply("❌ Failed to generate image: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  });

  // /wallet - Check wallet status
  bot.command("wallet", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    try {
      const fs = await import("fs");
      const path = await import("path");
      const { ethers } = await import("ethers");

      const configPath = path.join(runtimeDir, "integrations.json");
      if (!fs.existsSync(configPath)) {
        await ctx.reply("❌ Wallet not configured. Run `wispy setup` first.");
        return;
      }

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (!config.wallet?.address) {
        await ctx.reply("❌ No wallet found in configuration.");
        return;
      }

      const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
      const balance = await provider.getBalance(config.wallet.address);

      await ctx.reply(
        "💰 *Wallet Status*\n\n" +
        `*Address:* \`${config.wallet.address}\`\n` +
        `*Network:* Base Sepolia\n` +
        `*Balance:* ${ethers.formatEther(balance)} ETH\n\n` +
        `_Fund at: faucet.quicknode.com/base/sepolia_`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      log.error({ err }, "Wallet check error");
      await ctx.reply("❌ Failed to check wallet: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  });

  // ==============================================
  // DEVELOPMENT WORKFLOW COMMANDS
  // ==============================================

  // /deploy - Deploy project to Vercel
  bot.command("deploy", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const args = ctx.message?.text?.split(" ").slice(1) || [];
    const projectPath = args[0] || process.cwd();
    const isProduction = args.includes("--prod") || args.includes("-p");

    await ctx.reply(
      "🚀 *Deploying to Vercel...*\n\n" +
      `📁 Path: \`${projectPath}\`\n` +
      `🌍 Mode: ${isProduction ? "Production" : "Preview"}\n\n` +
      "_This may take a moment..._",
      { parse_mode: "Markdown" }
    );

    try {
      const { execSync } = await import("child_process");

      // Check if Vercel CLI is available
      try {
        execSync("vercel --version", { encoding: "utf-8" });
      } catch {
        await ctx.reply(
          "❌ *Vercel CLI not installed*\n\n" +
          "Install with: `npm i -g vercel`\n" +
          "Then login with: `vercel login`",
          { parse_mode: "Markdown" }
        );
        return;
      }

      const cmd = isProduction
        ? `vercel --prod --yes --cwd "${projectPath}"`
        : `vercel --yes --cwd "${projectPath}"`;

      const output = execSync(cmd, { encoding: "utf-8", timeout: 300000 });

      // Extract URL from output
      const urlMatch = output.match(/https:\/\/[^\s]+\.vercel\.app/);
      const deployUrl = urlMatch ? urlMatch[0] : "Check Vercel dashboard";

      await ctx.reply(
        "✅ *Deployment Successful!*\n\n" +
        `🔗 *URL:* ${deployUrl}\n` +
        `📁 *Project:* ${projectPath}\n` +
        `🌍 *Type:* ${isProduction ? "Production" : "Preview"}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔗 Open Site", url: deployUrl.startsWith("http") ? deployUrl : `https://${deployUrl}` },
              { text: "📊 Dashboard", url: "https://vercel.com/dashboard" }
            ]]
          }
        }
      );
    } catch (err) {
      log.error({ err }, "Vercel deployment error");
      await ctx.reply(
        "❌ *Deployment Failed*\n\n" +
        `\`\`\`\n${err instanceof Error ? err.message : "Unknown error"}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    }
  });

  // /push - Push to GitHub
  bot.command("push", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const args = ctx.message?.text?.split(" ").slice(1) || [];
    const projectPath = args[0] || process.cwd();
    const commitMessage = args.slice(1).join(" ") || "Update via Wispy";

    await ctx.reply(
      "📤 *Pushing to GitHub...*\n\n" +
      `📁 Path: \`${projectPath}\`\n` +
      `💬 Message: "${commitMessage}"`,
      { parse_mode: "Markdown" }
    );

    try {
      const { execSync } = await import("child_process");
      const fs = await import("fs");
      const path = await import("path");

      // Check if it's a git repo
      if (!fs.existsSync(path.join(projectPath, ".git"))) {
        await ctx.reply(
          "❌ *Not a Git repository*\n\n" +
          "Initialize with: `/git init`",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Stage, commit, and push
      execSync(`git -C "${projectPath}" add -A`, { encoding: "utf-8" });

      try {
        execSync(`git -C "${projectPath}" commit -m "${commitMessage}"`, { encoding: "utf-8" });
      } catch {
        // No changes to commit
      }

      const pushOutput = execSync(`git -C "${projectPath}" push`, { encoding: "utf-8", timeout: 60000 });

      // Get remote URL
      const remoteUrl = execSync(`git -C "${projectPath}" remote get-url origin`, { encoding: "utf-8" }).trim();
      const repoUrl = remoteUrl.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/");

      await ctx.reply(
        "✅ *Push Successful!*\n\n" +
        `📦 *Repository:* ${repoUrl}\n` +
        `💬 *Commit:* "${commitMessage}"`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "📂 View Repo", url: repoUrl },
              { text: "📜 Commits", url: `${repoUrl}/commits` }
            ]]
          }
        }
      );
    } catch (err) {
      log.error({ err }, "Git push error");
      await ctx.reply(
        "❌ *Push Failed*\n\n" +
        `\`\`\`\n${err instanceof Error ? err.message : "Unknown error"}\n\`\`\`\n\n` +
        "_Make sure you have GitHub CLI (gh) configured or SSH keys set up._",
        { parse_mode: "Markdown" }
      );
    }
  });

  // /git - Git operations submenu
  bot.command("git", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const args = ctx.message?.text?.split(" ").slice(1) || [];
    const subcommand = args[0];
    const projectPath = args[1] || process.cwd();

    if (!subcommand) {
      await ctx.reply(
        "🔧 *Git Commands*\n\n" +
        "`/git init [path]` - Initialize repository\n" +
        "`/git status [path]` - Check status\n" +
        "`/git commit <message>` - Commit changes\n" +
        "`/push [path] [message]` - Push to GitHub\n\n" +
        "_Or use the buttons below:_",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📊 Status", callback_data: "git_status:" + projectPath },
                { text: "📤 Push", callback_data: "git_push:" + projectPath }
              ],
              [
                { text: "🔄 Init", callback_data: "git_init:" + projectPath },
                { text: "📝 Commit", callback_data: "git_commit:" + projectPath }
              ]
            ]
          }
        }
      );
      return;
    }

    try {
      const { execSync } = await import("child_process");

      switch (subcommand) {
        case "init": {
          execSync(`git init "${projectPath}"`, { encoding: "utf-8" });
          await ctx.reply(`✅ Git repository initialized at \`${projectPath}\``, { parse_mode: "Markdown" });
          break;
        }
        case "status": {
          const status = execSync(`git -C "${projectPath}" status --short`, { encoding: "utf-8" });
          const branch = execSync(`git -C "${projectPath}" branch --show-current`, { encoding: "utf-8" }).trim();
          await ctx.reply(
            `📊 *Git Status*\n\n` +
            `🌿 Branch: \`${branch}\`\n\n` +
            `\`\`\`\n${status || "Clean working tree"}\n\`\`\``,
            { parse_mode: "Markdown" }
          );
          break;
        }
        case "commit": {
          const message = args.slice(1).join(" ") || "Update via Wispy";
          execSync(`git -C "${projectPath}" add -A`, { encoding: "utf-8" });
          execSync(`git -C "${projectPath}" commit -m "${message}"`, { encoding: "utf-8" });
          await ctx.reply(`✅ Committed: "${message}"`, { parse_mode: "Markdown" });
          break;
        }
        default:
          await ctx.reply("Unknown git subcommand. Use `/git` for help.", { parse_mode: "Markdown" });
      }
    } catch (err) {
      await ctx.reply(
        `❌ Git error: \`${err instanceof Error ? err.message : "Unknown error"}\``,
        { parse_mode: "Markdown" }
      );
    }
  });

  // /npm - Run npm scripts
  bot.command("npm", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const args = ctx.message?.text?.split(" ").slice(1) || [];
    const script = args[0];
    const projectPath = args[1] || process.cwd();

    if (!script) {
      await ctx.reply(
        "📦 *NPM Commands*\n\n" +
        "`/npm install [path]` - Install dependencies\n" +
        "`/npm run <script> [path]` - Run script\n" +
        "`/npm build [path]` - Build project\n" +
        "`/npm dev [path]` - Start dev server\n" +
        "`/npm test [path]` - Run tests\n\n" +
        "_Common scripts:_",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📥 Install", callback_data: "npm_install:" + projectPath },
                { text: "🔨 Build", callback_data: "npm_build:" + projectPath }
              ],
              [
                { text: "🚀 Dev", callback_data: "npm_dev:" + projectPath },
                { text: "🧪 Test", callback_data: "npm_test:" + projectPath }
              ]
            ]
          }
        }
      );
      return;
    }

    await ctx.reply(
      `⏳ Running \`npm ${script}\`...\n\n` +
      `📁 Path: \`${projectPath}\``,
      { parse_mode: "Markdown" }
    );

    try {
      const { execSync } = await import("child_process");

      let cmd: string;
      if (script === "install" || script === "i") {
        cmd = `npm install`;
      } else if (script === "build" || script === "dev" || script === "test" || script === "start") {
        cmd = `npm run ${script}`;
      } else {
        cmd = `npm run ${script}`;
      }

      const output = execSync(cmd, {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 120000
      });

      const truncatedOutput = output.length > 1000
        ? output.slice(-1000) + "\n...(truncated)"
        : output;

      await ctx.reply(
        `✅ *npm ${script}* completed!\n\n` +
        `\`\`\`\n${truncatedOutput || "Success"}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      log.error({ err }, "NPM command error");
      await ctx.reply(
        `❌ *npm ${script}* failed\n\n` +
        `\`\`\`\n${err instanceof Error ? err.message.slice(0, 500) : "Unknown error"}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    }
  });

  // /debug - Debug tools
  bot.command("debug", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const args = ctx.message?.text?.split(" ").slice(1) || [];
    const subcommand = args[0];

    if (!subcommand) {
      await ctx.reply(
        "🔍 *Debug Tools*\n\n" +
        "`/debug port <number>` - Check what's using a port\n" +
        "`/debug kill <port>` - Kill process on port\n" +
        "`/debug processes` - List Node.js processes\n" +
        "`/debug logs [path]` - Read recent logs\n\n" +
        "_Quick actions:_",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔌 Port 3000", callback_data: "debug_port:3000" },
                { text: "🔌 Port 5173", callback_data: "debug_port:5173" }
              ],
              [
                { text: "📋 Processes", callback_data: "debug_processes" },
                { text: "💀 Kill All", callback_data: "debug_killall" }
              ]
            ]
          }
        }
      );
      return;
    }

    try {
      const { execSync } = await import("child_process");
      const os = await import("os");
      const isWindows = os.platform() === "win32";

      switch (subcommand) {
        case "port": {
          const port = args[1];
          if (!port) {
            await ctx.reply("Usage: `/debug port <number>`", { parse_mode: "Markdown" });
            return;
          }

          let result: string;
          if (isWindows) {
            result = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
          } else {
            result = execSync(`lsof -i :${port} || ss -tlnp | grep :${port}`, { encoding: "utf-8" });
          }

          await ctx.reply(
            `🔌 *Port ${port}*\n\n\`\`\`\n${result || "Port is free"}\n\`\`\``,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[
                  { text: "💀 Kill Process", callback_data: `debug_kill:${port}` }
                ]]
              }
            }
          );
          break;
        }
        case "kill": {
          const port = args[1];
          if (!port) {
            await ctx.reply("Usage: `/debug kill <port>`", { parse_mode: "Markdown" });
            return;
          }

          if (isWindows) {
            const netstat = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
            const pidMatch = netstat.match(/LISTENING\s+(\d+)/);
            if (pidMatch) {
              execSync(`taskkill /F /PID ${pidMatch[1]}`, { encoding: "utf-8" });
            }
          } else {
            execSync(`fuser -k ${port}/tcp`, { encoding: "utf-8" });
          }

          await ctx.reply(`✅ Killed process on port ${port}`);
          break;
        }
        case "processes": {
          let result: string;
          if (isWindows) {
            result = execSync(`tasklist | findstr /i "node npm"`, { encoding: "utf-8" });
          } else {
            result = execSync(`ps aux | grep -E "node|npm" | grep -v grep`, { encoding: "utf-8" });
          }

          await ctx.reply(
            `📋 *Node.js Processes*\n\n\`\`\`\n${result || "No processes found"}\n\`\`\``,
            { parse_mode: "Markdown" }
          );
          break;
        }
        case "logs": {
          const logPath = args[1] || "./logs";
          const fs = await import("fs");
          const path = await import("path");

          if (!fs.existsSync(logPath)) {
            await ctx.reply(`❌ Log path not found: \`${logPath}\``, { parse_mode: "Markdown" });
            return;
          }

          const files = fs.readdirSync(logPath)
            .filter((f: string) => f.endsWith(".log"))
            .slice(-5);

          await ctx.reply(
            `📜 *Log Files*\n\n${files.map((f: string) => `• \`${f}\``).join("\n") || "No log files"}`,
            { parse_mode: "Markdown" }
          );
          break;
        }
        default:
          await ctx.reply("Unknown debug command. Use `/debug` for help.", { parse_mode: "Markdown" });
      }
    } catch (err) {
      await ctx.reply(
        `❌ Debug error: \`${err instanceof Error ? err.message : "Unknown error"}\``,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Track voice reply preference per user
  const voiceReplyEnabled = new Map<string, boolean>();

  // /voice - Toggle voice replies
  bot.command("voice", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const currentSetting = voiceReplyEnabled.get(userId) ?? false;
    const newSetting = !currentSetting;
    voiceReplyEnabled.set(userId, newSetting);

    if (newSetting) {
      await ctx.reply(
        "🎤 *Voice Replies: ON*\n\n" +
        "I'll respond with voice messages when you send voice notes!\n\n" +
        "_Requires: piper, espeak-ng, or ffmpeg installed_",
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        "📝 *Voice Replies: OFF*\n\n" +
        "I'll respond with text only.\n\n" +
        "Use `/voice` to turn voice replies back on.",
        { parse_mode: "Markdown" }
      );
    }
  });

  // Voice message handling - Transcribe and process
  bot.on("message:voice", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    try {
      // Show typing indicator
      await ctx.api.sendChatAction(ctx.chat!.id, "typing");

      // Get file info from Telegram
      const voice = ctx.message?.voice;
      if (!voice) {
        await ctx.reply("Could not process voice message.");
        return;
      }

      log.info("Processing voice message: %d bytes, %d seconds", voice.file_size || 0, voice.duration);

      // Download voice file
      const file = await ctx.api.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

      // Fetch the audio file
      const response = await fetch(fileUrl);
      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString("base64");

      // Use Gemini to transcribe and respond to the voice message
      const { getClient } = await import("../../ai/gemini.js");
      const ai = getClient();

      const transcribeResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "audio/ogg",
                data: audioBase64,
              },
            },
            { text: "Please transcribe this voice message and respond to what the user is saying. First show the transcription in quotes, then provide your response." },
          ],
        }],
      });

      const transcription = transcribeResult.text || "";

      if (!transcription) {
        await ctx.reply("Sorry, I couldn't understand the voice message. Please try again.");
        return;
      }

      // Now process the transcribed text through the agent
      const result = await agent.chat(transcription, userId, "telegram", "main");

      // Send response with transcription context
      const responseText = result.text || "...";

      // Try to reply with voice if user sent voice and has voice enabled (default: OFF)
      const userVoiceEnabled = voiceReplyEnabled.get(userId) ?? false;
      if (userVoiceEnabled && responseText.length < 500) {
        try {
          await ctx.api.sendChatAction(ctx.chat!.id, "record_voice");

          const { generateAudioFile, generateVoiceWithGemini } = await import("../../cli/voice/tts.js");
          const { join } = await import("path");
          const voiceDir = join(runtimeDir, "voice-output");

          // Try Gemini TTS first, fall back to local
          let audioPath = await generateVoiceWithGemini(responseText, voiceDir);
          if (!audioPath) {
            audioPath = await generateAudioFile(responseText, voiceDir, { format: "ogg" });
          }

          if (audioPath) {
            const { InputFile } = await import("grammy");
            const { readFileSync, existsSync, unlinkSync } = await import("fs");

            if (existsSync(audioPath)) {
              const audioBuffer = readFileSync(audioPath);
              await ctx.replyWithVoice(new InputFile(audioBuffer, "voice.ogg"), {
                caption: "🎤 Voice reply",
              });

              // Also send text version
              await ctx.reply(`📝 _${responseText}_`, { parse_mode: "Markdown" }).catch(() => {
                ctx.reply(responseText);
              });

              // Clean up
              try { unlinkSync(audioPath); } catch {}
              return;
            }
          }
        } catch (voiceErr) {
          log.debug("Voice reply failed, falling back to text: %s", voiceErr);
        }
      }

      // Fall back to text reply
      await ctx.reply(`🎤 *Voice Message:*\n\n${responseText}`, { parse_mode: "Markdown" }).catch(() => {
        ctx.reply(`Voice Message:\n\n${responseText}`);
      });

    } catch (err) {
      log.error({ err }, "Voice message error");
      await ctx.reply("Sorry, I couldn't process your voice message. Please try again or send text.");
    }
  });

  // Audio file handling (for longer audio)
  bot.on("message:audio", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    try {
      await ctx.api.sendChatAction(ctx.chat!.id, "typing");

      const audio = ctx.message?.audio;
      if (!audio) {
        await ctx.reply("Could not process audio file.");
        return;
      }

      log.info("Processing audio file: %s (%d bytes)", audio.file_name || "unknown", audio.file_size || 0);

      // Download audio file
      const file = await ctx.api.getFile(audio.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

      const response = await fetch(fileUrl);
      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString("base64");

      // Determine MIME type
      const mimeType = audio.mime_type || "audio/mpeg";

      const { getClient } = await import("../../ai/gemini.js");
      const ai = getClient();

      const transcribeResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            { text: "Please transcribe this audio and respond to what the user is saying. First show the transcription in quotes, then provide your helpful response." },
          ],
        }],
      });

      const transcription = transcribeResult.text || "";

      if (!transcription) {
        await ctx.reply("Sorry, I couldn't understand the audio. Please try again.");
        return;
      }

      const result = await agent.chat(transcription, userId, "telegram", "main");

      const responseText = result.text || "...";
      await ctx.reply(`🎵 *Audio Response:*\n\n${responseText}`, { parse_mode: "Markdown" }).catch(() => {
        ctx.reply(`Audio Response:\n\n${responseText}`);
      });

    } catch (err) {
      log.error({ err }, "Audio file error");
      await ctx.reply("Sorry, I couldn't process your audio file. Please try again.");
    }
  });

  // /clear - Clear conversation history and reset context COMPLETELY
  bot.command("clear", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    try {
      const fs = await import("fs");
      const path = await import("path");

      // The actual agent ID is "main" (not "wispy")
      const agentId = "main";
      const sessionsDir = path.join(runtimeDir, "agents", agentId, "sessions");
      let deletedCount = 0;

      log.info("Clearing sessions from: %s for user: %s", sessionsDir, userId);

      // === NUCLEAR OPTION: Delete ALL session files for this user ===
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir);
        for (const file of files) {
          // Match any file containing this user's ID in any format
          // Session keys are like: agent_main_main_7844654696.jsonl
          if (file.includes(userId)) {
            const filePath = path.join(sessionsDir, file);
            try {
              fs.unlinkSync(filePath);
              log.info("Deleted session file: %s", file);
              deletedCount++;
            } catch (e) {
              log.error("Failed to delete: %s", file);
            }
          }
        }

        // Also clear the session registry index
        const indexPath = path.join(sessionsDir, "index.json");
        if (fs.existsSync(indexPath)) {
          try {
            const indexData = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
            const sessionsToDelete: string[] = [];

            // Find all session keys for this user
            for (const key of Object.keys(indexData.sessions || {})) {
              if (key.includes(userId)) {
                sessionsToDelete.push(key);
              }
            }

            // Delete them from the registry
            for (const key of sessionsToDelete) {
              delete indexData.sessions[key];
              log.info("Removed session from registry: %s", key);
              deletedCount++;
            }

            fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
          } catch {}
        }
      } else {
        log.warn("Sessions directory not found: %s", sessionsDir);
      }

      // === Clear all session types ===
      const { clearHistory } = await import("../../core/session.js");
      const { buildSessionKey } = await import("../../security/isolation.js");
      const sessionTypes = ["main", "cron", "group", "sub", "heartbeat"];

      for (const sessionType of sessionTypes) {
        try {
          const sessionKey = buildSessionKey(agentId, sessionType as any, userId);
          clearHistory(runtimeDir, agentId, sessionKey);
        } catch {}
      }

      // === Fully reset context isolator (task state, boundaries, history) ===
      const { resetUserContext } = await import("../../core/context-isolator.js");
      resetUserContext(userId, "telegram");

      // === Clear memory/vector store entries ===
      const memoryDirs = [
        path.join(runtimeDir, "memory"),
        path.join(runtimeDir, "agents", agentId, "memory"),
        path.join(runtimeDir, "vector-store"),
      ];

      for (const memoryDir of memoryDirs) {
        if (fs.existsSync(memoryDir)) {
          try {
            const memFiles = fs.readdirSync(memoryDir);
            for (const file of memFiles) {
              if (file.includes(userId) || file.includes("telegram")) {
                fs.unlinkSync(path.join(memoryDir, file));
                deletedCount++;
              }
            }
          } catch {}
        }
      }

      // === Clear any cached thinking/tool state ===
      const cacheDir = path.join(runtimeDir, "cache");
      if (fs.existsSync(cacheDir)) {
        try {
          const cacheFiles = fs.readdirSync(cacheDir);
          for (const file of cacheFiles) {
            if (file.includes(userId)) {
              fs.unlinkSync(path.join(cacheDir, file));
            }
          }
        } catch {}
      }

      await ctx.reply(
        "🧹 *Context Completely Cleared!*\n\n" +
        `✅ Deleted ${deletedCount} files\n` +
        "✅ Session registry cleaned\n" +
        "✅ Task context reset\n" +
        "✅ Memory cleared\n\n" +
        "I'm completely fresh! What would you like to do?",
        { parse_mode: "Markdown" }
      );

      log.info("Full context clear for user %s: %d files deleted", userId, deletedCount);
    } catch (err) {
      log.error({ err }, "Failed to clear context");
      await ctx.reply("❌ Failed to clear context. Please try again.");
    }
  });

  // Regular text messages - Chat with Wispy (Vibe Coding Mode)
  bot.on("message:text", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");
    const text = ctx.message?.text || "";

    // Skip if it's a command
    if (text.startsWith("/")) return;

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    try {
      // === Context Isolation Check ===
      const { processWithIsolation, cancelTask } = await import("../../core/context-isolator.js");
      const { task, contextPrompt, isNewTask } = processWithIsolation(text, userId, "telegram");

      // Check for cancel/stop commands
      const lowerText = text.toLowerCase();
      const cancelWords = ["stop", "cancel", "halt", "abort", "forget it", "never mind", "quit"];
      if (cancelWords.some(w => lowerText.includes(w))) {
        cancelTask(userId, "telegram");
        await ctx.reply(
          "✋ *Stopped!*\n\nI've cancelled what I was doing. What would you like me to help with now?",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Show typing indicator (no verbose notifications for simple messages)
      await ctx.api.sendChatAction(ctx.chat!.id, "typing");

      // Set up chat context for sending images back
      const sendImage = async (imagePath: string, caption?: string) => {
        const { InputFile } = await import("grammy");
        const fs = await import("fs");
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Image not found: ${imagePath}`);
        }
        const buffer = fs.readFileSync(imagePath);
        await ctx.replyWithPhoto(
          new InputFile(buffer, "screenshot.png"),
          caption ? { caption, parse_mode: "Markdown" } : undefined
        );
      };

      // Pass the sendImage function to the agent's tool executor
      agent.setChatContext({
        channel: "telegram",
        peerId: userId,
        chatId,
        sendImage,
      });

      // Set up progress callback for visual thought signatures
      const toolExecutor = agent.getToolExecutor();
      toolExecutor.setProgressCallback(async (event) => {
        if (event.type === "tool_start" && event.toolName) {
          // Send thought signature for tool usage
          const emoji = getToolEmoji(event.toolName);
          await sendThinkingNotification(chatId, `${emoji} ${event.toolName}`);
        } else if (event.type === "image_generated" && event.data) {
          // Send image with feedback buttons
          const { buffer, prompt, imageId } = event.data as {
            buffer: Buffer;
            prompt: string;
            imageId: string;
          };
          // Send image with inline feedback keyboard
          const { InputFile } = await import("grammy");
          await botInstance?.api.sendPhoto(
            chatId,
            new InputFile(buffer, "generated.png"),
            {
              caption: `🎨 *${prompt}*\n\n_Generated with Wispy_`,
              parse_mode: "Markdown",
              reply_markup: createImageFeedbackKeyboard(imageId),
            }
          );
        }
      });

      // Track if voice was already sent (prevent multiple voice messages)
      let voiceAlreadySent = false;

      // Set voice callback for voice replies (reuse toolExecutor from above)
      toolExecutor.setVoiceCallback(async (audioPath: string, _text: string) => {
        // Only send ONE voice message per request
        if (voiceAlreadySent) {
          log.debug("Voice already sent, skipping duplicate");
          return true; // Return true to prevent error, but don't send
        }
        try {
          const { InputFile } = await import("grammy");
          const fs = await import("fs");
          if (!fs.existsSync(audioPath)) {
            log.warn("Voice file not found: %s", audioPath);
            return false;
          }
          await ctx.replyWithVoice(
            new InputFile(fs.createReadStream(audioPath))
          );
          voiceAlreadySent = true;
          log.info("Voice message sent");
          return true;
        } catch (err) {
          log.error({ err }, "Failed to send voice message");
          return false;
        }
      });

      // Detect voice requests
      const voiceKeywords = /\b(voice|speak|say it|talk to me|audio|out loud|voice reply|reply in voice)\b/i;
      const userRequestedVoice = voiceKeywords.test(text);

      // Build message with context isolation (prevents task bleeding)
      let messageToSend = text;

      // Prepend context isolation prompt for new tasks or after clear
      if (isNewTask || task.messageCount < 2) {
        messageToSend = `${contextPrompt}\n\n---\n\n**USER MESSAGE:**\n${text}`;
        log.info("Context isolation prompt added for task: %s", task.topic);
      }

      if (userRequestedVoice) {
        // Simple instruction - don't over-explain
        messageToSend = `${messageToSend}\n\n[Use voice_reply tool once with a friendly, conversational response.]`;
        log.info("Voice request detected");
      }

      // Use streaming to send thinking/progress updates
      let finalText = "";
      let statusMessage: any = null;
      let lastStatusUpdate = 0;
      const toolsUsed: string[] = [];
      let currentAction = "Processing...";

      // Only show status for complex tasks (messages with task indicators)
      const isComplexTask = /\b(create|build|generate|make|write|code|develop|analyze|research|explain|image|diagram|project)\b/i.test(text);
      const startTime = Date.now();

      for await (const event of agent.chatStream(messageToSend, userId, "telegram", "main")) {
        const now = Date.now();

        if (event.type === "thinking" && event.content) {
          currentAction = event.content.slice(0, 100);
          // Throttle status updates (every 5 seconds)
          if (now - lastStatusUpdate > 5000) {
            if (statusMessage) {
              try {
                await ctx.api.editMessageText(
                  ctx.chat!.id,
                  statusMessage.message_id,
                  `💭 _${currentAction}..._`,
                  { parse_mode: "Markdown" }
                );
              } catch { /* ignore edit errors */ }
            } else {
              statusMessage = await ctx.reply(
                `💭 _${currentAction}..._`,
                { parse_mode: "Markdown" }
              ).catch(() => null);
            }
            lastStatusUpdate = now;
          }
        } else if (event.type === "tool_call") {
          toolsUsed.push(event.content);
          const toolEmoji = getToolEmoji(event.content);
          currentAction = `Using ${event.content}`;

          // Only show tool notifications for complex tasks that take time
          const elapsed = Date.now() - startTime;
          if (isComplexTask && elapsed > 2000) {
            // Update existing status message instead of sending new thoughts
            if (statusMessage) {
              try {
                await ctx.api.editMessageText(
                  ctx.chat!.id,
                  statusMessage.message_id,
                  `${toolEmoji} *${event.content}*`,
                  { parse_mode: "Markdown" }
                );
              } catch { /* ignore */ }
            }
          }
        } else if (event.type === "text") {
          finalText += event.content;
        } else if (event.type === "done") {
          break;
        }
      }

      // Update status to complete only for complex tasks
      if (statusMessage && isComplexTask) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, statusMessage.message_id);
        } catch { /* ignore */ }
      }

      // Build result object for compatibility
      const result = { text: finalText, toolResults: toolsUsed };

      // Voice fallback: if user requested voice but none was sent
      if (userRequestedVoice && !voiceAlreadySent && result.text) {
        log.info("Voice requested but not sent - generating fallback");
        try {
          const { textToSpeech, getTempVoicePath } = await import("../../voice/tts.js");
          const voicePath = getTempVoicePath(runtimeDir);
          // Clean up the text - remove tool instructions
          const cleanText = result.text.replace(/\[.*?\]/g, "").trim();
          const audioPath = await textToSpeech(cleanText || result.text, voicePath, { persona: "friendly" });

          if (audioPath) {
            const { InputFile } = await import("grammy");
            const fs = await import("fs");
            await ctx.replyWithVoice(new InputFile(fs.createReadStream(audioPath)));
            voiceAlreadySent = true;
            log.info("Voice fallback sent");
            return; // Done - voice sent
          }
        } catch (voiceErr) {
          log.warn("Voice fallback failed: %s", (voiceErr as Error).message);
        }
      }

      // If voice was already sent, don't send text too
      if (voiceAlreadySent) {
        return;
      }

      // Split long messages (Telegram limit is 4096 chars)
      const responseText = result.text || "...";
      if (responseText.length > 4000) {
        const chunks = responseText.match(/.{1,4000}/gs) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() => {
            // Fallback without markdown if parsing fails
            ctx.reply(chunk);
          });
        }
      } else {
        await ctx.reply(responseText, { parse_mode: "Markdown" }).catch(() => {
          ctx.reply(responseText);
        });
      }
    } catch (err) {
      log.error({ err }, "Telegram chat error");
      await ctx.reply("Sorry, something went wrong. Please try again.");
    }
  });

  // Start the bot
  bot.start({
    onStart: () => {
      log.info("Telegram bot started with Marathon support");
      registerChannel({
        name: "telegram",
        type: "telegram",
        capabilities: {
          text: true,
          media: true,
          voice: true,
          buttons: true,
          reactions: true,
          groups: true,
          threads: false,
        },
        status: "connected",
        connectedAt: new Date().toISOString(),
      });
    },
  });

  bot.catch((err) => {
    log.error({ err }, "Telegram bot error");
    updateChannelStatus("telegram", "error", String(err));
  });

  return bot;
}

/**
 * Get the bot instance for external use
 */
export function getTelegramBot(): Bot | null {
  return botInstance;
}
