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
 * Get the espeak-ng command (handles Windows path)
 */
function getEspeakCommand(): string {
  if (process.platform === "win32") {
    // Check standard Windows installation paths
    const paths = [
      "C:\\Program Files\\eSpeak NG\\espeak-ng.exe",
      "C:\\Program Files (x86)\\eSpeak NG\\espeak-ng.exe",
    ];
    for (const p of paths) {
      try {
        execSync(`"${p}" --version`, { stdio: "ignore", timeout: 5000 });
        return `"${p}"`;
      } catch {}
    }
  }
  return "espeak-ng";
}

/**
 * Check if espeak-ng is available.
 */
export function isEspeakAvailable(): boolean {
  try {
    const cmd = getEspeakCommand();
    execSync(`${cmd} --version`, { stdio: "ignore", timeout: 5000 });
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
  const cmd = getEspeakCommand();

  return new Promise((resolve, reject) => {
    // On Windows, use shell: true to handle quoted paths
    const isWin = process.platform === "win32";
    const args = ["-s", "170", "-p", "50", `"${text.replace(/"/g, '\\"')}"`];

    if (isWin) {
      const fullCmd = `${cmd} ${args.join(" ")}`;
      const proc = spawn("cmd", ["/c", fullCmd], { stdio: "ignore" });
      proc.on("close", () => resolve());
      proc.on("error", reject);
    } else {
      const proc = spawn("espeak-ng", ["-s", "170", "-p", "50", text], { stdio: "ignore" });
      proc.on("close", () => resolve());
      proc.on("error", () => {
        reject(new Error("espeak-ng not found. Install: apt install espeak-ng"));
      });
    }
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

/**
 * Generate audio file from text (for sending via Telegram/WhatsApp).
 * Returns the path to the generated audio file.
 */
export async function generateAudioFile(
  text: string,
  outputDir: string,
  options: { engine?: TtsEngine; format?: "wav" | "ogg" | "mp3"; voice?: string } = {}
): Promise<string | null> {
  const { join } = await import("path");
  const { mkdirSync, existsSync: exists } = await import("fs");

  // Ensure output directory exists
  if (!exists(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const engine = options.engine || detectTtsEngine();
  const format = options.format || "ogg"; // Telegram prefers ogg
  const timestamp = Date.now();
  const wavFile = join(outputDir, `voice-${timestamp}.wav`);
  const outputFile = join(outputDir, `voice-${timestamp}.${format}`);

  // Truncate very long text
  const truncated = text.length > 1000 ? text.slice(0, 997) + "..." : text;

  try {
    if (engine === "piper" && isPiperAvailable()) {
      // Generate WAV with piper
      const model = options.voice || "en_US-lessac-medium";
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("piper", [
          "--model", model,
          "--output_file", wavFile,
        ], { stdio: ["pipe", "ignore", "ignore"] });

        proc.stdin.write(truncated);
        proc.stdin.end();

        proc.on("close", (code) => {
          if (code !== 0) reject(new Error(`Piper exited with code ${code}`));
          else resolve();
        });
        proc.on("error", reject);
      });
    } else if (isEspeakAvailable()) {
      // Generate WAV with espeak-ng
      const cmd = getEspeakCommand();
      const isWin = process.platform === "win32";

      await new Promise<void>((resolve, reject) => {
        if (isWin) {
          // Windows: use cmd /c with quoted path
          const fullCmd = `${cmd} -s 160 -p 50 -w "${wavFile}" "${truncated.replace(/"/g, '\\"')}"`;
          const proc = spawn("cmd", ["/c", fullCmd], { stdio: "ignore" });
          proc.on("close", () => resolve());
          proc.on("error", reject);
        } else {
          const proc = spawn("espeak-ng", [
            "-s", "160",
            "-p", "50",
            "-w", wavFile,
            truncated,
          ], { stdio: "ignore" });
          proc.on("close", () => resolve());
          proc.on("error", reject);
        }
      });
    } else {
      log.warn("No TTS engine available");
      return null;
    }

    // Convert to target format if needed
    if (format !== "wav" && exists(wavFile)) {
      const converted = await convertAudio(wavFile, outputFile, format);
      // Clean up WAV file
      try { unlinkSync(wavFile); } catch {}
      return converted ? outputFile : wavFile;
    }

    return wavFile;
  } catch (err) {
    log.error({ err }, "Failed to generate audio file");
    return null;
  }
}

/**
 * Convert audio file to different format using ffmpeg.
 */
async function convertAudio(input: string, output: string, format: string): Promise<boolean> {
  try {
    // Check if ffmpeg is available
    execSync("ffmpeg -version", { stdio: "ignore", timeout: 5000 });

    // Convert
    const args = ["-i", input, "-y"];

    if (format === "ogg") {
      // Telegram voice messages need ogg with opus codec
      args.push("-c:a", "libopus", "-b:a", "64k", output);
    } else if (format === "mp3") {
      args.push("-c:a", "libmp3lame", "-b:a", "128k", output);
    } else {
      args.push(output);
    }

    execSync(`ffmpeg ${args.join(" ")}`, { stdio: "ignore", timeout: 30000 });
    return true;
  } catch {
    log.warn("ffmpeg not available, using WAV format");
    return false;
  }
}

/**
 * Generate voice reply using Gemini's native TTS (if available).
 * Falls back to local TTS if not available.
 */
export async function generateVoiceWithGemini(
  text: string,
  outputDir: string,
  apiKey?: string
): Promise<string | null> {
  // Try Gemini's native audio generation first
  try {
    const { getClient } = await import("../../ai/gemini.js");
    const ai = getClient();

    // Gemini 2.5 has audio output capability
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{ text: `Please convert this text to speech in a natural, friendly voice: "${text}"` }],
      }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede", // Natural female voice
            },
          },
        },
      } as any,
    });

    // Check if audio was generated
    const candidate = result.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        const p = part as any;
        if (p.inlineData?.mimeType?.startsWith("audio/")) {
          // Save the audio
          const { join } = await import("path");
          const { writeFileSync, mkdirSync, existsSync } = await import("fs");

          if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
          }

          const ext = p.inlineData.mimeType.includes("wav") ? "wav" : "ogg";
          const outputFile = join(outputDir, `voice-gemini-${Date.now()}.${ext}`);
          const audioBuffer = Buffer.from(p.inlineData.data, "base64");
          writeFileSync(outputFile, audioBuffer);

          log.info("Generated voice with Gemini: %s", outputFile);
          return outputFile;
        }
      }
    }
  } catch (err) {
    log.debug("Gemini audio not available, falling back to local TTS");
  }

  // Fall back to local TTS
  return generateAudioFile(text, outputDir);
}
