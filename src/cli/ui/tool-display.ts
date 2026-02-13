import chalk from "chalk";
import { t } from "./theme.js";

export interface ToolCallDisplay {
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "ok" | "error";
  result?: string;
  durationMs?: number;
}

function humanizeName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

/**
 * Format a tool call with tree-style connectors.
 *
 * Pending:
 *   \u2B24 Read File
 *     \u251C\u2500 path: src/index.ts
 *     \u2570\u2500 limit: 100
 *
 * Success:
 *   \u25CF Read File
 *     \u251C\u2500 path: src/index.ts
 *     \u2714 Done (0.3s)
 *     \u2570\u2500 45 lines read
 *
 * Error:
 *   \u25CF Write File
 *     \u251C\u2500 path: src/output.ts
 *     \u2718 Error (1.2s)
 *     \u2570\u2500 Permission denied
 */
export function formatToolCall(tc: ToolCallDisplay): string {
  const lines: string[] = [];
  const displayName = humanizeName(tc.name);

  // Status-aware header icon
  const icon =
    tc.status === "pending"
      ? t.accent("\u23FA")
      : tc.status === "ok"
        ? chalk.green("\u25CF")
        : chalk.red("\u25CF");

  lines.push(`  ${icon} ${chalk.bold.white(displayName)}`);

  // Args with tree connectors
  const entries = Object.entries(tc.args);
  const maxShow = 3;
  const showCount = Math.min(entries.length, maxShow);

  for (let i = 0; i < showCount; i++) {
    const [key, val] = entries[i];
    const valStr = typeof val === "string" ? val : JSON.stringify(val);
    const isLast = i === showCount - 1 && tc.status === "pending" && entries.length <= maxShow;
    const connector = isLast ? "\u2570\u2500" : "\u251C\u2500";
    lines.push(`    ${chalk.dim(connector)} ${chalk.dim(key + ":")} ${truncate(valStr, 75)}`);
  }
  if (entries.length > maxShow) {
    lines.push(chalk.dim(`    \u2502  ... +${entries.length - maxShow} more`));
  }

  // Duration
  const duration = tc.durationMs ? `${(tc.durationMs / 1000).toFixed(1)}s` : "";

  // Result
  if (tc.status === "ok") {
    lines.push(`    ${chalk.green("\u2714")} ${chalk.green("Done")} ${chalk.dim(duration)}`);
    if (tc.result) {
      const preview = truncate(tc.result.trim().split("\n")[0], 120);
      lines.push(`    ${chalk.dim("\u2570\u2500")} ${chalk.dim(preview)}`);
    }
  } else if (tc.status === "error") {
    lines.push(`    ${chalk.red("\u2718")} ${chalk.red("Error")} ${chalk.dim(duration)}`);
    if (tc.result) {
      const preview = truncate(tc.result.trim().split("\n")[0], 120);
      lines.push(`    ${chalk.dim("\u2570\u2500")} ${chalk.red.dim(preview)}`);
    }
  }

  return lines.join("\n");
}
