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

  // /start - Welcome message with commands
  bot.command("start", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      pairUser(runtimeDir, "telegram", userId);
    }

    // Register user for trust notifications
    registerTelegramUser(userId, chatId);

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

*Examples:*
• "Create a landing page with Tailwind"
• "What's the status?"
• 🎤 Send a voice note
• /image A robot playing guitar

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

  // Track voice reply preference per user
  const voiceReplyEnabled = new Map<string, boolean>();

  // /voice - Toggle voice replies
  bot.command("voice", async (ctx: Context) => {
    const userId = String(ctx.from?.id || "");

    if (!isPaired(runtimeDir, "telegram", userId)) {
      await ctx.reply("Please send /start first to pair with Wispy.");
      return;
    }

    const currentSetting = voiceReplyEnabled.get(userId) ?? true;
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

      // Try to reply with voice if user sent voice and has voice enabled
      const userVoiceEnabled = voiceReplyEnabled.get(userId) ?? true;
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
      // Show typing indicator
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

      // Track if voice was already sent (prevent multiple voice messages)
      let voiceAlreadySent = false;

      // Set voice callback for voice replies
      const toolExecutor = agent.getToolExecutor();
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
      let messageToSend = text;

      if (userRequestedVoice) {
        // Simple instruction - don't over-explain
        messageToSend = `${text}\n\n[Use voice_reply tool once with a friendly, conversational response.]`;
        log.info("Voice request detected");
      }

      // Use streaming to send thinking/progress updates
      let finalText = "";
      let thinkingMessage: any = null;
      let lastThinkingUpdate = 0;
      const toolsUsed: string[] = [];

      for await (const event of agent.chatStream(messageToSend, userId, "telegram", "main")) {
        const now = Date.now();

        if (event.type === "thinking" && event.content) {
          // Send thinking update (throttled to every 3 seconds)
          if (now - lastThinkingUpdate > 3000) {
            const thinkingPreview = event.content.length > 200
              ? event.content.substring(0, 200) + "..."
              : event.content;

            if (thinkingMessage) {
              // Edit existing message
              try {
                await ctx.api.editMessageText(
                  ctx.chat!.id,
                  thinkingMessage.message_id,
                  `💭 *Thinking...*\n\n_${thinkingPreview}_`,
                  { parse_mode: "Markdown" }
                );
              } catch { /* ignore edit errors */ }
            } else {
              // Send new thinking message
              thinkingMessage = await ctx.reply(
                `💭 *Thinking...*\n\n_${thinkingPreview}_`,
                { parse_mode: "Markdown" }
              ).catch(() => null);
            }
            lastThinkingUpdate = now;
          }
        } else if (event.type === "tool_call") {
          toolsUsed.push(event.content);
          // Update thinking message with tool being used
          const toolEmoji = getToolEmoji(event.content);
          if (thinkingMessage) {
            try {
              await ctx.api.editMessageText(
                ctx.chat!.id,
                thinkingMessage.message_id,
                `${toolEmoji} *Using ${event.content}...*`,
                { parse_mode: "Markdown" }
              );
            } catch { /* ignore */ }
          } else {
            thinkingMessage = await ctx.reply(
              `${toolEmoji} *Using ${event.content}...*`,
              { parse_mode: "Markdown" }
            ).catch(() => null);
          }
        } else if (event.type === "text") {
          finalText += event.content;
        } else if (event.type === "done") {
          // Stream complete
          break;
        }
      }

      // Delete thinking message when done
      if (thinkingMessage) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, thinkingMessage.message_id);
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
