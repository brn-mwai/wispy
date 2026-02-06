/**
 * Grounding & Anti-Hallucination Module
 *
 * Provides fact verification, source grounding, and confidence scoring
 * to reduce AI hallucinations and improve accuracy.
 */

import { createLogger } from "../infra/logger.js";

const log = createLogger("grounding");

export interface GroundingResult {
  verified: boolean;
  confidence: number; // 0-1
  sources: string[];
  explanation: string;
  warnings: string[];
}

export interface TaskContext {
  taskName: string;
  requirements: string[];
  constraints: string[];
  previousTasks: string[];
}

// Known patterns that often lead to hallucinations
const HALLUCINATION_PATTERNS = [
  /^https?:\/\/[a-z]+\.[a-z]+\/[a-z0-9]{8,}$/i, // Fake URLs
  /version \d+\.\d+\.\d+\.\d+/i, // Overly specific versions
  /\d{10,}/g, // Very long numbers (often made up)
  /\b(definitely|certainly|always|never)\b/gi, // Overconfident language
];

// Technical terms that should be verified
const VERIFY_PATTERNS = [
  /(?:API|SDK|library|package) (?:called|named) ["']?(\w+)["']?/gi,
  /version (\d+\.\d+(?:\.\d+)?)/gi,
  /(?:released|launched|announced) (?:in|on) (\d{4})/gi,
  /(\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|M|B))?)/gi, // Prices/amounts
];

/**
 * Check text for potential hallucination patterns
 */
export function detectPotentialHallucinations(text: string): {
  suspicious: boolean;
  patterns: string[];
  suggestion: string;
} {
  const patterns: string[] = [];

  for (const pattern of HALLUCINATION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      patterns.push(...matches.slice(0, 3));
    }
  }

  // Check for technical claims that should be verified
  const techClaims: string[] = [];
  for (const pattern of VERIFY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      techClaims.push(match[0]);
    }
  }

  const suspicious = patterns.length > 0 || techClaims.length > 3;

  let suggestion = "";
  if (suspicious) {
    suggestion = "Consider using verify_fact tool for: " + techClaims.slice(0, 3).join(", ");
  }

  return { suspicious, patterns, suggestion };
}

/**
 * Create a grounded response with confidence indicators
 */
export function createGroundedResponse(
  text: string,
  sources: string[],
  confidence: number
): string {
  const confidenceIcon =
    confidence >= 0.9 ? "✅" :
    confidence >= 0.7 ? "🟡" :
    confidence >= 0.5 ? "🟠" : "⚠️";

  let response = text;

  // Add confidence indicator for low confidence
  if (confidence < 0.8 && sources.length === 0) {
    response += `\n\n${confidenceIcon} *Confidence: ${Math.round(confidence * 100)}%*`;
    response += "\n_This response may need verification_";
  } else if (sources.length > 0) {
    response += `\n\n📚 *Sources:*\n${sources.map(s => `• ${s}`).join("\n")}`;
  }

  return response;
}

/**
 * Task boundary manager for clear task distinction
 */
export class TaskBoundaryManager {
  private currentTask: TaskContext | null = null;
  private taskHistory: TaskContext[] = [];

  startTask(taskName: string, requirements: string[], constraints: string[] = []): string {
    // Save previous task
    if (this.currentTask) {
      this.taskHistory.push(this.currentTask);
    }

    this.currentTask = {
      taskName,
      requirements,
      constraints,
      previousTasks: this.taskHistory.map(t => t.taskName),
    };

    log.info("Task boundary: Starting '%s'", taskName);

    return this.generateTaskBanner();
  }

  getCurrentTask(): TaskContext | null {
    return this.currentTask;
  }

  endTask(summary: string): void {
    if (this.currentTask) {
      log.info("Task boundary: Ending '%s' - %s", this.currentTask.taskName, summary);
    }
    this.currentTask = null;
  }

  private generateTaskBanner(): string {
    if (!this.currentTask) return "";

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TASK: ${this.currentTask.taskName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Requirements:**
${this.currentTask.requirements.map(r => `• ${r}`).join("\n")}

${this.currentTask.constraints.length > 0 ? `**Constraints:**
${this.currentTask.constraints.map(c => `• ${c}`).join("\n")}

` : ""}**Ground Rules:**
• Focus ONLY on this task
• Verify facts before stating
• Ask if unclear
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }
}

/**
 * Response validator for catching potential issues
 */
export function validateResponse(response: string): {
  valid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for hallucination patterns
  const hallucinationCheck = detectPotentialHallucinations(response);
  if (hallucinationCheck.suspicious) {
    issues.push("Response contains potentially unverified claims");
    suggestions.push(hallucinationCheck.suggestion);
  }

  // Check for empty or too short responses
  if (response.length < 10) {
    issues.push("Response is too short");
  }

  // Check for incomplete sentences
  if (response.endsWith("...") || response.match(/\.\.\.\s*$/)) {
    issues.push("Response appears incomplete");
    suggestions.push("Complete the thought or explain why truncated");
  }

  // Check for code without explanation
  if (response.includes("```") && !response.match(/\n[^`]+```/)) {
    suggestions.push("Consider adding explanation for code blocks");
  }

  return {
    valid: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * System prompt additions for reducing hallucinations
 */
export const GROUNDING_INSTRUCTIONS = `
## Anti-Hallucination Guidelines

1. **Verify before stating**: Use verify_fact tool for technical claims
2. **Admit uncertainty**: Say "I'm not certain" when applicable
3. **Cite sources**: Reference where information comes from
4. **Use current data**: Prefer google_search for recent information
5. **Stay on task**: Use distinguish_task tool when switching contexts
6. **Check confidence**: If unsure, ask the user for clarification

## Response Quality

- Avoid overconfident language (always, never, definitely, certainly)
- Provide specific evidence for claims
- Acknowledge limitations and potential inaccuracies
- Separate facts from opinions/interpretations
`;

export default {
  detectPotentialHallucinations,
  createGroundedResponse,
  validateResponse,
  TaskBoundaryManager,
  GROUNDING_INSTRUCTIONS,
};
