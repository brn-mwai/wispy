/**
 * Telegram Document Delivery
 *
 * Sends generated PDFs and documents to users via Telegram
 * with proper formatting and captions.
 */

import { createLogger } from "../infra/logger.js";
import { existsSync, readFileSync, statSync } from "fs";
import { basename } from "path";

const log = createLogger("telegram-delivery");

// Telegram bot instance
let telegramBot: any = null;

/**
 * Initialize with Telegram bot
 */
export function initTelegramDelivery(bot: any) {
  telegramBot = bot;
  log.info("Telegram delivery initialized");
}

/**
 * Get the bot instance
 */
export function getTelegramBot(): any {
  return telegramBot;
}

/**
 * Send a document file to a Telegram chat
 */
export async function sendDocument(
  chatId: string,
  filePath: string,
  options?: {
    caption?: string;
    fileName?: string;
    thumbnail?: string;
  }
): Promise<boolean> {
  if (!telegramBot) {
    log.warn("Telegram bot not initialized");
    return false;
  }

  if (!existsSync(filePath)) {
    log.error("File not found: %s", filePath);
    return false;
  }

  try {
    const { InputFile } = await import("grammy");

    const fileBuffer = readFileSync(filePath);
    const fileName = options?.fileName || basename(filePath);

    await telegramBot.api.sendDocument(
      chatId,
      new InputFile(fileBuffer, fileName),
      {
        caption: options?.caption,
        parse_mode: "Markdown",
      }
    );

    log.info("Document sent to %s: %s", chatId, fileName);
    return true;
  } catch (err) {
    log.error({ err }, "Failed to send document");
    return false;
  }
}

/**
 * Send a PDF with formatted caption
 */
export async function sendPdf(
  chatId: string,
  pdfPath: string,
  options?: {
    title?: string;
    description?: string;
    author?: string;
    generatedWith?: string;
  }
): Promise<boolean> {
  const stat = existsSync(pdfPath) ? statSync(pdfPath) : null;
  const sizeKb = stat ? Math.round(stat.size / 1024) : 0;

  let caption = "";
  if (options?.title) {
    caption += `📄 *${options.title}*\n\n`;
  }
  if (options?.description) {
    caption += `${options.description}\n\n`;
  }
  if (options?.author) {
    caption += `✍️ Author: ${options.author}\n`;
  }
  if (sizeKb > 0) {
    caption += `📦 Size: ${sizeKb} KB\n`;
  }
  if (options?.generatedWith) {
    caption += `\n_Generated with ${options.generatedWith}_`;
  }

  return sendDocument(chatId, pdfPath, {
    caption: caption || undefined,
    fileName: basename(pdfPath),
  });
}

/**
 * Send document with voice note explanation
 */
export async function sendDocumentWithVoice(
  chatId: string,
  filePath: string,
  voiceText: string,
  options?: {
    caption?: string;
    fileName?: string;
  }
): Promise<boolean> {
  if (!telegramBot) {
    log.warn("Telegram bot not initialized");
    return false;
  }

  try {
    // Send document first
    const docSent = await sendDocument(chatId, filePath, options);
    if (!docSent) return false;

    // Generate and send voice note
    const { generateVoiceWithGemini, generateAudioFile } = await import("../cli/voice/tts.js");
    const { join } = await import("path");
    const voiceDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "voice-output");

    let audioPath = await generateVoiceWithGemini(voiceText, voiceDir);
    if (!audioPath) {
      audioPath = await generateAudioFile(voiceText, voiceDir, { format: "ogg" });
    }

    if (audioPath) {
      const { InputFile } = await import("grammy");
      const { createReadStream, unlinkSync, existsSync } = await import("fs");

      if (existsSync(audioPath)) {
        await telegramBot.api.sendVoice(
          chatId,
          new InputFile(createReadStream(audioPath)),
          { caption: "🎤 Document summary" }
        );

        // Cleanup
        try { unlinkSync(audioPath); } catch {}
      }
    }

    return true;
  } catch (err) {
    log.error({ err }, "Failed to send document with voice");
    return false;
  }
}

/**
 * Send multiple documents as album
 */
export async function sendDocumentAlbum(
  chatId: string,
  files: { path: string; caption?: string }[]
): Promise<boolean> {
  if (!telegramBot) {
    log.warn("Telegram bot not initialized");
    return false;
  }

  try {
    const { InputFile } = await import("grammy");

    const media = files
      .filter(f => existsSync(f.path))
      .map(f => ({
        type: "document" as const,
        media: new InputFile(readFileSync(f.path), basename(f.path)),
        caption: f.caption,
        parse_mode: "Markdown" as const,
      }));

    if (media.length === 0) {
      log.warn("No valid files to send");
      return false;
    }

    await telegramBot.api.sendMediaGroup(chatId, media);
    log.info("Document album sent to %s: %d files", chatId, media.length);
    return true;
  } catch (err) {
    log.error({ err }, "Failed to send document album");
    return false;
  }
}

/**
 * Notify user of document generation progress
 */
export async function notifyDocumentProgress(
  chatId: string,
  stage: "generating" | "compiling" | "complete" | "error",
  details?: string
): Promise<void> {
  if (!telegramBot) return;

  const messages = {
    generating: "📝 Generating LaTeX document...",
    compiling: "⚙️ Compiling PDF (this may take a moment)...",
    complete: "✅ Document ready!",
    error: "❌ Document generation failed",
  };

  const message = details
    ? `${messages[stage]}\n\n${details}`
    : messages[stage];

  try {
    await telegramBot.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (err) {
    log.debug("Failed to send progress notification: %s", err);
  }
}

export default {
  initTelegramDelivery,
  getTelegramBot,
  sendDocument,
  sendPdf,
  sendDocumentWithVoice,
  sendDocumentAlbum,
  notifyDocumentProgress,
};
