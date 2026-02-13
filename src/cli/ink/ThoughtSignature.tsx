/**
 * ThoughtSignature - Prominent thinking content display.
 *
 * Shows LLM reasoning with:
 *   - GlareBar at the top (animated sweep in thinking level color)
 *   - Header: signature hash, thinking level badge, character count
 *   - 5-6 meaningful lines of thinking content
 *   - Hidden line count summary
 *
 *   ░░░░▒▓█▓▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 *   \u27E1 Thought Signature \u00B7 sig:a3f8b2c1 \u00B7 [HIGH] \u00B7 2,340 chars
 *   \u2502 Considering the weather data and market conditions...
 *   \u2502 The user needs real-time analysis of 3 data sources
 *   \u2502 I should chain web_search -> run_python -> memory_save
 *   \u2502 Risk assessment: low - all operations are read-only
 *   \u2502 Proceeding with 4-tool chain for comprehensive results
 *   \u2514 +12 more lines
 */

import React from "react";
import { Box, Text } from "ink";
import { getTheme } from "../ui/theme.js";
import { GlareBar } from "./GlareBar.js";

type ThinkingLevel = "none" | "minimal" | "low" | "medium" | "high" | "ultra";

const LEVEL_LABELS: Record<string, string> = {
  none: "",
  minimal: "MIN",
  low: "LOW",
  medium: "MED",
  high: "HIGH",
  ultra: "ULTRA",
};

interface ThoughtSignatureProps {
  text: string;
  signature?: string;
  thinkingLevel?: string;
  compact?: boolean;
}

/** Filter and extract meaningful lines from thinking text */
function extractLines(text: string, maxLines: number): { lines: string[]; hidden: number } {
  const allLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 10);
  const lines = allLines.slice(0, maxLines).map((l) =>
    l.length > 100 ? l.slice(0, 97) + "..." : l
  );
  const hidden = Math.max(0, allLines.length - maxLines);
  return { lines, hidden };
}

export function ThoughtSignature({ text, signature, thinkingLevel, compact }: ThoughtSignatureProps) {
  const theme = getTheme();
  const level = (thinkingLevel || "high") as ThinkingLevel;
  const levelLabel = LEVEL_LABELS[level] || "";
  const levelColor = theme.thinkingLevelHex?.[level] || theme.accentHex || "#F97316";
  const maxLines = compact ? 3 : 6;
  const { lines, hidden } = extractLines(text, maxLines);
  const sigLabel = signature ? `sig:${signature.slice(0, 8)}` : "";
  const charCount = text.length.toLocaleString();

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1} marginBottom={1}>
      {/* Animated glare bar */}
      <GlareBar color={levelColor} speed={45} />

      {/* Header line */}
      <Box marginLeft={0} marginTop={0}>
        <Text color={levelColor} bold>{"\u27E1"} Thought Signature</Text>
        {sigLabel && (
          <Text color="#6B7280"> {"\u00B7"} </Text>
        )}
        {sigLabel && (
          <Text color="#8B8B8B">{sigLabel}</Text>
        )}
        {levelLabel && (
          <Text color="#6B7280"> {"\u00B7"} </Text>
        )}
        {levelLabel && (
          <Text color={levelColor} bold>[{levelLabel}]</Text>
        )}
        <Text color="#6B7280"> {"\u00B7"} </Text>
        <Text color="#8B8B8B">{charCount} chars</Text>
      </Box>

      {/* Thinking content lines */}
      {lines.map((line, i) => (
        <Box key={i} marginLeft={0}>
          <Text color={levelColor}>{"\u2502"} </Text>
          <Text color="#A0A0A0" italic>{line}</Text>
        </Box>
      ))}

      {/* Hidden line count */}
      {hidden > 0 && (
        <Box marginLeft={0}>
          <Text color={levelColor}>{"\u2514"} </Text>
          <Text color="#6B7280">+{hidden} more lines</Text>
        </Box>
      )}
      {hidden === 0 && lines.length > 0 && (
        <Box marginLeft={0}>
          <Text color={levelColor}>{"\u2514"}</Text>
        </Box>
      )}
    </Box>
  );
}
