import type { ThinkingLevel } from "../ai/gemini.js";

/**
 * THINKING LEVELS - Maximize Gemini 2.5's reasoning capabilities
 *
 * Gemini 2.5 Pro/Flash support extended thinking with thought signatures.
 * We dynamically infer the optimal thinking level based on task complexity.
 *
 * Levels:
 * - minimal: Simple greetings, quick facts (< 50 tokens thinking)
 * - low: Basic tasks, simple edits (< 200 tokens thinking)
 * - medium: Standard tasks, code generation (< 1000 tokens thinking)
 * - high: Complex reasoning, planning, analysis (< 5000 tokens thinking)
 * - ultra: Marathon tasks, multi-step research, deep analysis (unlimited thinking)
 */

// Keywords that trigger different thinking levels
const ULTRA_TRIGGERS = new Set([
  "marathon", "deep research", "comprehensive", "thorough analysis",
  "write a paper", "full report", "detailed breakdown", "in-depth",
  "research everything", "investigate", "systematic", "exhaustive"
]);

const HIGH_TRIGGERS = new Set([
  "plan", "analyze", "design", "architect", "strategy", "compare",
  "explain why", "debug", "refactor", "optimize", "review code",
  "implement", "build", "create project", "system design"
]);

const MEDIUM_TRIGGERS = new Set([
  "write", "code", "fix", "update", "modify", "change", "add",
  "edit", "generate", "create", "summarize", "translate"
]);

// Determine thinking level based on task complexity signals
export function inferThinkingLevel(userMessage: string): ThinkingLevel {
  const lower = userMessage.toLowerCase();

  // Ultra: Marathon mode, deep research, comprehensive tasks
  for (const trigger of ULTRA_TRIGGERS) {
    if (lower.includes(trigger)) {
      return "ultra";
    }
  }

  // High: complex reasoning, planning, analysis
  for (const trigger of HIGH_TRIGGERS) {
    if (lower.includes(trigger)) {
      return "high";
    }
  }

  // Long messages get higher thinking
  if (lower.length > 1000) return "high";
  if (lower.length > 500) return "medium";

  // Medium: standard coding/writing tasks
  for (const trigger of MEDIUM_TRIGGERS) {
    if (lower.includes(trigger)) {
      return "medium";
    }
  }

  // Minimal: simple questions
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

  return "low";
}

/**
 * Get thinking budget in tokens for a level
 */
export function getThinkingBudget(level: ThinkingLevel): number {
  switch (level) {
    case "minimal": return 50;
    case "low": return 200;
    case "medium": return 1000;
    case "high": return 5000;
    case "ultra": return 24576; // Max thinking budget
    default: return 1000;
  }
}
