import chalk from "chalk";
import type { MarathonEvent, MarathonEventType, MarathonState, Milestone } from "../../marathon/types.js";

/**
 * CLI Marathon Progress Renderer
 *
 * Renders a live, compact progress display for marathon execution
 * directly in the terminal.
 */

const sky = chalk.rgb(49, 204, 255);
const skyBold = chalk.rgb(49, 204, 255).bold;

interface MilestoneDisplay {
  index: number;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startedAt?: number;
}

export class MarathonRenderer {
  private milestones: MilestoneDisplay[] = [];
  private marathonId = "";
  private marathonGoal = "";
  private startTime = Date.now();
  private lastTool = "";
  private lastToolTime = 0;
  private currentPhase = "Planning";
  private recoveryCount = 0;

  /**
   * Initialize the renderer with a marathon state
   */
  init(state: MarathonState): void {
    this.marathonId = state.id;
    this.marathonGoal = state.plan?.goal || "";
    this.startTime = Date.now();
    this.milestones = (state.plan?.milestones || []).map((m: Milestone, i: number) => ({
      index: i,
      title: m.title,
      status: m.status || "pending",
    }));
  }

  /**
   * Handle a marathon event and print a compact update line
   */
  handleEvent(event: MarathonEvent): void {
    const type = event.type;
    const data = (event.data || {}) as Record<string, unknown>;

    switch (type) {
      case "started":
        this.marathonId = event.marathonId || this.marathonId;
        this.printHeader();
        break;

      case "milestone_started": {
        const idx = (data.milestoneIndex as number) ?? event.progress?.completed ?? 0;
        if (this.milestones[idx]) {
          this.milestones[idx].status = "in_progress";
          this.milestones[idx].startedAt = Date.now();
        }
        this.currentPhase = "Executing";
        const total = this.milestones.length || event.progress?.total || 0;
        const title = this.milestones[idx]?.title || (data.title as string) || `Milestone ${idx + 1}`;
        console.log();
        console.log(`  ${skyBold(`[${idx + 1}/${total}]`)} ${chalk.bold(title)}`);
        console.log(`  ${chalk.dim("\u2500".repeat(60))}`);
        break;
      }

      case "tool_executing":
        this.lastTool = (data.toolName as string) || (data.name as string) || "";
        this.lastToolTime = Date.now();
        process.stdout.write(`  ${chalk.yellow("\u25B8")} ${chalk.dim(this.lastTool)}`);
        break;

      case "tool_completed": {
        const dur = this.lastToolTime ? ((Date.now() - this.lastToolTime) / 1000).toFixed(1) : "?";
        const hasError = data.error || data.status === "error";
        process.stdout.write(hasError ? chalk.red(` \u2717 ${dur}s\n`) : chalk.green(` \u2713 ${dur}s\n`));
        break;
      }

      case "thinking":
        process.stdout.write(`  ${sky("\u25CC")} ${chalk.dim("Reasoning...")}\r`);
        break;

      case "verification_started":
        this.currentPhase = "Verifying";
        process.stdout.write(`  ${chalk.cyan("\u25CE")} ${chalk.dim("Verifying milestone...")}\n`);
        break;

      case "verification_completed": {
        const passed = data.passed ?? data.success;
        if (passed) {
          console.log(`  ${chalk.green("\u2713")} ${chalk.dim("Verification passed")}`);
        } else {
          console.log(`  ${chalk.red("\u2717")} ${chalk.dim("Verification failed")}`);
        }
        break;
      }

      case "milestone_completed": {
        const idx2 = (data.milestoneIndex as number) ?? event.progress?.completed ?? 0;
        if (this.milestones[idx2]) this.milestones[idx2].status = "completed";
        const elapsed = this.milestones[idx2]?.startedAt
          ? ((Date.now() - this.milestones[idx2].startedAt!) / 1000).toFixed(0)
          : "?";
        console.log(`  ${chalk.green("\u2713")} ${chalk.green.bold("Milestone complete")} ${chalk.dim(`(${elapsed}s)`)}`);
        break;
      }

      case "milestone_failed": {
        const idx3 = (data.milestoneIndex as number) ?? 0;
        if (this.milestones[idx3]) this.milestones[idx3].status = "failed";
        const errMsg = (data.error as string) || "unknown";
        console.log(`  ${chalk.red("\u2717")} ${chalk.red.bold("Milestone failed")}: ${chalk.dim(errMsg)}`);
        break;
      }

      case "recovering":
        this.recoveryCount++;
        console.log(`  ${chalk.yellow("\u21BB")} ${chalk.yellow("Recovery attempt")} ${chalk.dim(`#${this.recoveryCount}`)}`);
        break;

      case "approval_needed": {
        const desc = (data.description as string) || "Action requires permission";
        console.log(`  ${chalk.magenta("\u2691")} ${chalk.magenta.bold("Approval needed")}: ${desc}`);
        break;
      }

      case "completed":
        this.printCompletion();
        break;

      case "failed":
        this.printFailure(data.error as string | undefined);
        break;

      case "paused":
        console.log(`\n  ${chalk.yellow("\u23F8")} ${chalk.yellow.bold("Marathon paused")}`);
        break;

      case "resumed":
        console.log(`\n  ${chalk.green("\u25B6")} ${chalk.green.bold("Marathon resumed")}`);
        break;

      default:
        // Silently ignore unknown events
        break;
    }
  }

  /**
   * Print the marathon header
   */
  private printHeader(): void {
    const width = Math.min(process.stdout.columns || 80, 80);
    const border = chalk.dim("\u2550".repeat(width));
    console.log();
    console.log(border);
    console.log(`  ${skyBold("\u26A1 Marathon Started")}`);
    if (this.marathonGoal) {
      console.log(`  ${chalk.dim("Goal:")} ${chalk.white(this.marathonGoal)}`);
    }
    if (this.marathonId) {
      console.log(`  ${chalk.dim("ID:")} ${chalk.dim(this.marathonId.slice(0, 8))}`);
    }
    console.log(border);
  }

  /**
   * Print the milestone plan overview
   */
  private printPlan(): void {
    console.log(`\n  ${skyBold("Plan")} ${chalk.dim(`(${this.milestones.length} milestones)`)}`);
    for (const m of this.milestones) {
      const num = chalk.dim(`${m.index + 1}.`);
      console.log(`    ${num} ${m.title}`);
    }
  }

  /**
   * Print marathon completion summary
   */
  private printCompletion(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    const completed = this.milestones.filter(m => m.status === "completed").length;
    const total = this.milestones.length;
    const width = Math.min(process.stdout.columns || 80, 80);

    console.log();
    console.log(chalk.dim("\u2550".repeat(width)));
    console.log(`  ${chalk.green.bold("\u2713 Marathon Complete")}`);
    console.log(`  ${completed}/${total} milestones ${chalk.dim("\u00B7")} ${formatDuration(parseInt(elapsed))} ${chalk.dim("\u00B7")} ${this.recoveryCount} recoveries`);
    console.log(chalk.dim("\u2550".repeat(width)));
    console.log();
  }

  /**
   * Print marathon failure
   */
  private printFailure(error?: string): void {
    const width = Math.min(process.stdout.columns || 80, 80);
    console.log();
    console.log(chalk.dim("\u2550".repeat(width)));
    console.log(`  ${chalk.red.bold("\u2717 Marathon Failed")}`);
    if (error) console.log(`  ${chalk.dim(error)}`);
    const completed = this.milestones.filter(m => m.status === "completed").length;
    console.log(`  ${completed}/${this.milestones.length} milestones completed before failure`);
    console.log(chalk.dim("\u2550".repeat(width)));
    console.log();
  }

  /**
   * Get a compact one-line status string for the status bar
   */
  getStatusLine(): string {
    const completed = this.milestones.filter(m => m.status === "completed").length;
    const total = this.milestones.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bar = renderMiniBar(pct, 10);
    return `${sky("\u26A1")} ${bar} ${completed}/${total} ${chalk.dim(this.currentPhase)}`;
  }
}

function renderMiniBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return chalk.green("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(empty));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
