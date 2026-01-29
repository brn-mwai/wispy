/**
 * Text-to-Speech engine.
 *
 * Supports:
 * - piper (fast local TTS, many voices)
 * - espeak-ng (lightweight fallback)
 *
 * Usage: Converts agent response text to audio and plays it.
 */

import { execSync, spawn, type ChildProcess } from "child_process";
import { tmpdir } from "os";
import { existsSync, unlinkSync } from "fs";
import { createLogger } from "../../infra/logger.js";

const log = createLogger("tts");

export type TtsEngine = "piper" | "espeak" | "google-tts";

/**
 * Check if piper TTS is available.
 */
export function isPiperAvailable(): boolean {
  try {
    execSync("piper --help", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if espeak-ng is available.
 */
export function isEspeakAvailable(): boolean {
  try {
    execSync("espeak-ng --version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Speak text using piper (high quality, fast, local).
 */
export async function speakPiper(text: string, voice?: string): Promise<void> {
  const tmpFile = `${tmpdir()}/wispy-tts-${Date.now()}.wav`;
  const model = voice || "en_US-lessac-medium";

  return new Promise((resolve, reject) => {
    const proc = spawn("piper", [
      "--model", model,
      "--output_file", tmpFile,
    ], { stdio: ["pipe", "ignore", "ignore"] });

    proc.stdin.write(text);
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}`));
        return;
      }

      // Play the audio
      playAudio(tmpFile)
        .then(() => {
          try { unlinkSync(tmpFile); } catch {}
          resolve();
        })
        .catch(reject);
    });

    proc.on("error", () => {
      reject(new Error("piper not found. Install: https://github.com/rhasspy/piper"));
    });
  });
}

/**
 * Speak text using espeak-ng (lightweight, widely available).
 */
export async function speakEspeak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("espeak-ng", [
      "-s", "170",    // speed
      "-p", "50",     // pitch
      text,
    ], { stdio: "ignore" });

    proc.on("close", () => resolve());
    proc.on("error", () => {
      reject(new Error("espeak-ng not found. Install: apt install espeak-ng"));
    });
  });
}

/**
 * Play a WAV file using the system audio player.
 */
function playAudio(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === "win32") {
      cmd = "powershell";
      args = ["-c", `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`];
    } else if (platform === "darwin") {
      cmd = "afplay";
      args = [filePath];
    } else {
      cmd = "aplay";
      args = ["-q", filePath];
    }

    const proc = spawn(cmd, args, { stdio: "ignore" });
    proc.on("close", () => resolve());
    proc.on("error", () => reject(new Error(`Audio player not found: ${cmd}`)));
  });
}

/**
 * Speak text using the configured engine.
 */
export async function speak(
  text: string,
  engine: TtsEngine = "piper"
): Promise<void> {
  // Truncate very long text
  const truncated = text.length > 500 ? text.slice(0, 497) + "..." : text;

  switch (engine) {
    case "piper":
      return speakPiper(truncated);
    case "espeak":
      return speakEspeak(truncated);
    case "google-tts":
      log.warn("Google TTS not yet implemented, falling back to espeak");
      return speakEspeak(truncated);
    default:
      return speakEspeak(truncated);
  }
}

/**
 * Get the best available TTS engine.
 */
export function detectTtsEngine(): TtsEngine {
  if (isPiperAvailable()) return "piper";
  if (isEspeakAvailable()) return "espeak";
  return "espeak"; // fallback
}
