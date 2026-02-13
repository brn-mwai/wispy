/**
 * Persistent stats bar -- Ink component.
 *
 * Shown above the input prompt (below separator):
 *   2.5 Pro · 234 tokens · $0.0012 · ██░░░░░░░░ 2% · 3.2s [Vertex]
 */

import React from "react";
import { Text } from "ink";
import { getTheme } from "../ui/theme.js";
import type { StatsData } from "./types.js";

export function StatsLine({ data }: { data: StatsData }) {
  const theme = getTheme();

  // Mini context progress bar
  const barWidth = 10;
  const filled = Math.min(barWidth, Math.round((data.contextPercent / 100) * barWidth));
  const empty = barWidth - filled;
  const barFilled = "\u2588".repeat(filled);
  const barEmpty = "\u2591".repeat(empty);

  return (
    <Text>
      {"  "}
      <Text color="#7B61FF">{data.model}</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="#FFB74D">{data.tokens.toLocaleString()} tk</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="#4CAF50">${data.cost.toFixed(4)}</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="green">{barFilled}</Text>
      <Text dimColor>{barEmpty} {data.contextPercent}%</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="#FF7F50">{data.elapsed}s</Text>
      {data.mode && data.mode !== "chat" && (
        <>
          <Text dimColor> {"\u00b7"} </Text>
          <Text color="yellow">[{data.mode}]</Text>
        </>
      )}
      {data.backend && (
        <>
          <Text dimColor> {"\u00b7"} </Text>
          <Text color="green">[{data.backend}]</Text>
        </>
      )}
    </Text>
  );
}
