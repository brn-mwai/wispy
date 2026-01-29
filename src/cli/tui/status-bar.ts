/**
 * Persistent bottom status bar showing live session stats.
 *
 * Format:
 *  ● Tokens: 1,234 ($0.02) │ Memory: active │ Session: main │ Context: 12%
 */

import chalk from "chalk";
import { screen } from "./screen.js";
import type { LayoutRegions } from "./layout.js";

export interface StatusBarState {
  tokens: number;
  cost: number;
  memory: string;        // "active" | "inactive"
  session: string;       // session name
  contextPercent: number; // 0-100
}

const bg = chalk.bgRgb(30, 35, 50);
const fg = chalk.rgb(180, 190, 210);
const style = (s: string): string => bg(fg(s));

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
    const { statusRow, width } = this.layout;
    const { tokens, cost, memory, session, contextPercent } = this.state;

    const formattedTokens = tokens.toLocaleString("en-US");
    const formattedCost = `$${cost.toFixed(2)}`;

    const parts = [
      ` ● Tokens: ${formattedTokens} (${formattedCost})`,
      `Memory: ${memory}`,
      `Session: ${session}`,
      `Context: ${contextPercent}%`,
    ];

    const inner = parts.join(" │ ") + " ";

    // Pad or truncate to fill the full terminal width
    const padded = inner.length < width
      ? inner + " ".repeat(width - inner.length)
      : inner.slice(0, width);

    screen.moveTo(statusRow, 1);
    screen.write(style(padded));
  }
}
