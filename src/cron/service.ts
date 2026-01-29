import { Cron } from "croner";
import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import type { Agent } from "../core/agent.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("cron");

// ═══════════════════════════════════════════════════════════════════════════
// MoltBot-style Cron Job Types
// ═══════════════════════════════════════════════════════════════════════════

export interface CronJob {
  id: string;
  name: string;
  cron: string;           // Cron expression (e.g., "0 9 * * *")
  instruction: string;    // What to tell the agent
  enabled: boolean;
  createdAt: string;      // ISO timestamp
  lastRunAt?: string;     // ISO timestamp
  nextRunAt?: string;     // ISO timestamp (calculated)
  agentId?: string;       // Optional: run for specific agent
  channel?: string;       // Optional: context channel
  timeout?: number;       // Timeout in seconds (default 60)
  retries?: number;       // Number of retries on failure
  lastError?: string;     // Last error message if failed
  runCount?: number;      // Total number of runs
  successCount?: number;  // Successful runs
}

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  instruction: string;    // What to tell the agent on heartbeat
  lastBeatAt?: string;
}

interface CronStore {
  jobs: CronJob[];
  heartbeat?: HeartbeatConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Cron Service
// ═══════════════════════════════════════════════════════════════════════════

export class CronService {
  private runtimeDir: string;
  private agent: Agent;
  private runners = new Map<string, Cron>();
  private heartbeatRunner?: Cron;
  private isRunning = false;

  constructor(runtimeDir: string, agent: Agent) {
    this.runtimeDir = runtimeDir;
    this.agent = agent;
  }

  private getStorePath(): string {
    return resolve(this.runtimeDir, "cron", "jobs.json");
  }

  private loadStore(): CronStore {
    return readJSON<CronStore>(this.getStorePath()) || { jobs: [] };
  }

  private saveStore(store: CronStore) {
    ensureDir(resolve(this.runtimeDir, "cron"));
    writeJSON(this.getStorePath(), store);
  }

  /**
   * Start the cron service and all enabled jobs.
   */
  start() {
    if (this.isRunning) {
      log.warn("Cron service already running");
      return;
    }

    const store = this.loadStore();

    // Schedule all enabled jobs
    for (const job of store.jobs) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }

    // Start heartbeat if configured
    if (store.heartbeat?.enabled) {
      this.startHeartbeat(store.heartbeat);
    }

    this.isRunning = true;
    log.info("Cron service started with %d jobs", store.jobs.filter(j => j.enabled).length);
  }

  /**
   * Add a new cron job.
   */
  addJob(
    name: string,
    cron: string,
    instruction: string,
    options?: {
      agentId?: string;
      channel?: string;
      timeout?: number;
      retries?: number;
    }
  ): CronJob {
    const store = this.loadStore();

    // Validate cron expression
    try {
      new Cron(cron);
    } catch (err) {
      throw new Error(`Invalid cron expression: ${cron}`);
    }

    const job: CronJob = {
      id: generateId(),
      name,
      cron,
      instruction,
      enabled: true,
      createdAt: new Date().toISOString(),
      agentId: options?.agentId,
      channel: options?.channel,
      timeout: options?.timeout ?? 60,
      retries: options?.retries ?? 0,
      runCount: 0,
      successCount: 0,
    };

    // Calculate next run time
    job.nextRunAt = this.getNextRunTime(cron);

    store.jobs.push(job);
    this.saveStore(store);

    // Schedule if service is running
    if (this.isRunning) {
      this.scheduleJob(job);
    }

    log.info("Added cron job: %s (%s)", name, cron);
    return job;
  }

  /**
   * Remove a cron job.
   */
  removeJob(jobId: string): boolean {
    const store = this.loadStore();
    const idx = store.jobs.findIndex(j => j.id === jobId);

    if (idx < 0) return false;

    // Stop the runner if active
    const runner = this.runners.get(jobId);
    if (runner) {
      runner.stop();
      this.runners.delete(jobId);
    }

    store.jobs.splice(idx, 1);
    this.saveStore(store);

    log.info("Removed cron job: %s", jobId);
    return true;
  }

  /**
   * Toggle a job's enabled status.
   */
  toggleJob(jobId: string): CronJob | null {
    const store = this.loadStore();
    const job = store.jobs.find(j => j.id === jobId);

    if (!job) return null;

    job.enabled = !job.enabled;
    this.saveStore(store);

    // Update scheduling
    if (job.enabled && this.isRunning) {
      this.scheduleJob(job);
    } else {
      const runner = this.runners.get(jobId);
      if (runner) {
        runner.stop();
        this.runners.delete(jobId);
      }
    }

    log.info("Toggled cron job %s: %s", job.name, job.enabled ? "enabled" : "disabled");
    return job;
  }

  /**
   * List all cron jobs.
   */
  listJobs(): CronJob[] {
    const store = this.loadStore();
    return store.jobs.map(job => ({
      ...job,
      nextRunAt: job.enabled ? this.getNextRunTime(job.cron) : undefined,
    }));
  }

  /**
   * Get a specific job by ID.
   */
  getJob(jobId: string): CronJob | null {
    const store = this.loadStore();
    return store.jobs.find(j => j.id === jobId) || null;
  }

  /**
   * Manually trigger a job.
   */
  async triggerJob(jobId: string): Promise<{ success: boolean; output?: string; error?: string }> {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, error: "Job not found" };
    }

    return this.executeJob(job);
  }

  /**
   * Configure heartbeat.
   */
  configureHeartbeat(config: Omit<HeartbeatConfig, "lastBeatAt">): void {
    const store = this.loadStore();
    store.heartbeat = { ...config, lastBeatAt: store.heartbeat?.lastBeatAt };
    this.saveStore(store);

    // Restart heartbeat if running
    if (this.isRunning) {
      if (this.heartbeatRunner) {
        this.heartbeatRunner.stop();
      }
      if (config.enabled) {
        this.startHeartbeat(store.heartbeat);
      }
    }

    log.info("Heartbeat configured: %s every %d minutes",
      config.enabled ? "enabled" : "disabled",
      config.intervalMinutes
    );
  }

  /**
   * Get heartbeat status.
   */
  getHeartbeatStatus(): HeartbeatConfig | null {
    const store = this.loadStore();
    return store.heartbeat || null;
  }

  private scheduleJob(job: CronJob) {
    // Stop existing runner if any
    const existing = this.runners.get(job.id);
    if (existing) {
      existing.stop();
    }

    const runner = new Cron(job.cron, async () => {
      await this.executeJob(job);
    });

    this.runners.set(job.id, runner);
    log.debug("Scheduled job: %s (next: %s)", job.name, this.getNextRunTime(job.cron));
  }

  private async executeJob(job: CronJob): Promise<{ success: boolean; output?: string; error?: string }> {
    log.info("Running cron job: %s", job.name);

    const store = this.loadStore();
    const jobInStore = store.jobs.find(j => j.id === job.id);

    if (!jobInStore) {
      return { success: false, error: "Job not found in store" };
    }

    jobInStore.runCount = (jobInStore.runCount || 0) + 1;

    let retries = job.retries || 0;
    let lastError: string | undefined;

    while (retries >= 0) {
      try {
        // Run with timeout
        const timeout = (job.timeout || 60) * 1000;
        const result = await Promise.race([
          this.agent.chat(
            job.instruction,
            `cron:${job.id}`,
            job.channel || "cron",
            "cron"
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeout)
          ),
        ]);

        // Success
        jobInStore.lastRunAt = new Date().toISOString();
        jobInStore.nextRunAt = this.getNextRunTime(job.cron);
        jobInStore.successCount = (jobInStore.successCount || 0) + 1;
        jobInStore.lastError = undefined;
        this.saveStore(store);

        log.info("Cron job completed: %s", job.name);
        return { success: true, output: result.text };
      } catch (err: any) {
        lastError = err.message || String(err);
        log.error({ err }, "Cron job failed: %s (retries left: %d)", job.name, retries);
        retries--;

        if (retries >= 0) {
          // Wait before retry
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    // All retries exhausted
    jobInStore.lastRunAt = new Date().toISOString();
    jobInStore.lastError = lastError;
    this.saveStore(store);

    return { success: false, error: lastError };
  }

  private startHeartbeat(config: HeartbeatConfig) {
    if (this.heartbeatRunner) {
      this.heartbeatRunner.stop();
    }

    // Convert minutes to cron expression
    const cronExpr = `*/${config.intervalMinutes} * * * *`;

    this.heartbeatRunner = new Cron(cronExpr, async () => {
      log.debug("Heartbeat triggered");

      try {
        await this.agent.chat(
          config.instruction,
          "heartbeat",
          "system",
          "heartbeat"
        );

        // Update last beat time
        const store = this.loadStore();
        if (store.heartbeat) {
          store.heartbeat.lastBeatAt = new Date().toISOString();
          this.saveStore(store);
        }

        log.debug("Heartbeat completed");
      } catch (err) {
        log.error({ err }, "Heartbeat failed");
      }
    });

    log.info("Heartbeat started: every %d minutes", config.intervalMinutes);
  }

  private getNextRunTime(cron: string): string {
    try {
      const runner = new Cron(cron);
      const next = runner.nextRun();
      runner.stop();
      return next?.toISOString() || new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Stop all cron jobs and heartbeat.
   */
  stop() {
    for (const [id, runner] of this.runners) {
      runner.stop();
      log.debug("Stopped job: %s", id);
    }
    this.runners.clear();

    if (this.heartbeatRunner) {
      this.heartbeatRunner.stop();
      this.heartbeatRunner = undefined;
    }

    this.isRunning = false;
    log.info("Cron service stopped");
  }

  /**
   * Get service status.
   */
  getStatus(): {
    running: boolean;
    activeJobs: number;
    totalJobs: number;
    heartbeatActive: boolean;
  } {
    const store = this.loadStore();
    return {
      running: this.isRunning,
      activeJobs: this.runners.size,
      totalJobs: store.jobs.length,
      heartbeatActive: !!this.heartbeatRunner,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Parse human-readable schedule to cron expression.
 * Examples: "every 5 minutes", "daily at 9am", "weekdays at 10:30"
 */
export function parseSchedule(schedule: string): string {
  const lower = schedule.toLowerCase().trim();

  // "every X minutes"
  const minuteMatch = lower.match(/every\s+(\d+)\s+minute/);
  if (minuteMatch) {
    return `*/${minuteMatch[1]} * * * *`;
  }

  // "every X hours"
  const hourMatch = lower.match(/every\s+(\d+)\s+hour/);
  if (hourMatch) {
    return `0 */${hourMatch[1]} * * *`;
  }

  // "daily at Xam/pm" or "daily at X:XX"
  const dailyMatch = lower.match(/daily\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)?/);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1]);
    const minute = dailyMatch[2] ? parseInt(dailyMatch[2]) : 0;
    if (dailyMatch[3] === "pm" && hour < 12) hour += 12;
    if (dailyMatch[3] === "am" && hour === 12) hour = 0;
    return `${minute} ${hour} * * *`;
  }

  // "weekdays at Xam/pm"
  const weekdayMatch = lower.match(/weekdays?\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)?/);
  if (weekdayMatch) {
    let hour = parseInt(weekdayMatch[1]);
    const minute = weekdayMatch[2] ? parseInt(weekdayMatch[2]) : 0;
    if (weekdayMatch[3] === "pm" && hour < 12) hour += 12;
    if (weekdayMatch[3] === "am" && hour === 12) hour = 0;
    return `${minute} ${hour} * * 1-5`;
  }

  // "every monday at X"
  const weeklyMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)?/);
  if (weeklyMatch) {
    const days: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const day = days[weeklyMatch[1]];
    let hour = parseInt(weeklyMatch[2]);
    const minute = weeklyMatch[3] ? parseInt(weeklyMatch[3]) : 0;
    if (weeklyMatch[4] === "pm" && hour < 12) hour += 12;
    if (weeklyMatch[4] === "am" && hour === 12) hour = 0;
    return `${minute} ${hour} * * ${day}`;
  }

  // Return as-is if it looks like a cron expression
  if (/^[\d\*\/\-,]+\s+[\d\*\/\-,]+\s+[\d\*\/\-,]+\s+[\d\*\/\-,]+\s+[\d\*\/\-,]+$/.test(lower)) {
    return lower;
  }

  throw new Error(`Could not parse schedule: ${schedule}`);
}
