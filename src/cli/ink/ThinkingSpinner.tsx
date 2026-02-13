/**
 * Animated thinking spinner - Ink component.
 *
 * Features:
 *   - Braille-style smooth spinner with theme colors
 *   - Thinking level badge with color coding
 *   - Cycling action phrases
 *   - Color-coded elapsed time (green -> yellow -> orange)
 *   - Level-aware pulse speed (faster pulse = deeper thinking)
 *   - Preview of current thinking content
 *   - Optional mode label (marathon, x402, background)
 *
 *   ⠹ Reasoning  [HIGH]  ░▒▓█ 3.2s
 *     │ Considering the weather data and market conditions...
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { getTheme } from "../ui/theme.js";

const PHRASES = [
  "Thinking",
  "Reasoning",
  "Analyzing",
  "Processing",
  "Evaluating",
  "Planning",
  "Composing",
  "Synthesizing",
];

// Braille spinner frames for smooth rotation
const BRAILLE = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

// Block-bar pulse animations at different intensities
const PULSE_SLOW = [
  "\u2591\u2591\u2591\u2591",
  "\u2592\u2591\u2591\u2591",
  "\u2593\u2592\u2591\u2591",
  "\u2588\u2593\u2592\u2591",
  "\u2591\u2588\u2593\u2592",
  "\u2591\u2591\u2588\u2593",
  "\u2591\u2591\u2591\u2588",
  "\u2591\u2591\u2591\u2591",
];

const PULSE_FAST = [
  "\u2591\u2592\u2593\u2588",
  "\u2592\u2593\u2588\u2593",
  "\u2593\u2588\u2593\u2592",
  "\u2588\u2593\u2592\u2591",
  "\u2593\u2592\u2591\u2592",
  "\u2592\u2591\u2592\u2593",
  "\u2591\u2592\u2593\u2588",
  "\u2592\u2593\u2588\u2588",
];

const PULSE_ULTRA = [
  "\u2588\u2593\u2588\u2593",
  "\u2593\u2588\u2593\u2588",
  "\u2588\u2588\u2593\u2588",
  "\u2593\u2588\u2588\u2593",
  "\u2588\u2593\u2593\u2588",
  "\u2593\u2593\u2588\u2588",
  "\u2588\u2588\u2588\u2593",
  "\u2593\u2588\u2588\u2588",
];

/** Thinking level type */
type ThinkingLevel = "none" | "minimal" | "low" | "medium" | "high" | "ultra";

interface ThinkingSpinnerProps {
  elapsed: number;
  thinkingText?: string;
  thinkingLevel?: ThinkingLevel;
  mode?: string; // "marathon" | "x402" | "background" | undefined
}

/** Get color for elapsed time: green < 5s, yellow 5-15s, orange > 15s */
function getTimeColor(elapsed: number): string {
  if (elapsed < 5) return "#4CAF50";
  if (elapsed < 15) return "#FFB74D";
  return "#FF7F50";
}

/** Get pulse frames and speed based on thinking level */
function getPulseConfig(level: ThinkingLevel): { frames: string[]; speed: number } {
  switch (level) {
    case "none":
    case "minimal":
      return { frames: PULSE_SLOW, speed: 180 };
    case "low":
      return { frames: PULSE_SLOW, speed: 140 };
    case "medium":
      return { frames: PULSE_FAST, speed: 120 };
    case "high":
      return { frames: PULSE_FAST, speed: 90 };
    case "ultra":
      return { frames: PULSE_ULTRA, speed: 60 };
    default:
      return { frames: PULSE_SLOW, speed: 120 };
  }
}

/** Level badge text */
function getLevelBadge(level: ThinkingLevel): string {
  switch (level) {
    case "minimal": return "MIN";
    case "low": return "LOW";
    case "medium": return "MED";
    case "high": return "HIGH";
    case "ultra": return "ULTRA";
    default: return "";
  }
}

/** Mode icon */
function getModeIcon(mode?: string): string {
  switch (mode) {
    case "marathon": return "\u26A1";
    case "x402": return "\uD83D\uDCB3";
    case "background": return "\u25C9";
    default: return "";
  }
}

/** Extract a meaningful preview line from thinking text */
function getPreviewLine(text: string): string {
  if (!text) return "";
  const lines = text.split("\n").filter((l) => l.trim().length > 10);
  const line = lines[lines.length - 1] || "";
  if (line.length > 80) return line.slice(0, 77) + "...";
  return line;
}

export function ThinkingSpinner({ elapsed, thinkingText, thinkingLevel, mode }: ThinkingSpinnerProps) {
  const theme = getTheme();
  const level = thinkingLevel || "medium";
  const pulseConfig = getPulseConfig(level);

  const [frame, setFrame] = useState(0);
  const [phrase, setPhrase] = useState(
    () => Math.floor(Math.random() * PHRASES.length),
  );
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setFrame((f) => (f + 1) % BRAILLE.length),
      80,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setPhrase((p) => (p + 1) % PHRASES.length),
      2200,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setPulse((p) => (p + 1) % pulseConfig.frames.length),
      pulseConfig.speed,
    );
    return () => clearInterval(t);
  }, [pulseConfig.speed, pulseConfig.frames.length]);

  const preview = getPreviewLine(thinkingText || "");
  const timeColor = getTimeColor(elapsed);
  const levelBadge = getLevelBadge(level);
  const levelColor = theme.thinkingLevelHex?.[level] || theme.accentHex;
  const modeIcon = getModeIcon(mode);

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      {/* Main spinner line */}
      <Box>
        <Text color={theme.accentHex || theme.primaryHex}>{BRAILLE[frame]} </Text>
        <Text color={theme.primaryHex} bold>{PHRASES[phrase]}</Text>
        {/* Thinking level badge */}
        {levelBadge && (
          <Text>  </Text>
        )}
        {levelBadge && (
          <Text color={levelColor} bold>[{levelBadge}]</Text>
        )}
        {/* Mode icon */}
        {modeIcon && (
          <Text color={theme.dimHex || "#555"}> {modeIcon}</Text>
        )}
        {/* Pulse bar */}
        <Text color={levelColor}>  {pulseConfig.frames[pulse]}</Text>
        {/* Elapsed time */}
        <Text color={timeColor}> {elapsed.toFixed(1)}s</Text>
      </Box>

      {/* Thinking preview line */}
      {preview && (
        <Box marginLeft={2}>
          <Text dimColor>{"\u2502"} </Text>
          <Text color="#8B8B8B" italic>{preview}</Text>
        </Box>
      )}
    </Box>
  );
}
