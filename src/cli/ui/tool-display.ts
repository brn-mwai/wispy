import chalk from "chalk";
import { t } from "./theme.js";

export interface ToolCallDisplay {
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "ok" | "error";
  result?: string;
  durationMs?: number;
}

/**
 * Humanize a snake_case or camelCase tool name to Title Case.
 */
function humanizeName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Truncate a string to `max` characters with ellipsis.
 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

/**
 * Format a tool call invocation line — Claude Code style.
 *
 * Pending (tool just invoked):
 *   ⏺ Read File
 *     path: src/index.ts
 *
 * Success (tool returned):
 *   ⏺ Read File
 *     path: src/index.ts
 *     ✓ Done (0.3s)
 *     ╰─ 45 lines read
 *
 * Error (tool failed):
 *   ⏺ Write File
 *     path: src/output.ts
 *     content: "export function..." (truncated)
 *     ✗ Error (1.2s)
 *     ╰─ Permission denied
 */
export function formatToolCall(tc: ToolCallDisplay): string {
  const lines: string[] = [];
  const displayName = humanizeName(tc.name);

  // Tool header
  if (tc.status === "pending") {
    lines.push(`  ${t.accent("⏺")} ${chalk.bold.white(displayName)}`);
  } else if (tc.status === "ok") {
    lines.push(`  ${chalk.green("⏺")} ${chalk.bold.white(displayName)}`);
  } else {
    lines.push(`  ${chalk.red("⏺")} ${chalk.bold.white(displayName)}`);
  }

  // Args (show up to 3)
  const entries = Object.entries(tc.args);
  const maxShow = 3;
  for (let i = 0; i < Math.min(entries.length, maxShow); i++) {
    const [key, val] = entries[i];
    const valStr = typeof val === "string" ? val : JSON.stringify(val);
    lines.push(`    ${chalk.dim(key + ":")} ${truncate(valStr, 80)}`);
  }
  if (entries.length > maxShow) {
    lines.push(chalk.dim(`    ... +${entries.length - maxShow} more`));
  }

  // Duration badge
  const duration = tc.durationMs ? `(${(tc.durationMs / 1000).toFixed(1)}s)` : "";

  // Result line
  if (tc.status === "ok") {
    lines.push(`    ${chalk.green("✓")} ${chalk.green("Done")} ${chalk.dim(duration)}`);
    if (tc.result) {
      const preview = truncate(tc.result.trim().split("\n")[0], 120);
      lines.push(`    ${chalk.dim("╰─")} ${chalk.dim(preview)}`);
    }
  } else if (tc.status === "error") {
    lines.push(`    ${chalk.red("✗")} ${chalk.red("Error")} ${chalk.dim(duration)}`);
    if (tc.result) {
      const preview = truncate(tc.result.trim().split("\n")[0], 120);
      lines.push(`    ${chalk.dim("╰─")} ${chalk.dim(preview)}`);
    }
  }

  return lines.join("\n");
}
