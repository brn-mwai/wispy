import { t } from "./theme.js";

export interface ToolCallDisplay {
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "ok" | "error";
  result?: string;
  durationMs?: number;
}

export function formatToolCall(tc: ToolCallDisplay): string {
  const icon = tc.status === "ok" ? t.toolOk : tc.status === "error" ? t.toolFail : t.toolPending;
  const argsStr = Object.entries(tc.args)
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${t.dim(val.length > 40 ? val.slice(0, 37) + "..." : val)}`;
    })
    .join(", ");

  const duration = tc.durationMs ? t.dim(` (${(tc.durationMs / 1000).toFixed(1)}s)`) : "";
  const lines = [`  ${t.tool("▸ " + tc.name)}(${argsStr})`];
  lines.push(`  ├─ ${icon}${duration}`);

  if (tc.result && tc.status === "ok") {
    const preview = tc.result.length > 100 ? tc.result.slice(0, 97) + "..." : tc.result;
    lines.push(`  │  ${t.dim(preview)}`);
  }

  return lines.join("\n");
}
