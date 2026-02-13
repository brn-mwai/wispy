/**
 * Persistent bottom status bar showing live session stats.
 *
 * Format:
 *  ── gradient line ──
 *  ● Tokens: 1,234 ($0.02)  │  Memory: active  │  Session: main  │  Context: ████░░░░░░ 12%
 */

import chalk from "chalk";
import gradient from "gradient-string";
import { getTheme } from "../ui/theme.js";
import { screen } from "./screen.js";
import type { LayoutRegions } from "./layout.js";

export interface StatusBarState {
  tokens: number;
  cost: number;
  memory: string;        // "active" | "inactive"
  session: string;       // session name
  contextPercent: number; // 0-100
}

export class StatusBar {
  private layout: LayoutRegions;
  private state: StatusBarState = {
    tokens: 0,
    cost: 0,
    memory: "inactive",
    session: "main",
    contextPercent: 0,
  };

  constructor(layout: LayoutRegions) {
    this.layout = layout;
  }

  setState(partial: Partial<StatusBarState>): void {
    Object.assign(this.state, partial);
  }

  updateLayout(layout: LayoutRegions): void {
    this.layout = layout;
  }

  render(): void {
    const { width } = this.layout;
    const theme = getTheme();
    const { tokens, cost, memory, session, contextPercent } = this.state;

    // Thin gradient separator above the bar
    const g = gradient(theme.gradientAccent);
    process.stdout.write(g("\u2500".repeat(width)) + "\n");

    const formattedTokens = tokens.toLocaleString("en-US");
    const formattedCost = `$${cost.toFixed(2)}`;

    // Mini context progress bar
    const ctxBarWidth = 10;
    const ctxFilled = Math.round((contextPercent / 100) * ctxBarWidth);
    const ctxEmpty = ctxBarWidth - ctxFilled;
    const ctxBar =
      chalk.green("\u2588".repeat(ctxFilled)) +
      chalk.dim("\u2591".repeat(ctxEmpty));

    // Colored memory status
    const memoryDisplay =
      memory === "active" ? chalk.green(memory) : chalk.dim(memory);

    const parts = [
      `${theme.accent("\u25CF")} Tokens: ${formattedTokens} (${formattedCost})`,
      `Memory: ${memoryDisplay}`,
      `Session: ${session}`,
      `Context: ${ctxBar} ${contextPercent}%`,
    ];

    const inner = " " + parts.join("  \u2502  ") + " ";

    const bg = theme.statusBarBg;
    const fg = theme.statusBarFg;
    const style = (s: string): string => bg(fg(s));

    const padded =
      inner.length < width
        ? inner + " ".repeat(width - inner.length)
        : inner.slice(0, width);

    process.stdout.write(style(padded) + "\n");
  }
}
