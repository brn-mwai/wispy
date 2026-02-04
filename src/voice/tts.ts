/**
 * Text-to-Speech Service
 * Primary: Google Translate TTS (free, no API key)
 * Fallback: Google Cloud TTS (requires credentials)
 */

import { resolve, join } from "path";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, createWriteStream } from "fs";
import { createRequire } from "module";
import { createLogger } from "../infra/logger.js";

// Use createRequire for CJS modules (node-gtts is CJS)
const require = createRequire(import.meta.url);

const log = createLogger("tts");

// Voice language codes for different personas (node-gtts supported codes)
const VOICE_LANGS = {
  default: "en",
  friendly: "en",
  professional: "en",
  assistant: "en",
  british: "en-uk",  // node-gtts uses en-uk for British English
  casual: "en-au",   // Australian English for casual
} as const;

export type VoicePersona = keyof typeof VOICE_LANGS;

interface TTSConfig {
  persona?: VoicePersona;
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
}

/**
 * Convert text to speech using free Google Translate TTS
 */
export async function textToSpeech(
  text: string,
  outputPath: string,
  config?: TTSConfig
): Promise<string | null> {
  const cleanText = cleanTextForSpeech(text);
  if (!cleanText.trim()) {
    log.warn("No speakable text after cleaning");
    return null;
  }

  // Ensure output directory exists
  const outputDir = resolve(outputPath, "..");
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const finalPath = outputPath.endsWith(".mp3") ? outputPath : `${outputPath}.mp3`;
  const lang = VOICE_LANGS[config?.persona || "default"] || "en";

  // Try free Google Translate TTS
  try {
    const result = await googleTranslateTTS(cleanText, finalPath, lang);
    if (result) {
      log.info("Voice audio saved: %s", finalPath);
      return finalPath;
    }
  } catch (err) {
    log.debug("Google Translate TTS failed: %s", (err as Error).message);
  }

  // Fallback to Google Cloud TTS if credentials available
  try {
    const result = await googleCloudTTS(cleanText, finalPath, config);
    if (result) {
      log.info("Voice audio saved (Cloud TTS): %s", finalPath);
      return finalPath;
    }
  } catch (err) {
    log.debug("Google Cloud TTS failed: %s", (err as Error).message);
  }

  log.error("All TTS methods failed");
  return null;
}

/**
 * Free Google Translate TTS (no API key needed)
 */
async function googleTranslateTTS(text: string, outputPath: string, lang: string): Promise<boolean> {
  try {
    // Use require for CJS module (node-gtts)
    const gtts = require("node-gtts");
    const tts = gtts(lang);

    return new Promise((res) => {
      tts.save(outputPath, text, (err: Error | null) => {
        if (err) {
          log.debug("GTTS save error: %s", err.message);
          res(false);
        } else {
          res(existsSync(outputPath));
        }
      });
    });
  } catch (err) {
    log.debug("GTTS error: %s", (err as Error).message);
    return false;
  }
}

/**
 * Google Cloud TTS (requires GOOGLE_APPLICATION_CREDENTIALS)
 */
async function googleCloudTTS(text: string, outputPath: string, config?: TTSConfig): Promise<boolean> {
  try {
    const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
    const client = new TextToSpeechClient();

    const request = {
      input: { text },
      voice: {
        languageCode: "en-US",
        name: "en-US-Neural2-F",
        ssmlGender: "FEMALE" as const,
      },
      audioConfig: {
        audioEncoding: "MP3" as const,
        speakingRate: config?.speakingRate || 1.0,
        pitch: config?.pitch || 0,
      },
    };

    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      return false;
    }

    writeFileSync(outputPath, response.audioContent, "binary");
    return true;
  } catch (err) {
    log.debug("Cloud TTS error: %s", (err as Error).message);
    return false;
  }
}

/**
 * Clean text for speech synthesis
 */
function cleanTextForSpeech(text: string): string {
  let cleaned = text;

  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, " code block omitted ");
  cleaned = cleaned.replace(/`[^`]+`/g, "");

  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1");
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1");
  cleaned = cleaned.replace(/~~([^~]+)~~/g, "$1");

  // Remove headers
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");

  // Remove links but keep text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, " link ");

  // Remove bullet points
  cleaned = cleaned.replace(/^[\-\*]\s+/gm, "");
  cleaned = cleaned.replace(/^\d+\.\s+/gm, "");

  // Remove special characters
  cleaned = cleaned.replace(/[│├└─┌┐┘┬┴┼→←↑↓↔]/g, "");

  // Remove emojis
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, "");
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, "");
  cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, "");
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, "");
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, "");
  cleaned = cleaned.replace(/[✓✗⏰📋📝🔊]/g, "");

  // Clean up whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.trim();

  // Limit length for TTS
  if (cleaned.length > 2000) {
    cleaned = cleaned.slice(0, 2000) + "... response truncated.";
  }

  return cleaned;
}

/**
 * Generate a unique temp file path for voice output
 */
export function getTempVoicePath(runtimeDir: string): string {
  const voiceDir = join(runtimeDir, "voice-cache");
  if (!existsSync(voiceDir)) {
    mkdirSync(voiceDir, { recursive: true });
  }
  return join(voiceDir, `voice_${Date.now()}.mp3`);
}

/**
 * Clean up old voice cache files
 */
export function cleanVoiceCache(runtimeDir: string): void {
  const voiceDir = join(runtimeDir, "voice-cache");
  if (!existsSync(voiceDir)) return;

  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  try {
    const { readdirSync, statSync } = require("fs");
    const files = readdirSync(voiceDir);

    for (const file of files) {
      const filePath = join(voiceDir, file);
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Check if TTS is available
 */
export async function isTTSAvailable(): Promise<boolean> {
  return true; // Google Translate TTS is always available
}

/**
 * Get available voice personas
 */
export function getVoicePersonas(): string[] {
  return Object.keys(VOICE_LANGS);
}
