import {
  loadHeartbeatState,
  saveHeartbeatState,
  appendDailyNote,
  type HeartbeatState,
} from "./memory.js";
import { loadHistory, loadRegistry } from "./session.js";
import type { MemoryManager } from "../memory/manager.js";
import type { WispyConfig } from "../config/schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("heartbeat");

export class HeartbeatRunner {
  private config: WispyConfig;
  private runtimeDir: string;
  private soulDir: string;
  private memoryManager: MemoryManager;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: WispyConfig,
    runtimeDir: string,
    soulDir: string,
    memoryManager: MemoryManager
  ) {
    this.config = config;
    this.runtimeDir = runtimeDir;
    this.soulDir = soulDir;
    this.memoryManager = memoryManager;
  }

  start() {
    const intervalMs = this.config.memory.heartbeatIntervalMinutes * 60 * 1000;
    log.info("Heartbeat started (every %d min)", this.config.memory.heartbeatIntervalMinutes);

    this.timer = setInterval(() => this.tick(), intervalMs);

    // Run first tick after 10 seconds
    setTimeout(() => this.tick(), 10000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    log.info("Heartbeat tick");
    const state = loadHeartbeatState(this.soulDir);

    try {
      // 1. Sync recent sessions to memory
      await this.syncSessions(state);

      // 2. Write daily note
      appendDailyNote(this.soulDir, "Heartbeat tick completed");

      // 3. Update state
      state.lastRun = new Date().toISOString();
      saveHeartbeatState(this.soulDir, state);

      log.info("Heartbeat complete");
    } catch (err) {
      log.error({ err }, "Heartbeat failed");
    }
  }

  private async syncSessions(state: HeartbeatState) {
    const agentId = this.config.agent.id;
    const reg = loadRegistry(this.runtimeDir, agentId);

    for (const session of Object.values(reg.sessions)) {
      const history = loadHistory(this.runtimeDir, agentId, session.sessionKey);

      // Index new messages since last sync
      const startIdx = state.lastSyncMessageIndex;
      const newMessages = history.slice(startIdx);

      if (newMessages.length === 0) continue;

      log.debug("Syncing %d new messages from %s", newMessages.length, session.sessionKey);

      for (const msg of newMessages) {
        if (msg.content && msg.content.length > 20) {
          try {
            await this.memoryManager.addMemory(
              msg.content.slice(0, 1000),
              "session",
              session.sessionKey
            );
          } catch { /* continue on embedding failure */ }
        }
      }

      state.lastSyncMessageIndex = history.length;
    }
  }
}
