/**
 * Realistic Text-to-Speech using Edge TTS and Qwen3-TTS
 *
 * Priority order:
 * 1. Qwen3-TTS via Replicate (best quality, multilingual, voice cloning)
 * 2. Edge TTS (free, fast, natural sounding)
 * 3. Local Chatterbox (when resources available)
 *
 * Features:
 * - Qwen3-TTS: Voice cloning, voice design, 10 languages, emotion control
 * - Edge TTS: Free, fast Microsoft neural voices
 * - Multiple natural voices (male/female, various accents)
 */

import { createLogger } from "../infra/logger.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const log = createLogger("realistic-tts");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type VoiceModel = "edge-tts" | "qwen3-tts" | "chatterbox" | "auto";

export interface VoiceConfig {
  model: VoiceModel;
  voice?: string;
  speed?: number;
  emotion?: string;
  language?: string;
  conversational?: boolean;
  exaggeration?: number;
  cfg?: number;
}

export interface TTSResult {
  audioPath: string;
  model: string;
  duration?: number;
  format: string;
}

/**
 * Edge TTS voice presets (natural sounding voices)
 */
const EDGE_VOICES: Record<string, string> = {
  // Female voices
  friendly: "en-US-JennyNeural",
  casual: "en-US-AriaNeural",
  professional: "en-US-MichelleNeural",
  warm: "en-GB-SoniaNeural",
  cheerful: "en-AU-NatashaNeural",
  // Male voices
  confident: "en-US-GuyNeural",
  calm: "en-US-BrandonNeural",
  narrator: "en-GB-RyanNeural",
  energetic: "en-AU-WilliamNeural",
  // Default
  default: "en-US-JennyNeural",
};

/**
 * Edge TTS style presets for emotion
 */
const EDGE_STYLES: Record<string, string> = {
  happy: "cheerful",
  excited: "excited",
  sad: "sad",
  friendly: "friendly",
  empathetic: "empathetic",
  calm: "calm",
  professional: "newscast",
  casual: "chat",
};

/**
 * Check if edge-tts is installed
 */
export function isEdgeTTSInstalled(): boolean {
  try {
    execSync("edge-tts --version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    try {
      execSync("python -m edge_tts --version", { stdio: "pipe", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check if Chatterbox is installed
 */
export function isChatterboxInstalled(): boolean {
  try {
    execSync('python -c "from chatterbox.tts import ChatterboxTTS"', {
      stdio: "pipe",
      timeout: 30000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate speech using Edge TTS (Microsoft's neural voices)
 */
async function generateWithEdgeTTS(
  text: string,
  outputDir: string,
  voice: string = "friendly",
  emotion?: string,
  rate: string = "+0%"
): Promise<TTSResult | null> {
  const outputPath = join(outputDir, `edge_${Date.now()}.mp3`);

  // Get voice name from preset or use directly
  const voiceName = EDGE_VOICES[voice] || EDGE_VOICES.default;

  log.info("🎤 Generating speech with Edge TTS...");
  log.info("📝 Voice: %s, Text: %s...", voiceName, text.slice(0, 50));

  return new Promise((resolve) => {
    // Build command args
    const args = [
      "-m", "edge_tts",
      "--text", text,
      "--voice", voiceName,
      "--rate", rate,
      "--write-media", outputPath,
    ];

    const proc = spawn("python", args, {
      timeout: 60000,
      env: { ...process.env },
    });

    let stderr = "";

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0 && existsSync(outputPath)) {
        log.info("✅ Generated speech with Edge TTS: %s", outputPath);
        resolve({ audioPath: outputPath, model: "edge-tts", format: "mp3" });
      } else {
        log.error("❌ Edge TTS failed (exit %d): %s", code ?? -1, stderr.slice(0, 200));
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      log.error("❌ Edge TTS error: %s", err.message);
      resolve(null);
    });
  });
}

/**
 * Chatterbox emotion tags
 */
const CHATTERBOX_EMOTIONS: Record<string, string> = {
  happy: "[chuckle] ",
  excited: "[gasp] ",
  sad: "[sigh] ",
  friendly: "[chuckle] ",
  empathetic: "[sigh] ",
  amused: "[laugh] ",
};

/**
 * Generate speech using local Chatterbox (when working)
 */
async function generateWithChatterbox(
  text: string,
  outputDir: string,
  emotion?: string,
  exaggeration: number = 0.5
): Promise<TTSResult | null> {
  if (!isChatterboxInstalled()) {
    return null;
  }

  const outputPath = join(outputDir, `chatterbox_${Date.now()}.wav`);

  // Add emotion tag
  let processedText = text;
  if (emotion && CHATTERBOX_EMOTIONS[emotion]) {
    processedText = CHATTERBOX_EMOTIONS[emotion] + text;
  }

  const escapedText = processedText
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ")
    .replace(/\r/g, "");

  log.info("🎤 Trying Chatterbox TTS...");

  return new Promise((resolve) => {
    const pythonCode = `
import torch
from chatterbox.tts import ChatterboxTTS
import torchaudio
import os
import warnings
warnings.filterwarnings("ignore")

text = """${escapedText}"""
output = "${outputPath.replace(/\\/g, "/")}"

device = "cuda" if torch.cuda.is_available() else "cpu"
model = ChatterboxTTS.from_pretrained(device=device)
wav = model.generate(text, exaggeration=${exaggeration})
os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
torchaudio.save(output, wav, model.sr)
print("SUCCESS")
`;

    const proc = spawn("python", ["-c", pythonCode], {
      timeout: 180000, // 3 minute timeout for model loading
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0 && existsSync(outputPath) && stdout.includes("SUCCESS")) {
        log.info("✅ Generated speech with Chatterbox: %s", outputPath);
        resolve({ audioPath: outputPath, model: "chatterbox", format: "wav" });
      } else {
        log.debug("Chatterbox failed: %s", stderr.slice(0, 100));
        resolve(null);
      }
    });

    proc.on("error", () => resolve(null));
  });
}

/**
 * Qwen3-TTS voice presets
 */
const QWEN3_VOICES: Record<string, string> = {
  // Female voices
  friendly: "Serena",
  warm: "Vivian",
  cheerful: "Sohee",
  professional: "Ono_anna",
  // Male voices
  confident: "Ryan",
  calm: "Dylan",
  narrator: "Eric",
  energetic: "Aiden",
  wise: "Uncle_fu",
  // Default
  default: "Serena",
};

/**
 * Qwen3-TTS style instructions for emotions
 */
const QWEN3_STYLES: Record<string, string> = {
  happy: "Speak with a cheerful, upbeat tone and smile in your voice",
  excited: "Speak with enthusiasm and energy, slightly faster pace",
  sad: "Speak with a soft, melancholic tone, slower and more thoughtful",
  friendly: "Speak in a warm, welcoming, conversational manner",
  empathetic: "Speak with understanding and compassion, gentle tone",
  calm: "Speak in a relaxed, soothing, peaceful manner",
  professional: "Speak clearly and formally with confidence",
  casual: "Speak naturally and relaxed, like chatting with a friend",
};

/**
 * Check if gradio_client is installed for Qwen3-TTS API
 */
export function isQwen3TTSInstalled(): boolean {
  try {
    execSync('python -c "from gradio_client import Client"', {
      stdio: "pipe",
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate speech using Qwen3-TTS via HuggingFace Spaces Gradio API
 * Best quality TTS with voice cloning, voice design, and 10 languages
 * Runs on HuggingFace servers - no local GPU/RAM needed
 */
async function generateWithQwen3TTS(
  text: string,
  outputDir: string,
  voice: string = "friendly",
  emotion?: string
): Promise<TTSResult | null> {
  const outputPath = join(outputDir, `qwen3_${Date.now()}.wav`);

  // Get voice preset
  const speaker = QWEN3_VOICES[voice] || QWEN3_VOICES.default;

  // Get style instruction for emotion
  const styleInstruction = emotion && QWEN3_STYLES[emotion]
    ? QWEN3_STYLES[emotion]
    : "Speak naturally and clearly";

  // Detect language
  const hasChineseChars = /[\u4e00-\u9fff]/.test(text);
  const hasJapaneseChars = /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
  const hasKoreanChars = /[\uac00-\ud7af]/.test(text);
  let language = "English";
  if (hasChineseChars) language = "Chinese";
  else if (hasJapaneseChars) language = "Japanese";
  else if (hasKoreanChars) language = "Korean";

  log.info("🎤 Generating speech with Qwen3-TTS (HuggingFace Space)...");
  log.info("📝 Voice: %s, Language: %s, Text: %s...", speaker, language, text.slice(0, 50));

  const escapedText = text
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ")
    .replace(/\r/g, "");

  const escapedInstruct = styleInstruction
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ");

  return new Promise((resolve) => {
    const pythonCode = `
from gradio_client import Client
import shutil

client = Client("Qwen/Qwen3-TTS")
result = client.predict(
    text="${escapedText}",
    language="${language}",
    speaker="${speaker}",
    instruct="${escapedInstruct}",
    model_size="0.6B",
    api_name="/generate_custom_voice"
)

if result and result[0]:
    shutil.copy(result[0], "${outputPath.replace(/\\/g, "/")}")
    print("SUCCESS")
else:
    print("FAILED")
`;

    const proc = spawn("python", ["-c", pythonCode], {
      timeout: 180000, // 3 minute timeout for API call
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0 && existsSync(outputPath) && stdout.includes("SUCCESS")) {
        log.info("✅ Generated speech with Qwen3-TTS: %s", outputPath);
        resolve({ audioPath: outputPath, model: "qwen3-tts", format: "wav" });
      } else {
        log.error("❌ Qwen3-TTS failed (exit %d): %s", code ?? -1, stderr.slice(0, 200));
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      log.error("❌ Qwen3-TTS error: %s", err.message);
      resolve(null);
    });
  });
}

/**
 * Check if Replicate API is configured
 */
export function isReplicateConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

/**
 * Convert audio to Telegram format (ogg/opus)
 */
async function convertToTelegramFormat(
  inputPath: string,
  outputDir: string
): Promise<string | null> {
  const outputPath = join(outputDir, `voice_${Date.now()}.ogg`);

  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    execSync(
      `ffmpeg -i "${inputPath}" -c:a libopus -b:a 64k -y "${outputPath}"`,
      { stdio: "pipe", timeout: 30000 }
    );
    if (existsSync(outputPath)) {
      return outputPath;
    }
  } catch {
    log.debug("FFmpeg conversion failed, using original format");
  }

  return null;
}

/**
 * Main TTS function
 */
export async function generateRealisticSpeech(
  text: string,
  outputDir: string,
  config: Partial<VoiceConfig> = {}
): Promise<TTSResult | null> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Truncate long text
  const maxLength = 1000;
  const processedText =
    text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;

  const model = config.model || "auto";

  log.info("🔊 TTS Request - Model: %s, Text: %s...", model, processedText.slice(0, 40));

  let result: TTSResult | null = null;

  // === PRIORITY 1: Qwen3-TTS (best quality, multilingual) ===
  if (model === "auto" || model === "qwen3-tts") {
    if (isQwen3TTSInstalled()) {
      result = await generateWithQwen3TTS(
        processedText,
        outputDir,
        config.voice || "friendly",
        config.emotion
      );
      if (result) return result;
    }
  }

  // === PRIORITY 2: Edge TTS (fast fallback) ===
  if (model === "auto" || model === "edge-tts") {
    if (isEdgeTTSInstalled()) {
      result = await generateWithEdgeTTS(
        processedText,
        outputDir,
        config.voice || "friendly",
        config.emotion
      );
      if (result) return result;
    } else {
      log.warn("Edge TTS not installed. Run: pip install edge-tts");
    }
  }

  // === PRIORITY 3: Local Chatterbox (when resources available) ===
  if (model === "auto" || model === "chatterbox") {
    result = await generateWithChatterbox(
      processedText,
      outputDir,
      config.emotion,
      config.exaggeration ?? 0.5
    );
    if (result) return result;
  }

  log.error("❌ All TTS models failed");
  return null;
}

/**
 * Generate voice for Telegram
 */
export async function generateVoiceForTelegram(
  text: string,
  outputDir: string,
  config: Partial<VoiceConfig> = {}
): Promise<string | null> {
  const result = await generateRealisticSpeech(text, outputDir, config);
  if (!result) return null;

  const oggPath = await convertToTelegramFormat(result.audioPath, outputDir);
  return oggPath || result.audioPath;
}

/**
 * Check if TTS is available
 */
export function isHuggingFaceTTSAvailable(): boolean {
  return isQwen3TTSInstalled() || isEdgeTTSInstalled() || isChatterboxInstalled();
}

/**
 * Get available voices
 */
export function getAvailableVoices(): { model: string; voices: string[] }[] {
  const voices: { model: string; voices: string[] }[] = [];

  if (isQwen3TTSInstalled()) {
    voices.push({ model: "qwen3-tts", voices: Object.keys(QWEN3_VOICES) });
  }

  voices.push({ model: "edge-tts", voices: Object.keys(EDGE_VOICES) });

  if (isChatterboxInstalled()) {
    voices.push({ model: "chatterbox", voices: Object.keys(CHATTERBOX_EMOTIONS) });
  }

  return voices;
}

/**
 * Install TTS dependencies
 */
export async function installTTS(): Promise<boolean> {
  log.info("📦 Installing Edge TTS...");
  try {
    execSync("pip install edge-tts", { stdio: "inherit", timeout: 120000 });
    return true;
  } catch {
    return false;
  }
}

export const PARLER_VOICES = {}; // Legacy compatibility

export default {
  generateRealisticSpeech,
  generateVoiceForTelegram,
  isHuggingFaceTTSAvailable,
  isEdgeTTSInstalled,
  isQwen3TTSInstalled,
  isChatterboxInstalled,
  isReplicateConfigured,
  installTTS,
  getAvailableVoices,
  EDGE_VOICES,
  QWEN3_VOICES,
  QWEN3_STYLES,
  CHATTERBOX_EMOTIONS,
  PARLER_VOICES,
};
