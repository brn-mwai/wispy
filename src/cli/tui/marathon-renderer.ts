import chalk, { type ChalkInstance } from "chalk";
import gradient from "gradient-string";
import { getTheme } from "../ui/theme.js";
import type { MarathonEvent, MarathonState, Milestone } from "../../marathon/types.js";

/**
 * CLI Marathon Progress Renderer
 *
 * Renders a live, compact progress display for marathon execution
 * directly in the terminal. Features:
 *   - Color-coded thinking levels
 *   - Gradient progress bars
 *   - Phase-aware coloring
 *   - Box-drawing milestone headers
 *   - Live thinking level indicator
 */

const sky = chalk.rgb(49, 204, 255);
const skyBold = chalk.rgb(49, 204, 255).bold;

// Thinking level colors
const LEVEL_COLORS: Record<string, ChalkInstance> = {
  none: chalk.gray,
  minimal: chalk.gray,
  low: chalk.rgb(96, 165, 250),    // blue
  medium: chalk.rgb(251, 191, 36),  // amber
  high: chalk.rgb(249, 115, 22),    // orange
  ultra: chalk.rgb(239, 68, 68),    // red
};

const LEVEL_LABELS: Record<string, string> = {
  none: "",
  minimal: "MIN",
  low: "LOW",
  medium: "MED",
  high: "HIGH",
  ultra: "ULTRA",
};

// Phase colors
const PHASE_COLORS: Record<string, ChalkInstance> = {
  Planning: chalk.rgb(167, 139, 250),   // purple
  Executing: chalk.rgb(52, 211, 153),   // green
  Verifying: chalk.rgb(96, 165, 250),   // blue
  Recovering: chalk.rgb(251, 191, 36),  // amber
};

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
  private currentThinkingLevel = "high";
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

    // Extract thinking level from plan
    const strategy = state.plan?.thinkingStrategy;
    if (strategy) {
      this.currentThinkingLevel = strategy.execution || "high";
    }
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
        const phaseColor = PHASE_COLORS[this.currentPhase] || sky;

        console.log();
        console.log(`  ${phaseColor("\u250C\u2500")} ${skyBold(`[${idx + 1}/${total}]`)} ${chalk.bold(title)}`);
        console.log(`  ${phaseColor("\u2502")} ${this.renderMiniProgress(idx, total)}`);
        console.log(`  ${phaseColor("\u2502")} ${this.renderThinkingBadge()}`);
        break;
      }

      case "tool_executing": {
        this.lastTool = (data.toolName as string) || (data.name as string) || "";
        this.lastToolTime = Date.now();
        const phaseColor = PHASE_COLORS[this.currentPhase] || sky;
        process.stdout.write(`  ${phaseColor("\u2502")} ${chalk.yellow("\u25B8")} ${chalk.dim(this.lastTool)}`);
        break;
      }

      case "tool_completed": {
        const dur = this.lastToolTime ? ((Date.now() - this.lastToolTime) / 1000).toFixed(1) : "?";
        const hasError = data.error || data.status === "error";
        process.stdout.write(hasError ? chalk.red(` \u2717 ${dur}s\n`) : chalk.green(` \u2713 ${dur}s\n`));
        break;
      }

      case "thinking": {
        const level = (data.level as string) || this.currentThinkingLevel;
        const levelColor = LEVEL_COLORS[level] || sky;
        const levelLabel = LEVEL_LABELS[level] || "";
        const phaseColor = PHASE_COLORS[this.currentPhase] || sky;
        const thinkingPreview = (data.content as string) || "";
        const preview = thinkingPreview.length > 60 ? thinkingPreview.slice(0, 57) + "..." : thinkingPreview;
        const sig = (data.signature as string) || "";
        const sigLabel = sig ? chalk.dim(` sig:${sig.slice(0, 8)}`) : "";

        if (levelLabel) {
          process.stdout.write(`  ${phaseColor("\u2502")} ${levelColor("\u25CC")} ${levelColor.bold(`[${levelLabel}]`)}${sigLabel} ${chalk.dim("Reasoning...")}`);
        } else {
          process.stdout.write(`  ${phaseColor("\u2502")} ${sky("\u25CC")}${sigLabel} ${chalk.dim("Reasoning...")}`);
        }
        if (preview) {
          process.stdout.write(chalk.dim(` ${preview}`));
        }
        process.stdout.write("\r");
        break;
      }

      case "verification_started": {
        this.currentPhase = "Verifying";
        const phaseColor = PHASE_COLORS[this.currentPhase] || sky;
        console.log(`  ${phaseColor("\u2502")} ${chalk.cyan("\u25CE")} ${chalk.cyan("Verifying")} ${this.renderThinkingBadge()}`);
        break;
      }

      case "verification_completed": {
        const passed = data.passed ?? data.success;
        const phaseColor = PHASE_COLORS[this.currentPhase] || sky;
        if (passed) {
          console.log(`  ${phaseColor("\u2502")} ${chalk.green("\u2713")} ${chalk.green("Verification passed")}`);
        } else {
          console.log(`  ${phaseColor("\u2502")} ${chalk.red("\u2717")} ${chalk.red("Verification failed")}`);
        }
        break;
      }

      case "milestone_completed": {
        const idx2 = (data.milestoneIndex as number) ?? event.progress?.completed ?? 0;
        if (this.milestones[idx2]) this.milestones[idx2].status = "completed";
        const elapsed = this.milestones[idx2]?.startedAt
          ? ((Date.now() - this.milestones[idx2].startedAt!) / 1000).toFixed(0)
          : "?";
        const phaseColor = PHASE_COLORS.Executing;
        console.log(`  ${phaseColor("\u2514\u2500")} ${chalk.green("\u2713")} ${chalk.green.bold("Complete")} ${chalk.dim(`(${elapsed}s)`)}`);
        break;
      }

      case "milestone_failed": {
        const idx3 = (data.milestoneIndex as number) ?? 0;
        if (this.milestones[idx3]) this.milestones[idx3].status = "failed";
        const errMsg = (data.error as string) || "unknown";
        console.log(`  ${chalk.red("\u2514\u2500")} ${chalk.red("\u2717")} ${chalk.red.bold("Failed")}: ${chalk.dim(errMsg)}`);
        break;
      }

      case "recovering":
        this.recoveryCount++;
        this.currentPhase = "Recovering";
        console.log(`  ${chalk.yellow("\u2502")} ${chalk.yellow("\u21BB")} ${chalk.yellow("Recovery")} ${chalk.dim(`#${this.recoveryCount}`)} ${this.renderThinkingBadge()}`);
        break;

      case "approval_needed": {
        const desc = (data.description as string) || "Action requires permission";
        console.log(`  ${chalk.magenta("\u2502")} ${chalk.magenta("\u2691")} ${chalk.magenta.bold("Approval needed")}: ${desc}`);
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
        break;
    }
  }

  /**
   * Render thinking level badge inline
   */
  private renderThinkingBadge(): string {
    const level = this.currentThinkingLevel;
    const label = LEVEL_LABELS[level];
    if (!label) return "";
    const colorFn = LEVEL_COLORS[level] || chalk.gray;
    return colorFn(`[${label}]`);
  }

  /**
   * Print phase change with coloring
   */
  private printPhaseChange(phase: string, description: string): void {
    const phaseColor = PHASE_COLORS[phase] || sky;
    console.log(`  ${phaseColor("\u25C6")} ${phaseColor.bold(phase)} ${chalk.dim(description)} ${this.renderThinkingBadge()}`);
  }

  /**
   * Render a mini progress bar for milestone position
   */
  private renderMiniProgress(current: number, total: number): string {
    if (total <= 0) return "";
    const width = Math.min(total * 3, 30);
    let bar = "";
    for (let i = 0; i < total; i++) {
      const ms = this.milestones[i];
      if (!ms) {
        bar += chalk.dim("\u2591");
        continue;
      }
      switch (ms.status) {
        case "completed": bar += chalk.green("\u2588"); break;
        case "in_progress": bar += chalk.yellow("\u2593"); break;
        case "failed": bar += chalk.red("\u2588"); break;
        default: bar += chalk.dim("\u2591"); break;
      }
    }
    const pct = total > 0 ? Math.round(((current) / total) * 100) : 0;
    return `${bar} ${chalk.dim(`${pct}%`)}`;
  }

  /**
   * Print the marathon header
   */
  private printHeader(): void {
    const width = Math.min(process.stdout.columns || 80, 80);
    const theme = getTheme();
    const g = gradient(theme.gradient);
    const levelBadge = this.renderThinkingBadge();

    console.log();
    console.log(g("\u2501".repeat(width)));
    console.log(`  ${theme.brandBold("\u26A1 Marathon Started")} ${levelBadge}`);
    if (this.marathonGoal) {
      console.log(`  ${chalk.dim("Goal:")} ${chalk.white(this.marathonGoal)}`);
    }
    if (this.marathonId) {
      console.log(`  ${chalk.dim("ID:")} ${chalk.dim(this.marathonId.slice(0, 8))}`);
    }
    if (this.milestones.length > 0) {
      console.log(`  ${chalk.dim("Milestones:")} ${chalk.white(String(this.milestones.length))}`);
    }
    console.log(g("\u2501".repeat(width)));
  }

  /**
   * Print the milestone plan overview
   */
  private printPlan(): void {
    console.log(`\n  ${skyBold("Plan")} ${chalk.dim(`(${this.milestones.length} milestones)`)}`);
    for (const m of this.milestones) {
      const num = chalk.dim(`${m.index + 1}.`);
      const statusIcon = m.status === "completed" ? chalk.green("\u2713")
        : m.status === "failed" ? chalk.red("\u2717")
        : m.status === "in_progress" ? chalk.yellow("\u25B8")
        : chalk.dim("\u25CB");
      console.log(`    ${statusIcon} ${num} ${m.title}`);
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
    const theme = getTheme();
    const g = gradient(theme.gradient);

    console.log();
    console.log(g("\u2501".repeat(width)));
    console.log(`  ${chalk.green.bold("\u2713 Marathon Complete")}`);
    console.log(`  ${chalk.green(String(completed))}${chalk.dim("/")}${chalk.white(String(total))} milestones ${chalk.dim("\u00B7")} ${formatDuration(parseInt(elapsed))} ${chalk.dim("\u00B7")} ${this.recoveryCount} recoveries`);

    // Final milestone summary
    for (const m of this.milestones) {
      const icon = m.status === "completed" ? chalk.green("\u2713") : m.status === "failed" ? chalk.red("\u2717") : chalk.dim("\u25CB");
      console.log(`    ${icon} ${m.title}`);
    }

    console.log(g("\u2501".repeat(width)));
    console.log();
  }

  /**
   * Print marathon failure
   */
  private printFailure(error?: string): void {
    const width = Math.min(process.stdout.columns || 80, 80);
    const theme = getTheme();
    const g = gradient(theme.gradient);
    console.log();
    console.log(g("\u2501".repeat(width)));
    console.log(`  ${chalk.red.bold("\u2717 Marathon Failed")}`);
    if (error) console.log(`  ${chalk.dim(error)}`);
    const completed = this.milestones.filter(m => m.status === "completed").length;
    console.log(`  ${completed}/${this.milestones.length} milestones completed before failure`);

    for (const m of this.milestones) {
      const icon = m.status === "completed" ? chalk.green("\u2713") : m.status === "failed" ? chalk.red("\u2717") : chalk.dim("\u25CB");
      console.log(`    ${icon} ${m.title}`);
    }

    console.log(g("\u2501".repeat(width)));
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
    const phaseColor = PHASE_COLORS[this.currentPhase] || sky;
    const levelBadge = this.renderThinkingBadge();
    return `${sky("\u26A1")} ${bar} ${completed}/${total} ${phaseColor(this.currentPhase)} ${levelBadge}`;
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
