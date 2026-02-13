/**
 * Animated thinking spinner - Ink component.
 *
 * Features:
 *   - Braille-style smooth spinner
 *   - Wave dots animation
 *   - Cycling phrases: Thinking, Reasoning, etc.
 *   - Elapsed time display with color coding
 *
 *   ⠹ Reasoning... (2.3s)
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
  "Crafting",
  "Composing",
  "Synthesizing",
];

// Braille spinner frames for smooth rotation
const BRAILLE = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

// Wave animation
const WAVE = ["    ", ".   ", "..  ", "... ", "....", " ...", "  ..", "   ."];

interface ThinkingSpinnerProps {
  elapsed: number;
}

export function ThinkingSpinner({ elapsed }: ThinkingSpinnerProps) {
  const theme = getTheme();
  const [frame, setFrame] = useState(0);
  const [phrase, setPhrase] = useState(
    () => Math.floor(Math.random() * PHRASES.length),
  );
  const [dots, setDots] = useState(0);

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
      2000,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setDots((d) => (d + 1) % WAVE.length),
      150,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <Box marginLeft={2}>
      <Text color={theme.accentHex || theme.primaryHex}>{BRAILLE[frame]} </Text>
      <Text color={theme.primaryHex}>{PHRASES[phrase]}</Text>
      <Text dimColor>{WAVE[dots]}</Text>
      <Text color="#FF7F50"> {elapsed.toFixed(1)}s</Text>
    </Box>
  );
}
