/**
 * Marathon Watchdog Service
 *
 * Background service that:
 * - Monitors all running durable marathons
 * - Detects crashed agents via heartbeat timeout
 * - Auto-restarts from last checkpoint
 * - Sends alerts on crash detection
 * - Provides centralized marathon management
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { EventEmitter } from "events";
import type { Agent } from "../core/agent.js";
import type { DurableMarathonState, MarathonEvent } from "./types.js";
import { DurableMarathonExecutor } from "./durable-executor.js";
import { sendTelegramMessage } from "../channels/telegram/adapter.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("watchdog");

export interface WatchdogConfig {
  enabled: boolean;
  checkIntervalMs: number;       // How often to check (default: 60000 = 1 min)
  marathonDir: string;           // Directory with marathon state files
  autoRestart: boolean;          // Auto-restart crashed marathons
  maxRestarts: number;           // Max restarts before giving up (default: 3)
  alertOnCrash: boolean;
  alertChannels: {
    telegram?: string;
    discord?: string;
    slack?: string;
  };
}

interface MonitoredMarathon {
  id: string;
  state: DurableMarathonState;
  executor: DurableMarathonExecutor | null;
  restartCount: number;
  lastCheck: number;
  status: "running" | "paused" | "crashed" | "completed" | "failed" | "stopped";
}

export class MarathonWatchdog extends EventEmitter {
  private config: WatchdogConfig;
  private agent: Agent | null = null;
  private apiKey: string = "";
  private monitored: Map<string, MonitoredMarathon> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: Partial<WatchdogConfig> = {}) {
    super();

    this.config = {
      enabled: true,
      checkIntervalMs: 60000,
      marathonDir: resolve(process.cwd(), ".wispy", "marathon"),
      autoRestart: true,
      maxRestarts: 3,
      alertOnCrash: true,
      alertChannels: {},
      ...config,
    };

    // Ensure marathon directory exists
    if (!existsSync(this.config.marathonDir)) {
      mkdirSync(this.config.marathonDir, { recursive: true });
    }
  }

  /**
   * Set the agent to use for restarting marathons
   */
  setAgent(agent: Agent, apiKey: string): void {
    this.agent = agent;
    this.apiKey = apiKey;
  }

  /**
   * Start the watchdog service
   */
  start(): void {
    if (this.running) {
      log.warn("Watchdog already running");
      return;
    }

    log.info("Starting Marathon Watchdog service");
    this.running = true;

    // Initial scan
    this.scanMarathons();

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllMarathons();
    }, this.config.checkIntervalMs);

    this.emit("started");
  }

  /**
   * Stop the watchdog service
   */
  stop(): void {
    if (!this.running) return;

    log.info("Stopping Marathon Watchdog service");
    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.emit("stopped");
  }

  /**
   * Scan marathon directory for state files
   */
  private scanMarathons(): void {
    try {
      const files = readdirSync(this.config.marathonDir).filter(f => f.endsWith(".json"));

      for (const file of files) {
        const id = file.replace(".json", "");
        if (!this.monitored.has(id)) {
          this.loadMarathon(id);
        }
      }
    } catch (e) {
      log.error({ err: e }, "Failed to scan marathons");
    }
  }

  /**
   * Load a marathon state and start monitoring
   */
  private loadMarathon(id: string): void {
    const statePath = join(this.config.marathonDir, `${id}.json`);

    try {
      const stateJson = readFileSync(statePath, "utf-8");
      const state: DurableMarathonState = JSON.parse(stateJson);

      const monitored: MonitoredMarathon = {
        id,
        state,
        executor: null,
        restartCount: state.crashCount || 0,
        lastCheck: Date.now(),
        status: this.determineStatus(state),
      };

      this.monitored.set(id, monitored);
      log.info({ marathonId: id, status: monitored.status }, "Loaded marathon");

      this.emit("marathon_loaded", { id, status: monitored.status });
    } catch (e) {
      log.error({ err: e, marathonId: id }, "Failed to load marathon state");
    }
  }

  /**
   * Determine marathon status from state
   */
  private determineStatus(state: DurableMarathonState): MonitoredMarathon["status"] {
    if (state.status === "completed") return "completed";
    if (state.status === "failed") return "failed";
    if (state.status === "paused") return "paused";

    // Check heartbeat
    if (state.heartbeat.lastHeartbeat) {
      const lastBeat = new Date(state.heartbeat.lastHeartbeat).getTime();
      const now = Date.now();

      if (now - lastBeat > state.heartbeat.timeoutMs) {
        return "crashed";
      }
    }

    if (state.status === "executing") return "running";

    return "stopped";
  }

  /**
   * Check all monitored marathons
   */
  private async checkAllMarathons(): Promise<void> {
    // Scan for new marathons
    this.scanMarathons();

    for (const [id, marathon] of this.monitored) {
      await this.checkMarathon(marathon);
    }
  }

  /**
   * Check a single marathon
   */
  private async checkMarathon(marathon: MonitoredMarathon): Promise<void> {
    // Reload state from disk
    const statePath = join(this.config.marathonDir, `${marathon.id}.json`);
    if (!existsSync(statePath)) {
      this.monitored.delete(marathon.id);
      return;
    }

    try {
      const stateJson = readFileSync(statePath, "utf-8");
      marathon.state = JSON.parse(stateJson);
    } catch (e) {
      log.error({ err: e, marathonId: marathon.id }, "Failed to reload state");
      return;
    }

    const previousStatus = marathon.status;
    marathon.status = this.determineStatus(marathon.state);
    marathon.lastCheck = Date.now();

    // Status changed?
    if (previousStatus !== marathon.status) {
      log.info(
        { marathonId: marathon.id, from: previousStatus, to: marathon.status },
        "Marathon status changed"
      );
      this.emit("status_changed", { id: marathon.id, from: previousStatus, to: marathon.status });
    }

    // Handle crash detection
    if (marathon.status === "crashed") {
      await this.handleCrash(marathon);
    }

    // Handle completion
    if (marathon.status === "completed" && previousStatus !== "completed") {
      log.info({ marathonId: marathon.id }, "Marathon completed");
      this.emit("completed", { id: marathon.id, state: marathon.state });
    }
  }

  /**
   * Handle crashed marathon
   */
  private async handleCrash(marathon: MonitoredMarathon): Promise<void> {
    log.warn(
      { marathonId: marathon.id, crashCount: marathon.restartCount + 1 },
      "Detected crashed marathon"
    );

    // Alert
    if (this.config.alertOnCrash) {
      await this.sendAlert(marathon, "crash");
    }

    this.emit("crash_detected", { id: marathon.id, crashCount: marathon.restartCount + 1 });

    // Auto-restart?
    if (
      this.config.autoRestart &&
      marathon.state.autoResumeEnabled &&
      marathon.restartCount < this.config.maxRestarts
    ) {
      await this.restartMarathon(marathon);
    } else if (marathon.restartCount >= this.config.maxRestarts) {
      log.error(
        { marathonId: marathon.id, restarts: marathon.restartCount },
        "Max restarts exceeded, giving up"
      );
      await this.sendAlert(marathon, "max_restarts");
      marathon.status = "failed";
    }
  }

  /**
   * Restart a crashed marathon
   */
  private async restartMarathon(marathon: MonitoredMarathon): Promise<void> {
    if (!this.agent || !this.apiKey) {
      log.error("Cannot restart marathon: no agent configured");
      return;
    }

    log.info({ marathonId: marathon.id }, "Attempting to restart marathon");

    try {
      marathon.restartCount++;
      marathon.state.crashCount = marathon.restartCount;
      marathon.state.lastCrashAt = new Date().toISOString();
      marathon.state.status = "executing";

      // Create new executor
      marathon.executor = new DurableMarathonExecutor(
        this.agent,
        this.apiKey,
        marathon.state
      );

      // Forward events
      marathon.executor.on("event", (event: MarathonEvent) => {
        this.emit("marathon_event", { marathonId: marathon.id, event });
      });

      marathon.status = "running";

      // Run in background
      marathon.executor
        .run()
        .then((finalState) => {
          marathon.state = finalState;
          marathon.status = this.determineStatus(finalState);
          marathon.executor = null;
        })
        .catch((err) => {
          log.error({ err, marathonId: marathon.id }, "Marathon execution failed");
          marathon.status = "crashed";
          marathon.executor = null;
        });

      await this.sendAlert(marathon, "restarted");

      this.emit("marathon_restarted", { id: marathon.id, attempt: marathon.restartCount });
    } catch (e) {
      log.error({ err: e, marathonId: marathon.id }, "Failed to restart marathon");
    }
  }

  /**
   * Send alert to configured channels
   */
  private async sendAlert(
    marathon: MonitoredMarathon,
    type: "crash" | "restarted" | "max_restarts"
  ): Promise<void> {
    const channels = this.config.alertChannels;

    let message = "";
    switch (type) {
      case "crash":
        message =
          `🚨 *Marathon Crash Detected*\n\n` +
          `ID: ${marathon.id}\n` +
          `Goal: ${marathon.state.plan.goal}\n` +
          `Crash count: ${marathon.restartCount + 1}\n\n` +
          `Last action: ${marathon.state.heartbeat.lastAction || "Unknown"}`;
        break;
      case "restarted":
        message =
          `🔄 *Marathon Restarted*\n\n` +
          `ID: ${marathon.id}\n` +
          `Goal: ${marathon.state.plan.goal}\n` +
          `Attempt: ${marathon.restartCount}/${this.config.maxRestarts}`;
        break;
      case "max_restarts":
        message =
          `⛔ *Marathon Failed - Max Restarts*\n\n` +
          `ID: ${marathon.id}\n` +
          `Goal: ${marathon.state.plan.goal}\n` +
          `Total restarts: ${marathon.restartCount}\n\n` +
          `Manual intervention required.`;
        break;
    }

    if (channels.telegram) {
      try {
        await sendTelegramMessage(channels.telegram, message);
      } catch {}
    }

    if (channels.discord) {
      try {
        await fetch(channels.discord, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.replace(/\*/g, "**") }),
        });
      } catch {}
    }

    if (channels.slack) {
      try {
        await fetch(channels.slack, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
      } catch {}
    }
  }

  // === PUBLIC API ===

  /**
   * Get status of all marathons
   */
  getAll(): MonitoredMarathon[] {
    return Array.from(this.monitored.values());
  }

  /**
   * Get status of a specific marathon
   */
  get(id: string): MonitoredMarathon | undefined {
    return this.monitored.get(id);
  }

  /**
   * Manually trigger restart of a marathon
   */
  async restart(id: string): Promise<boolean> {
    const marathon = this.monitored.get(id);
    if (!marathon) {
      log.warn({ marathonId: id }, "Marathon not found");
      return false;
    }

    marathon.restartCount = 0; // Reset counter for manual restart
    await this.restartMarathon(marathon);
    return true;
  }

  /**
   * Pause a running marathon
   */
  pause(id: string): boolean {
    const marathon = this.monitored.get(id);
    if (!marathon || !marathon.executor) return false;

    marathon.executor.pause();
    return true;
  }

  /**
   * Abort a marathon
   */
  abort(id: string): boolean {
    const marathon = this.monitored.get(id);
    if (!marathon || !marathon.executor) return false;

    marathon.executor.abort();
    return true;
  }

  /**
   * Approve a pending request
   */
  approve(marathonId: string, requestId: string, approvedBy: string = "watchdog"): boolean {
    const marathon = this.monitored.get(marathonId);
    if (!marathon || !marathon.executor) return false;

    marathon.executor.approve(requestId, approvedBy);
    return true;
  }

  /**
   * Reject a pending request
   */
  reject(marathonId: string, requestId: string, reason: string = "Rejected via watchdog"): boolean {
    const marathon = this.monitored.get(marathonId);
    if (!marathon || !marathon.executor) return false;

    marathon.executor.reject(requestId, reason);
    return true;
  }

  /**
   * Get pending approval requests across all marathons
   */
  getPendingApprovals(): Array<{ marathonId: string; request: any }> {
    const pending: Array<{ marathonId: string; request: any }> = [];

    for (const [id, marathon] of this.monitored) {
      const requests = marathon.state.approvalRequests.filter(r => r.status === "pending");
      for (const request of requests) {
        pending.push({ marathonId: id, request });
      }
    }

    return pending;
  }
}

/**
 * Create a global watchdog instance
 */
let globalWatchdog: MarathonWatchdog | null = null;

export function getWatchdog(): MarathonWatchdog {
  if (!globalWatchdog) {
    globalWatchdog = new MarathonWatchdog();
  }
  return globalWatchdog;
}

export function startWatchdog(
  agent: Agent,
  apiKey: string,
  config?: Partial<WatchdogConfig>
): MarathonWatchdog {
  const watchdog = new MarathonWatchdog(config);
  watchdog.setAgent(agent, apiKey);
  watchdog.start();
  return watchdog;
}
