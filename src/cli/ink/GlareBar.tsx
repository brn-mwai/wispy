/**
 * GlareBar - Animated glare/shimmer sweep component.
 *
 * Renders a full-width bar with a bright spot that sweeps
 * left to right continuously. Used above ThinkingSpinner
 * and ThoughtSignature to indicate active processing.
 *
 *   ░░░░░░▒▓█▓▒░░░░░░░░░░░░░░░░░░░░░░░░
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

// Block characters from dim to bright
const BLOCKS = [" ", "\u2591", "\u2592", "\u2593", "\u2588"];

interface GlareBarProps {
  width?: number;
  color?: string;
  speed?: number;
}

/**
 * Compute brightness (0-4) for a position relative to the hotspot.
 * Produces a gaussian-like falloff around the hotspot.
 */
function brightness(pos: number, hotspot: number, barWidth: number): number {
  // Wrap-aware distance
  const rawDist = Math.abs(pos - hotspot);
  const dist = Math.min(rawDist, barWidth - rawDist);

  if (dist === 0) return 4;
  if (dist === 1) return 3;
  if (dist === 2) return 2;
  if (dist <= 4) return 1;
  return 0;
}

export function GlareBar({ width, color, speed = 40 }: GlareBarProps) {
  const barWidth = width || process.stdout.columns || 80;
  const [hotspot, setHotspot] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setHotspot((h) => (h + 1) % barWidth);
    }, speed);
    return () => clearInterval(t);
  }, [barWidth, speed]);

  // Build the bar string
  const chars: string[] = [];
  for (let i = 0; i < barWidth; i++) {
    const b = brightness(i, hotspot, barWidth);
    chars.push(BLOCKS[b]);
  }

  return (
    <Box marginLeft={2}>
      <Text color={color || "#31CCFF"}>{chars.join("")}</Text>
    </Box>
  );
}
