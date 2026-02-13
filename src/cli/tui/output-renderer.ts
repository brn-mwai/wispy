/**
 * Centralized output renderer for the Wispy CLI.
 *
 * Handles markdown rendering, tool call formatting, thinking display,
 * stats lines, and separators — producing Claude Code-style structured output.
 */

import chalk from "chalk";
import gradient from "gradient-string";
import { Marked } from "marked";
import * as _mt from "marked-terminal";
const markedTerminal = (_mt as any).markedTerminal ?? (_mt as any).default;
import { getTheme, t } from "../ui/theme.js";

// ── Markdown renderer ────────────────────────────────────────────

const marked = new Marked();
marked.use(
  markedTerminal({
    reflowText: true,
    width: Math.min((process.stdout.columns || 80) - 4, 120),
    tab: 2,
    code: chalk.bgRgb(30, 30, 30).white,
    codespan: chalk.bgRgb(40, 40, 40).white,
    blockquote: chalk.dim.italic,
    link: chalk.cyan.underline,
    href: chalk.cyan.underline,
    strong: chalk.bold,
    em: chalk.italic,
    del: chalk.dim.strikethrough,
    heading: chalk.bold.white,
    listitem: chalk.white,
    table: chalk.white,
    paragraph: chalk.white,
  }) as any,
);

// ── Types ────────────────────────────────────────────────────────

export interface ResponseStats {
  model: string;
  tokens: number;
  cost: number;
  contextPercent: number;
  elapsed: string;
  mode?: string;
  backend?: string;
}

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultInfo {
  name: string;
  result: string;
  durationMs: number;
  isError: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

function humanizeToolName(snakeName: string): string {
  return snakeName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

// ── OutputRenderer ───────────────────────────────────────────────

export class OutputRenderer {
  /**
   * Render markdown-formatted response text.
   */
  renderText(text: string): void {
    const rendered = marked.parse(text) as string;
    // Indent each line by 2 spaces for alignment
    const indented = rendered
      .split("\n")
      .map((line) => "  " + line)
      .join("\n");
    process.stdout.write(indented);
  }

  /**
   * Render raw text streamed chunk-by-chunk (no markdown parsing).
   * Used during streaming when we accumulate text and render markdown at the end.
   */
  renderTextChunk(text: string): void {
    process.stdout.write(text);
  }

  /**
   * Render a tool call invocation — Claude Code style.
   *
   * Format:
   *   ⏺ Read File
   *     path: src/index.ts
   */
  renderToolCall(info: ToolCallInfo): void {
    const name = humanizeToolName(info.name);
    console.log(`\n  ${t.accent("⏺")} ${chalk.bold.white(name)}`);

    const entries = Object.entries(info.args);
    const maxShow = 3;
    for (let i = 0; i < Math.min(entries.length, maxShow); i++) {
      const [key, val] = entries[i];
      const valStr = typeof val === "string" ? val : JSON.stringify(val);
      console.log(`    ${chalk.dim(key + ":")} ${truncate(valStr, 80)}`);
    }
    if (entries.length > maxShow) {
      console.log(chalk.dim(`    ... +${entries.length - maxShow} more`));
    }
  }

  /**
   * Render a tool result — success or error with duration.
   *
   * Format:
   *     ✓ Done (0.3s)
   *     ╰─ 45 lines read
   *
   *     ✗ Error (1.2s)
   *     ╰─ Permission denied
   */
  renderToolResult(info: ToolResultInfo): void {
    const duration = `(${(info.durationMs / 1000).toFixed(1)}s)`;

    if (info.isError) {
      console.log(`    ${chalk.red("✗")} ${chalk.red("Error")} ${chalk.dim(duration)}`);
    } else {
      console.log(`    ${chalk.green("✓")} ${chalk.green("Done")} ${chalk.dim(duration)}`);
    }

    if (info.result) {
      const preview = truncate(info.result.trim().split("\n")[0], 120);
      console.log(`    ${chalk.dim("╰─")} ${chalk.dim(preview)}`);
    }
  }

  /**
   * Render thinking indicator.
   */
  renderThinking(text?: string): void {
    if (text) {
      const preview = truncate(text, 60);
      process.stdout.write(`\n  ${t.thinking("◆")} ${chalk.dim("Thinking...")} ${chalk.dim(preview)}`);
    } else {
      process.stdout.write(`\n  ${t.thinking("◆")} ${chalk.dim("Thinking...")}`);
    }
  }

  /**
   * Render a gradient-colored separator line.
   */
  renderSeparator(): void {
    const width = Math.min(process.stdout.columns || 80, 120);
    const theme = getTheme();
    const g = gradient(theme.gradientAccent);
    console.log(g("\u2500".repeat(width)));
  }

  /**
   * Render a heavy gradient separator for major sections.
   */
  renderHeavySeparator(): void {
    const width = Math.min(process.stdout.columns || 80, 120);
    const theme = getTheme();
    const g = gradient(theme.gradient);
    console.log(g("\u2501".repeat(width)));
  }

  /**
   * Render response stats as a right-aligned hints bar.
   *
   * Format:
   *  ctrl+c cancel                  2.5 Pro · 234 tk · $0.0012 · ██░░░░░░░░ 2% · 3.2s · [Vertex]
   */
  renderStats(stats: ResponseStats): void {
    const cols = process.stdout.columns || 80;
    const left = " ctrl+c cancel";

    // Mini context progress bar (plain text for length calc)
    const barWidth = 10;
    const filled = Math.min(barWidth, Math.round((stats.contextPercent / 100) * barWidth));
    const empty = barWidth - filled;
    const barPlain = "\u2588".repeat(filled) + "\u2591".repeat(empty);

    const rightParts = [
      stats.model,
      `${stats.tokens.toLocaleString()} tk`,
      `$${stats.cost.toFixed(4)}`,
      `${barPlain} ${stats.contextPercent}%`,
      `${stats.elapsed}s`,
    ];

    if (stats.mode && stats.mode !== "chat") {
      rightParts.push(`[${stats.mode}]`);
    }
    if (stats.backend) {
      rightParts.push(`[${stats.backend}]`);
    }

    const rightPlain = rightParts.join(" \u00b7 ");
    const gap = Math.max(1, cols - left.length - rightPlain.length);

    // Build colored version
    const barColored = chalk.green("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(empty));
    const coloredParts = [
      stats.model,
      `${stats.tokens.toLocaleString()} tk`,
      `$${stats.cost.toFixed(4)}`,
      `${barColored} ${stats.contextPercent}%`,
      `${stats.elapsed}s`,
    ];

    if (stats.mode && stats.mode !== "chat") {
      coloredParts.push(chalk.yellow(`[${stats.mode}]`));
    }
    if (stats.backend) {
      coloredParts.push(chalk.green(`[${stats.backend}]`));
    }

    console.log(chalk.dim(left) + " ".repeat(gap) + chalk.dim(coloredParts.join(" \u00b7 ")));
  }
}
