/**
 * Marathon Planner
 * Uses Gemini 3 with high thinking to decompose goals into milestones
 */

import { nanoid } from "nanoid";
import { generateWithThinking } from "../ai/gemini.js";
import type { MarathonPlan, Milestone, ThinkingLevel } from "./types.js";

const PLANNING_PROMPT = `You are an expert project planner for autonomous AI agents. Your task is to break down a complex goal into concrete, executable milestones.

GOAL: {goal}

CONTEXT: {context}

Create a detailed execution plan with milestones. Each milestone must be:
1. Atomic - completable in one focused session (15-60 minutes)
2. Verifiable - has clear success criteria that can be programmatically checked
3. Sequential - dependencies are explicit

For each milestone, specify:
- What files/artifacts will be created
- How to verify it worked (test commands, file checks, API calls)
- Estimated time in minutes

Think deeply about:
- What could go wrong and how to recover
- What order minimizes rework
- What can be parallelized vs must be sequential

Output as JSON:
{
  "milestones": [
    {
      "id": "m1",
      "title": "Short title",
      "description": "Detailed description of what to do",
      "dependencies": [], // IDs of milestones that must complete first
      "estimatedMinutes": 30,
      "artifacts": ["path/to/file.ts"],
      "verificationSteps": ["npm test", "curl http://localhost:3000/health"]
    }
  ],
  "estimatedTotalMinutes": 240,
  "criticalPath": ["m1", "m2", "m5"], // Milestones that block everything
  "parallelizable": [["m3", "m4"]], // Groups that can run in parallel
  "riskAssessment": "Brief description of main risks and mitigations"
}`;

export async function createMarathonPlan(
  goal: string,
  context: string,
  apiKey: string
): Promise<MarathonPlan> {
  const prompt = PLANNING_PROMPT
    .replace("{goal}", goal)
    .replace("{context}", context);

  // Use ultra thinking for planning - this is critical
  const response = await generateWithThinking(
    prompt,
    "ultra",
    apiKey
  );

  // Parse the JSON from response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse planning response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const planId = nanoid(12);

  const milestones: Milestone[] = parsed.milestones.map((m: any) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: "pending",
    dependencies: m.dependencies || [],
    estimatedMinutes: m.estimatedMinutes || 30,
    artifacts: m.artifacts || [],
    verificationSteps: m.verificationSteps || [],
    retryCount: 0,
    maxRetries: 3,
  }));

  return {
    id: planId,
    goal,
    context,
    milestones,
    currentMilestoneIndex: 0,
    thinkingStrategy: {
      planning: "ultra",
      execution: "high",
      verification: "medium",
      recovery: "high",
    },
    createdAt: new Date().toISOString(),
    estimatedTotalMinutes: parsed.estimatedTotalMinutes ||
      milestones.reduce((sum, m) => sum + m.estimatedMinutes, 0),
  };
}

export function getNextMilestone(plan: MarathonPlan): Milestone | null {
  // Find first pending milestone whose dependencies are all completed
  for (const milestone of plan.milestones) {
    if (milestone.status !== "pending") continue;

    const depsCompleted = milestone.dependencies.every((depId) => {
      const dep = plan.milestones.find((m) => m.id === depId);
      return dep?.status === "completed";
    });

    if (depsCompleted) {
      return milestone;
    }
  }
  return null;
}

export function updateMilestoneStatus(
  plan: MarathonPlan,
  milestoneId: string,
  status: Milestone["status"],
  updates?: Partial<Milestone>
): MarathonPlan {
  return {
    ...plan,
    milestones: plan.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, status, ...updates }
        : m
    ),
  };
}

export function getPlanProgress(plan: MarathonPlan): {
  completed: number;
  total: number;
  percentage: number;
  estimatedRemainingMinutes: number;
} {
  const completed = plan.milestones.filter((m) => m.status === "completed").length;
  const total = plan.milestones.length;
  const percentage = Math.round((completed / total) * 100);

  const remainingMinutes = plan.milestones
    .filter((m) => m.status === "pending" || m.status === "in_progress")
    .reduce((sum, m) => sum + m.estimatedMinutes, 0);

  return {
    completed,
    total,
    percentage,
    estimatedRemainingMinutes: remainingMinutes,
  };
}

export function formatPlanSummary(plan: MarathonPlan): string {
  const progress = getPlanProgress(plan);
  const lines = [
    `## Marathon: ${plan.goal}`,
    ``,
    `Progress: ${progress.completed}/${progress.total} milestones (${progress.percentage}%)`,
    `Estimated remaining: ${progress.estimatedRemainingMinutes} minutes`,
    ``,
    `### Milestones:`,
  ];

  for (const m of plan.milestones) {
    const icon = {
      pending: "⏳",
      in_progress: "🔄",
      completed: "✅",
      failed: "❌",
      skipped: "⏭️",
    }[m.status];
    lines.push(`${icon} **${m.title}** (${m.estimatedMinutes}m)`);
    if (m.status === "in_progress") {
      lines.push(`   Currently working on this...`);
    }
  }

  return lines.join("\n");
}
