/**
 * Gradient separator line - Ink component.
 */

import React from "react";
import { Text } from "ink";
import gradient from "gradient-string";
import { getTheme } from "../ui/theme.js";

export function Separator() {
  const width = Math.min(process.stdout.columns || 80, 120);
  const theme = getTheme();
  const line = gradient(theme.gradientAccent)("\u2500".repeat(width));
  return <Text>{line}</Text>;
}
