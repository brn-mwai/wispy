/**
 * Voice REPL mode.
 *
 * Listens via microphone (STT), processes with agent, speaks back (TTS).
 * Activated with /voice on in the CLI.
 */

import { recordAudio, transcribe, type SttEngine } from "./stt.js";
import { speak, detectTtsEngine, type TtsEngine } from "./tts.js";
import { t } from "../ui/theme.js";
import { createLogger } from "../../infra/logger.js";
import type { Agent } from "../../core/agent.js";

const log = createLogger("voice");

export interface VoiceConfig {
  sttEngine: SttEngine;
  ttsEngine: TtsEngine;
  silenceTimeout: number;
  maxListenSeconds: number;
}

const DEFAULT_CONFIG: VoiceConfig = {
  sttEngine: "whisper",
  ttsEngine: detectTtsEngine(),
  silenceTimeout: 2,
  maxListenSeconds: 30,
};

export class VoiceMode {
  private agent: Agent;
  private config: VoiceConfig;
  private active = false;
  private peerId: string;

  constructor(agent: Agent, peerId: string, config?: Partial<VoiceConfig>) {
    this.agent = agent;
    this.peerId = peerId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start voice mode. Loops: listen → transcribe → agent → speak.
   */
  async start(): Promise<void> {
    this.active = true;
    console.log(t.brand("\nVoice mode activated"));
    console.log(t.dim(`  STT: ${this.config.sttEngine} | TTS: ${this.config.ttsEngine}`));
    console.log(t.dim("  Say 'stop listening' or press Ctrl+C to exit\n"));

    while (this.active) {
      try {
        // Listen
        console.log(t.info("  Listening..."));
        const audioPath = await recordAudio(this.config.maxListenSeconds);

        // Transcribe
        console.log(t.dim("  Transcribing..."));
        const sttResult = await transcribe(audioPath, this.config.sttEngine);

        if (!sttResult.text.trim()) {
          console.log(t.dim("  (no speech detected)"));
          continue;
        }

        console.log(t.user(`  You: ${sttResult.text}`));

        // Check for stop command
        const lower = sttResult.text.toLowerCase();
        if (lower.includes("stop listening") || lower.includes("exit voice")) {
          this.stop();
          break;
        }

        // Process with agent
        console.log(t.thinking("  Thinking..."));
        const response = await this.agent.chat(
          sttResult.text,
          this.peerId,
          "voice",
          "main"
        );

        console.log(t.agent(`  Wispy: ${response.text.slice(0, 200)}`));

        // Speak response
        await speak(response.text, this.config.ttsEngine);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("Voice loop error: %s", message);
        console.log(t.err(`  Error: ${message}`));

        // Don't crash on transient errors
        if (message.includes("not found") || message.includes("not available")) {
          console.log(t.err("  Voice mode requires sox + whisper. See docs: docs.wispy.cc/cli-reference"));
          this.stop();
          break;
        }
      }
    }
  }

  /**
   * Stop voice mode.
   */
  stop(): void {
    this.active = false;
    console.log(t.dim("\n  Voice mode deactivated\n"));
  }

  /**
   * Check if voice mode is currently active.
   */
  get isActive(): boolean {
    return this.active;
  }
}
