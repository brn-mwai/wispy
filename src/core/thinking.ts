import type { ThinkingLevel } from "../ai/gemini.js";

// Determine thinking level based on task complexity signals
export function inferThinkingLevel(userMessage: string): ThinkingLevel {
  const lower = userMessage.toLowerCase();

  // High: complex reasoning, planning, analysis
  if (
    lower.includes("plan") ||
    lower.includes("analyze") ||
    lower.includes("design") ||
    lower.includes("architect") ||
    lower.includes("strategy") ||
    lower.includes("compare") ||
    lower.includes("explain why") ||
    lower.includes("debug") ||
    lower.length > 500
  ) {
    return "high";
  }

  // Low: simple questions
  if (
    lower.length < 50 ||
    lower.startsWith("hi") ||
    lower.startsWith("hello") ||
    lower.startsWith("thanks") ||
    lower.includes("what time") ||
    lower.includes("how are you")
  ) {
    return "minimal";
  }

  return "medium";
}
