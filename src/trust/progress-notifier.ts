/**
 * Progress Notifier - Human-like thought signatures and milestone updates
 *
 * Sends real-time progress updates via Telegram during background tasks.
 * Asks for confirmation before critical actions like installing dependencies.
 * Acts human with casual, friendly communication style.
 */

import { createLogger } from "../infra/logger.js";
import { getTrustController } from "./controller.js";

const log = createLogger("progress");

// Telegram instance for sending updates
let telegramBot: any = null;
let activeChats = new Map<string, string>(); // userId -> chatId

// Human-like phrases for different situations
const THINKING_PHRASES = [
  "Hmm, let me think about this...",
  "Okay, working on it!",
  "Alright, diving in...",
  "Got it! Let me see...",
  "On it! Give me a sec...",
  "Interesting... let me explore this",
  "Let me figure this out for you",
];

const MILESTONE_PHRASES = [
  "Done with that part!",
  "Nice, that's working now",
  "Progress! Moving on to the next bit",
  "That's sorted out",
  "Cool, finished that step",
  "All good there!",
];

const QUESTION_PHRASES = [
  "Quick question before I continue...",
  "Hey, just want to check with you...",
  "One thing I want to confirm...",
  "Should I go ahead with this?",
  "I could do this, but wanted to ask first...",
];

const COMPLETE_PHRASES = [
  "All done!",
  "Finished!",
  "That's wrapped up",
  "Completed everything",
  "There you go!",
];

function randomPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export interface ThoughtSignature {
  id: string;
  type: "thinking" | "milestone" | "question" | "complete" | "error" | "update";
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface ProgressNotification {
  chatId: string;
  thought: ThoughtSignature;
  buttons?: InlineButton[];
}

export interface InlineButton {
  text: string;
  callbackData: string;
}

/**
 * Initialize the progress notifier with Telegram bot
 */
export function initProgressNotifier(bot: any) {
  telegramBot = bot;
  log.info("Progress notifier initialized");
}

/**
 * Register a user's chat for receiving updates
 */
export function registerUserChat(userId: string, chatId: string) {
  activeChats.set(userId, chatId);
  log.debug("Registered chat for user %s: %s", userId, chatId);
}

/**
 * Get chat ID for a user
 */
export function getUserChatId(userId: string): string | undefined {
  return activeChats.get(userId);
}

/**
 * Generate a unique thought ID
 */
function generateThoughtId(): string {
  return `thought_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Send a thought signature to a user
 */
export async function sendThought(
  userId: string,
  type: ThoughtSignature["type"],
  message: string,
  options?: {
    context?: string;
    metadata?: Record<string, unknown>;
    buttons?: InlineButton[];
    voiceNote?: boolean;
  }
): Promise<boolean> {
  const chatId = activeChats.get(userId);
  if (!chatId || !telegramBot) {
    log.debug("Cannot send thought - no chat or bot for user %s", userId);
    return false;
  }

  const thought: ThoughtSignature = {
    id: generateThoughtId(),
    type,
    message,
    context: options?.context,
    metadata: options?.metadata,
    timestamp: new Date(),
  };

  try {
    // Format message with emoji based on type
    const emoji = {
      thinking: "💭",
      milestone: "✅",
      question: "❓",
      complete: "🎉",
      error: "⚠️",
      update: "📝",
    }[type];

    // Build human-like message
    let prefix = "";
    if (type === "thinking") prefix = randomPhrase(THINKING_PHRASES) + "\n\n";
    if (type === "milestone") prefix = randomPhrase(MILESTONE_PHRASES) + "\n\n";
    if (type === "question") prefix = randomPhrase(QUESTION_PHRASES) + "\n\n";
    if (type === "complete") prefix = randomPhrase(COMPLETE_PHRASES) + "\n\n";

    const formattedMessage = `${emoji} ${prefix}${message}`;

    // Add context if provided
    let fullMessage = formattedMessage;
    if (options?.context) {
      fullMessage += `\n\n_${options.context}_`;
    }

    // Build inline keyboard if buttons provided
    const replyMarkup = options?.buttons
      ? {
          inline_keyboard: [
            options.buttons.map((btn) => ({
              text: btn.text,
              callback_data: btn.callbackData,
            })),
          ],
        }
      : undefined;

    // Send via Telegram
    await telegramBot.api.sendMessage(chatId, fullMessage, {
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
    });

    // Optionally send as voice note too
    if (options?.voiceNote && message.length < 400) {
      try {
        const { generateVoiceWithGemini } = await import("../cli/voice/tts.js");
        const { join } = await import("path");
        const voiceDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "voice-output");
        const audioPath = await generateVoiceWithGemini(message, voiceDir);
        if (audioPath) {
          const { InputFile } = await import("grammy");
          const { createReadStream } = await import("fs");
          await telegramBot.api.sendVoice(chatId, new InputFile(createReadStream(audioPath)));
        }
      } catch (voiceErr) {
        log.debug("Voice note failed: %s", voiceErr);
      }
    }

    log.info("Sent %s thought to %s: %s", type, userId, message.slice(0, 50));
    return true;
  } catch (err) {
    log.error({ err }, "Failed to send thought");
    return false;
  }
}

/**
 * Ask user a yes/no question with inline buttons
 */
export async function askConfirmation(
  userId: string,
  question: string,
  options?: {
    context?: string;
    approveText?: string;
    denyText?: string;
    timeout?: number;
  }
): Promise<boolean> {
  const chatId = activeChats.get(userId);
  if (!chatId || !telegramBot) {
    log.warn("Cannot ask confirmation - no chat for user %s", userId);
    return true; // Default to yes if can't ask
  }

  const confirmId = `confirm_${Date.now()}`;
  const trustController = getTrustController();

  // Create approval request
  const { id } = await trustController.createApproval({
    action: "user_confirmation",
    description: question,
    metadata: { confirmId, context: options?.context },
    channel: "telegram",
    userId,
    timeout: options?.timeout || 5 * 60 * 1000,
  });

  // Send message with inline buttons
  const buttons: InlineButton[] = [
    { text: options?.approveText || "✅ Yes, go ahead", callbackData: `approve_${id}` },
    { text: options?.denyText || "❌ No, wait", callbackData: `deny_${id}` },
  ];

  await sendThought(userId, "question", question, {
    context: options?.context,
    buttons,
  });

  // Wait for response
  return trustController.requestApproval({
    action: "user_confirmation",
    description: question,
    channel: "telegram",
    userId,
    timeout: options?.timeout,
  });
}

/**
 * Send multiple choice question
 */
export async function askChoice(
  userId: string,
  question: string,
  choices: { text: string; value: string }[]
): Promise<string | null> {
  const chatId = activeChats.get(userId);
  if (!chatId || !telegramBot) {
    log.warn("Cannot ask choice - no chat for user %s", userId);
    return choices[0]?.value || null;
  }

  const choiceId = `choice_${Date.now()}`;

  return new Promise((resolve) => {
    // Store resolver in controller
    const timeout = setTimeout(() => {
      resolve(choices[0]?.value || null);
    }, 5 * 60 * 1000);

    // Build buttons
    const buttons = choices.map((c) => ({
      text: c.text,
      callbackData: `choice_${choiceId}_${c.value}`,
    }));

    sendThought(userId, "question", question, { buttons });

    // Listen for callback (handled in telegram-handler)
    const handleCallback = (data: string) => {
      if (data.startsWith(`choice_${choiceId}_`)) {
        clearTimeout(timeout);
        const value = data.replace(`choice_${choiceId}_`, "");
        resolve(value);
        return true;
      }
      return false;
    };

    // Register temporary handler
    (global as any).__choiceHandlers = (global as any).__choiceHandlers || [];
    (global as any).__choiceHandlers.push(handleCallback);
  });
}

/**
 * Progress tracker for multi-step tasks
 */
export class ProgressTracker {
  private userId: string;
  private taskName: string;
  private steps: string[];
  private currentStep: number = 0;
  private startTime: Date;
  private voiceEnabled: boolean;

  constructor(userId: string, taskName: string, steps: string[], voiceEnabled = false) {
    this.userId = userId;
    this.taskName = taskName;
    this.steps = steps;
    this.startTime = new Date();
    this.voiceEnabled = voiceEnabled;
  }

  async start() {
    await sendThought(
      this.userId,
      "thinking",
      `Starting: *${this.taskName}*\n\nI'll keep you updated on the progress!`,
      { voiceNote: this.voiceEnabled }
    );
  }

  async nextStep(additionalInfo?: string) {
    this.currentStep++;
    const step = this.steps[this.currentStep - 1];
    const progress = `${this.currentStep}/${this.steps.length}`;

    const message = `Step ${progress}: ${step}${additionalInfo ? `\n\n${additionalInfo}` : ""}`;

    await sendThought(this.userId, "milestone", message, {
      context: `Progress: ${Math.round((this.currentStep / this.steps.length) * 100)}%`,
    });
  }

  async error(message: string) {
    await sendThought(this.userId, "error", message, {
      buttons: [
        { text: "🔄 Retry", callbackData: `retry_${this.taskName}` },
        { text: "❌ Cancel", callbackData: `cancel_${this.taskName}` },
      ],
    });
  }

  async askBeforeStep(step: string, reason: string): Promise<boolean> {
    return askConfirmation(
      this.userId,
      `I'm about to: *${step}*\n\n${reason}`,
      { approveText: "👍 Do it", denyText: "⏸️ Wait" }
    );
  }

  async complete(summary?: string) {
    const duration = Math.round((Date.now() - this.startTime.getTime()) / 1000);
    const message = summary
      ? `*${this.taskName}* completed!\n\n${summary}\n\n⏱️ Time: ${duration}s`
      : `*${this.taskName}* completed in ${duration}s!`;

    await sendThought(this.userId, "complete", message, {
      voiceNote: this.voiceEnabled,
    });
  }
}

/**
 * Send a quick update (non-blocking)
 */
export function quickUpdate(userId: string, message: string): void {
  sendThought(userId, "update", message).catch(() => {});
}

/**
 * Send dependency installation confirmation
 */
export async function confirmDependencyInstall(
  userId: string,
  dependencies: string[],
  command: string
): Promise<boolean> {
  const depList = dependencies.slice(0, 5).join(", ");
  const more = dependencies.length > 5 ? ` and ${dependencies.length - 5} more` : "";

  return askConfirmation(
    userId,
    `I need to install some dependencies:\n\n\`${depList}${more}\`\n\nCommand: \`${command}\``,
    {
      context: "This will modify your node_modules folder",
      approveText: "📦 Install",
      denyText: "⏹️ Skip",
    }
  );
}

/**
 * Send code change confirmation
 */
export async function confirmCodeChange(
  userId: string,
  filePath: string,
  changeType: "create" | "modify" | "delete",
  summary: string
): Promise<boolean> {
  const emoji = { create: "📝", modify: "✏️", delete: "🗑️" }[changeType];

  return askConfirmation(
    userId,
    `${emoji} I want to ${changeType} a file:\n\n\`${filePath}\`\n\n${summary}`,
    {
      approveText: "✅ Approve",
      denyText: "🚫 Block",
    }
  );
}

export default {
  initProgressNotifier,
  registerUserChat,
  sendThought,
  askConfirmation,
  askChoice,
  ProgressTracker,
  quickUpdate,
  confirmDependencyInstall,
  confirmCodeChange,
};
