/**
 * Tool call & result display - Ink components.
 *
 * Call:
 *   ⏺ Read File
 *     ├─ path: src/index.ts
 *     ╰─ limit: 100
 *
 * Result:
 *     ✓ Done (0.3s)
 *     ⎿ 45 lines read
 */

import React from "react";
import { Box, Text } from "ink";
import { getTheme } from "../ui/theme.js";
import type { ToolCallData, ToolResultData } from "./types.js";

function humanize(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

export function ToolCall({ data }: { data: ToolCallData }) {
  const color = getTheme().primaryHex;
  const name = humanize(data.name);
  const entries = Object.entries(data.args).slice(0, 3);
  const extra = Object.keys(data.args).length - entries.length;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text>
        <Text color={color}>{"\u23FA"} </Text>
        <Text bold>{name}</Text>
      </Text>
      {entries.map(([key, val], i) => {
        const v = typeof val === "string" ? val : JSON.stringify(val);
        const last = i === entries.length - 1 && extra <= 0;
        return (
          <Text key={key}>
            <Text dimColor>{"  "}{last ? "\u2570\u2500" : "\u251C\u2500"} </Text>
            <Text color="#FFB74D">{key}</Text>
            <Text dimColor>: {truncate(v, 75)}</Text>
          </Text>
        );
      })}
      {extra > 0 && (
        <Text dimColor>
          {"  "}{"\u2502"}{"  "}... +{extra} more
        </Text>
      )}
    </Box>
  );
}

export function ToolResult({ data }: { data: ToolResultData }) {
  const dur = `(${(data.durationMs / 1000).toFixed(1)}s)`;
  const lines = data.result
    ? data.result.trim().split("\n").slice(0, 4)
    : [];
  const firstLine = lines[0] ? truncate(lines[0], 200) : "";
  const extraLines = lines.slice(1).map((l) => truncate(l, 200));

  return (
    <Box flexDirection="column" marginLeft={2}>
      {data.isError ? (
        <Text>
          <Text color="red">{"  "}{"\u2717"} Error </Text>
          <Text dimColor>{dur}</Text>
        </Text>
      ) : (
        <Text>
          <Text color="green">{"  "}{"\u2713"} Done </Text>
          <Text dimColor>{dur}</Text>
        </Text>
      )}
      {firstLine ? (
        <Text>
          {"  "}
          <Text dimColor>{"\u23BF"} </Text>
          {data.isError ? (
            <Text color="red" dimColor>
              {firstLine}
            </Text>
          ) : (
            <Text dimColor>{firstLine}</Text>
          )}
        </Text>
      ) : null}
      {extraLines.map((line, i) => (
        <Text key={i}>
          {"    "}
          {data.isError ? (
            <Text color="red" dimColor>{line}</Text>
          ) : (
            <Text dimColor>{line}</Text>
          )}
        </Text>
      ))}
    </Box>
  );
}
