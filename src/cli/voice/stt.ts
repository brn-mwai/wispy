/**
 * Speech-to-Text engine.
 *
 * Supports:
 * - whisper.cpp (local, fast, offline)
 * - OpenAI Whisper API (cloud, accurate)
 *
 * Usage: Records audio from microphone, transcribes to text.
 */

import { execSync, spawn, type ChildProcess } from "child_process";
import { tmpdir } from "os";
import { resolve } from "path";
import { existsSync, unlinkSync } from "fs";
import { createLogger } from "../../infra/logger.js";

const log = createLogger("stt");

export type SttEngine = "whisper" | "whisper-api";

export interface SttResult {
  text: string;
  language?: string;
  confidence?: number;
}

/**
 * Check if whisper.cpp (or whisper CLI) is available.
 */
export function isWhisperAvailable(): boolean {
  try {
    execSync("whisper --help", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Record audio from microphone to a temporary WAV file.
 * Uses sox (cross-platform) or arecord (Linux).
 */
export function recordAudio(durationSeconds: number = 10): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpFile = `${tmpdir()}/wispy-audio-${Date.now()}.wav`;

    // Try sox first (cross-platform)
    const proc = spawn("sox", [
      "-d",              // default input device
      "-r", "16000",     // 16kHz sample rate
      "-c", "1",         // mono
      "-b", "16",        // 16-bit
      tmpFile,
      "trim", "0", String(durationSeconds),
      "silence", "1", "0.5", "1%",   // stop on silence
    ], { stdio: "ignore" });

    proc.on("close", (code) => {
      if (existsSync(tmpFile)) {
        resolve(tmpFile);
      } else {
        reject(new Error(`Recording failed with code ${code}`));
      }
    });

    proc.on("error", () => {
      reject(new Error("sox not found. Install SoX for audio recording: https://sox.sourceforge.net"));
    });
  });
}

/**
 * Transcribe audio using local whisper.cpp.
 */
export async function transcribeLocal(audioPath: string): Promise<SttResult> {
  try {
    const output = execSync(
      `whisper "${audioPath}" --language en --output_format txt --model base`,
      { timeout: 30000, encoding: "utf8" }
    );

    // Clean up temp file
    try { unlinkSync(audioPath); } catch {}

    return {
      text: output.trim(),
      language: "en",
    };
  } catch (err) {
    throw new Error(`Whisper transcription failed: ${err}`);
  }
}

/**
 * Transcribe audio using OpenAI Whisper API.
 */
export async function transcribeApi(
  audioPath: string,
  apiKey: string
): Promise<SttResult> {
  const { readFileSync } = await import("fs");
  const audioData = readFileSync(audioPath);

  const formData = new FormData();
  formData.append("file", new Blob([audioData], { type: "audio/wav" }), "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("language", "en");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  // Clean up
  try { unlinkSync(audioPath); } catch {}

  if (!res.ok) {
    throw new Error(`Whisper API error: ${res.status}`);
  }

  const data = (await res.json()) as { text: string };
  return { text: data.text, language: "en" };
}

/**
 * Transcribe audio using the configured engine.
 */
export async function transcribe(
  audioPath: string,
  engine: SttEngine = "whisper"
): Promise<SttResult> {
  if (engine === "whisper-api") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for Whisper API");
    return transcribeApi(audioPath, apiKey);
  }
  return transcribeLocal(audioPath);
}
