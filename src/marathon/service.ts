/**
 * Marathon Service
 * Main entry point for autonomous multi-day task execution
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { nanoid } from "nanoid";
import type { Agent } from "../core/agent.js";
import type { MarathonState, MarathonResult, NotificationConfig } from "./types.js";
import { createMarathonPlan, formatPlanSummary, getPlanProgress } from "./planner.js";
import { MarathonExecutor } from "./executor.js";

export class MarathonService {
  private runtimeDir: string;
  private marathonDir: string;
  private activeExecutor: MarathonExecutor | null = null;

  constructor(runtimeDir: string) {
    this.runtimeDir = runtimeDir;
    this.marathonDir = resolve(runtimeDir, "marathon");
    this.ensureDir(this.marathonDir);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Start a new marathon with a goal
   */
  async start(
    goal: string,
    agent: Agent,
    apiKey: string,
    options: {
      workingDirectory?: string;
      notifications?: Partial<NotificationConfig>;
      context?: string;
    } = {}
  ): Promise<MarathonState> {
    const workingDirectory = options.workingDirectory || process.cwd();

    console.log("\n🏃 Starting Marathon Agent...\n");
    console.log(`Goal: ${goal}`);
    console.log(`Working Directory: ${workingDirectory}\n`);

    // Phase 1: Planning
    console.log("📋 Phase 1: Creating execution plan with ultra thinking...\n");
    const plan = await createMarathonPlan(
      goal,
      options.context || `Working directory: ${workingDirectory}`,
      apiKey
    );

    console.log(formatPlanSummary(plan));
    console.log("\n");

    // Create initial state
    const state: MarathonState = {
      id: nanoid(12),
      plan,
      status: "planning",
      startedAt: new Date().toISOString(),
      totalTokensUsed: 0,
      totalCost: 0,
      thoughtSignature: JSON.stringify({
        goal,
        workingDirectory,
        initialized: new Date().toISOString(),
      }),
      workingDirectory,
      artifacts: [],
      logs: [],
      humanInputQueue: [],
      notifications: {
        enabled: options.notifications?.enabled ?? false,
        channels: options.notifications?.channels ?? {},
        notifyOn: {
          milestoneComplete: true,
          milestoneFailure: true,
          humanInputNeeded: true,
          marathonComplete: true,
          dailySummary: true,
          ...options.notifications?.notifyOn,
        },
      },
      checkpoints: [],
    };

    // Save initial state
    this.saveState(state);

    // Phase 2: Execution
    console.log("🚀 Phase 2: Beginning autonomous execution...\n");
    console.log("The agent will now work autonomously. You can:");
    console.log("  - Check status with: wispy marathon status");
    console.log("  - Pause with: wispy marathon pause");
    console.log("  - View logs with: wispy marathon logs\n");

    // Create and start executor
    this.activeExecutor = new MarathonExecutor(agent, apiKey, state);
    const finalState = await this.activeExecutor.run();

    // Save final state
    this.saveState(finalState);

    return finalState;
  }

  /**
   * Resume a paused marathon
   */
  async resume(marathonId: string, agent: Agent, apiKey: string): Promise<MarathonState> {
    const state = this.loadState(marathonId);
    if (!state) {
      throw new Error(`Marathon ${marathonId} not found`);
    }

    if (state.status !== "paused") {
      throw new Error(`Marathon ${marathonId} is not paused (status: ${state.status})`);
    }

    console.log(`\n🔄 Resuming marathon: ${state.plan.goal}\n`);

    const progress = getPlanProgress(state.plan);
    console.log(`Progress: ${progress.completed}/${progress.total} milestones`);
    console.log(`Estimated remaining: ${progress.estimatedRemainingMinutes} minutes\n`);

    state.status = "executing";
    state.pausedAt = undefined;

    this.activeExecutor = new MarathonExecutor(agent, apiKey, state);
    const finalState = await this.activeExecutor.run();

    this.saveState(finalState);
    return finalState;
  }

  /**
   * Pause the active marathon
   */
  pause(): void {
    if (this.activeExecutor) {
      this.activeExecutor.pause();
      console.log("⏸️  Marathon paused. Use 'wispy marathon resume' to continue.");
    } else {
      console.log("No active marathon to pause.");
    }
  }

  /**
   * Abort the active marathon
   */
  abort(): void {
    if (this.activeExecutor) {
      this.activeExecutor.abort();
      console.log("🛑 Marathon aborted.");
    } else {
      console.log("No active marathon to abort.");
    }
  }

  /**
   * Get status of a marathon
   */
  getStatus(marathonId?: string): MarathonState | null {
    if (marathonId) {
      return this.loadState(marathonId);
    }

    // Get most recent active marathon
    const marathons = this.listMarathons();
    const active = marathons.find(
      (m) => m.status === "executing" || m.status === "paused"
    );
    return active || marathons[0] || null;
  }

  /**
   * List all marathons
   */
  listMarathons(): MarathonState[] {
    const files = readdirSync(this.marathonDir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => this.loadState(f.replace(".json", "")))
      .filter((s): s is MarathonState => s !== null)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Get marathon result
   */
  getResult(marathonId: string): MarathonResult | null {
    const state = this.loadState(marathonId);
    if (!state) return null;

    const completed = state.plan.milestones.filter((m) => m.status === "completed");
    const totalTime = state.completedAt
      ? (new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()) / 60000
      : 0;

    return {
      success: state.status === "completed",
      completedMilestones: completed.length,
      totalMilestones: state.plan.milestones.length,
      artifacts: state.artifacts,
      totalTime: Math.round(totalTime),
      totalCost: state.totalCost,
      summary: this.generateSummary(state),
    };
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(marathonId: string, checkpointId: string): Promise<void> {
    const state = this.loadState(marathonId);
    if (!state) throw new Error(`Marathon ${marathonId} not found`);

    const checkpoint = state.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) throw new Error(`Checkpoint ${checkpointId} not found`);

    // Reset milestones after checkpoint
    const checkpointMilestoneIndex = state.plan.milestones.findIndex(
      (m) => m.id === checkpoint.milestoneId
    );

    state.plan.milestones = state.plan.milestones.map((m, i) => {
      if (i > checkpointMilestoneIndex) {
        return { ...m, status: "pending" as const };
      }
      return m;
    });

    state.thoughtSignature = checkpoint.thoughtSignature;
    state.status = "paused";

    this.saveState(state);
    console.log(`✅ Restored to checkpoint ${checkpointId}`);
  }

  private saveState(state: MarathonState): void {
    const path = resolve(this.marathonDir, `${state.id}.json`);
    writeFileSync(path, JSON.stringify(state, null, 2));
  }

  private loadState(marathonId: string): MarathonState | null {
    const path = resolve(this.marathonDir, `${marathonId}.json`);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      return null;
    }
  }

  private generateSummary(state: MarathonState): string {
    const completed = state.plan.milestones.filter((m) => m.status === "completed");
    const failed = state.plan.milestones.filter((m) => m.status === "failed");

    let summary = `Marathon "${state.plan.goal}" `;

    if (state.status === "completed") {
      summary += `completed successfully.\n`;
      summary += `Completed ${completed.length} milestones.\n`;
    } else if (state.status === "failed") {
      summary += `failed.\n`;
      summary += `Completed ${completed.length}/${state.plan.milestones.length} milestones.\n`;
      summary += `Failed milestones: ${failed.map((m) => m.title).join(", ")}\n`;
    } else {
      summary += `is ${state.status}.\n`;
    }

    if (state.artifacts.length > 0) {
      summary += `\nArtifacts created:\n${state.artifacts.map((a) => `  - ${a}`).join("\n")}`;
    }

    return summary;
  }
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

/**
 * Display marathon status in a nice format
 */
export function displayMarathonStatus(state: MarathonState): void {
  const chalk = require("chalk");
  const progress = getPlanProgress(state.plan);

  console.log("\n" + chalk.bold.cyan("═".repeat(60)));
  console.log(chalk.bold.cyan("  MARATHON STATUS"));
  console.log(chalk.bold.cyan("═".repeat(60)) + "\n");

  // Status badge
  const statusColors: Record<string, (s: string) => string> = {
    planning: chalk.blue,
    executing: chalk.yellow,
    verifying: chalk.cyan,
    paused: chalk.gray,
    completed: chalk.green,
    failed: chalk.red,
    waiting_human: chalk.magenta,
  };
  const statusColor = statusColors[state.status] || chalk.white;
  console.log(`  Status: ${statusColor(state.status.toUpperCase())}`);
  console.log(`  Goal: ${chalk.white(state.plan.goal)}`);
  console.log(`  ID: ${chalk.dim(state.id)}`);
  console.log();

  // Progress bar
  const barWidth = 40;
  const filled = Math.round((progress.percentage / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  console.log(`  Progress: [${bar}] ${progress.percentage}%`);
  console.log(`  Milestones: ${progress.completed}/${progress.total}`);
  console.log(`  ETA: ${formatDuration(progress.estimatedRemainingMinutes)}`);
  console.log();

  // Milestones
  console.log(chalk.bold("  Milestones:"));
  for (const m of state.plan.milestones) {
    const icons: Record<string, string> = {
      pending: "⏳",
      in_progress: "🔄",
      completed: "✅",
      failed: "❌",
      skipped: "⏭️",
    };
    const icon = icons[m.status] || "❓";
    const color = m.status === "completed" ? chalk.green :
                  m.status === "failed" ? chalk.red :
                  m.status === "in_progress" ? chalk.yellow :
                  chalk.dim;
    console.log(`    ${icon} ${color(m.title)}`);
  }
  console.log();

  // Recent logs
  const recentLogs = state.logs.slice(-5);
  if (recentLogs.length > 0) {
    console.log(chalk.bold("  Recent Activity:"));
    for (const log of recentLogs) {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const levelColors: Record<string, (s: string) => string> = {
        info: chalk.blue,
        warn: chalk.yellow,
        error: chalk.red,
        success: chalk.green,
        thinking: chalk.magenta,
      };
      const color = levelColors[log.level] || chalk.white;
      console.log(`    ${chalk.dim(time)} ${color(log.message)}`);
    }
  }

  console.log("\n" + chalk.bold.cyan("═".repeat(60)) + "\n");
}
