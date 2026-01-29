/**
 * Telegram Adapter
 * Full integration with Marathon Mode - control your AI agent from your phone
 */

import { Bot, type Context } from "grammy";
import { registerChannel, updateChannelStatus } from "../dock.js";
import { isPaired, pairUser } from "../../security/auth.js";
import type { Agent } from "../../core/agent.js";
import { createLogger } from "../../infra/logger.js";
import { MarathonService, formatDuration } from "../../marathon/service.js";
import { getPlanProgress } from "../../marathon/planner.js";
import type { MarathonState } from "../../marathon/types.js";

const log = createLogger("telegram");

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

  // /start - Welcome message with commands
  bot.command("start", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    if (!isPaired(runtimeDir, "telegram", userId)) {
      pairUser(runtimeDir, "telegram", userId);
    }

    const welcomeMsg = `☁️ *Welcome to Wispy!*

Your autonomous AI companion with Marathon Mode.

*Chat Commands:*
Just send any message to chat with me!

*Marathon Commands:*
/marathon <goal> - Start autonomous task
/status - Check marathon progress
/pause - Pause current marathon
/resume - Resume paused marathon
/abort - Stop current marathon
/list - View all marathons

*Example:*
\`/marathon Build a React calculator app with tests\`

I'll work autonomously and keep you updated! 🚀`;

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

    await ctx.reply(
      `🏃 *Starting Marathon*\n\n` +
      `*Goal:* ${goal}\n\n` +
      `Planning with ultra thinking... This may take a moment.`,
      { parse_mode: "Markdown" }
    );

    try {
      // Start marathon in background
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
      }).then(async (finalState) => {
        // Marathon completed
        const result = marathonService!.getResult(finalState.id);
        if (result?.success) {
          await sendTelegramMessage(
            chatId,
            `🎉 *Marathon Completed!*\n\n` +
            `*Goal:* ${finalState.plan.goal}\n` +
            `*Milestones:* ${result.completedMilestones}/${result.totalMilestones}\n` +
            `*Time:* ${formatDuration(result.totalTime)}\n\n` +
            `${result.artifacts.length > 0 ? `*Artifacts:*\n${result.artifacts.map(a => `• ${a}`).join("\n")}` : ""}`
          );
        } else {
          await sendTelegramMessage(
            chatId,
            `❌ *Marathon Failed*\n\n` +
            `*Goal:* ${finalState.plan.goal}\n` +
            `*Completed:* ${result?.completedMilestones || 0}/${result?.totalMilestones || 0}\n\n` +
            `Use /status for details.`
          );
        }
      }).catch(async (err) => {
        log.error({ err }, "Marathon execution error");
        await sendTelegramMessage(chatId, `❌ Marathon error: ${err.message}`);
      });

      // Immediate response
      await ctx.reply(
        `✅ Marathon started!\n\n` +
        `I'll notify you on progress. Use /status to check anytime.`,
        { parse_mode: "Markdown" }
      );
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

  // Regular text messages - Chat with Wispy
  bot.on("message:text", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const text = ctx.message?.text || "";

    // Skip if it's a command
    if (text.startsWith("/")) return;

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    try {
      // Show typing indicator
      await ctx.api.sendChatAction(ctx.chat!.id, "typing");

      const result = await agent.chat(text, userId, "telegram", "main");

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
