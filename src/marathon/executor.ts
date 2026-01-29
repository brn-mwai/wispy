/**
 * Marathon Executor
 * Autonomously executes milestones with self-verification and recovery
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { nanoid } from "nanoid";
import { generateWithThinking } from "../ai/gemini.js";
import type { Agent } from "../core/agent.js";
import type {
  MarathonState,
  Milestone,
  MarathonLog,
  Checkpoint,
  ThinkingLevel,
} from "./types.js";
import { updateMilestoneStatus, getNextMilestone, getPlanProgress } from "./planner.js";
import { createHash } from "crypto";
import { sendTelegramMessage } from "../channels/telegram/adapter.js";

const execAsync = promisify(exec);

const EXECUTION_PROMPT = `You are an autonomous AI agent executing a specific milestone in a larger project.

PROJECT GOAL: {goal}

CURRENT MILESTONE: {milestoneTitle}
DESCRIPTION: {milestoneDescription}
EXPECTED ARTIFACTS: {artifacts}

PREVIOUS CONTEXT (Thought Signature):
{thoughtSignature}

WORKING DIRECTORY: {workingDirectory}

Execute this milestone by:
1. Creating/modifying the necessary files
2. Running any required commands
3. Verifying the work is correct

Use the available tools to:
- Create files with file_write
- Run commands with bash
- Read existing files with file_read

Be thorough but efficient. Focus only on this milestone.
After completing, summarize what you did and any important context for the next milestone.`;

const VERIFICATION_PROMPT = `You are verifying that a milestone was completed successfully.

MILESTONE: {milestoneTitle}
EXPECTED ARTIFACTS: {artifacts}
VERIFICATION STEPS: {verificationSteps}

Run the verification steps and report:
1. Did each verification step pass?
2. Are all expected artifacts present?
3. Any issues that need attention?

Output as JSON:
{
  "passed": true/false,
  "results": [
    {"step": "step description", "passed": true/false, "output": "..."}
  ],
  "summary": "Brief summary",
  "issues": ["list of issues if any"]
}`;

const RECOVERY_PROMPT = `A milestone failed. Analyze and attempt recovery.

MILESTONE: {milestoneTitle}
ERROR: {error}
ATTEMPT: {attempt} of {maxAttempts}

Previous thought signature:
{thoughtSignature}

Analyze what went wrong and try a different approach.
If the issue is systemic (missing dependency, permission, etc.), report it clearly.`;

export class MarathonExecutor {
  private agent: Agent;
  private apiKey: string;
  private state: MarathonState;
  private aborted = false;
  private paused = false;

  constructor(agent: Agent, apiKey: string, state: MarathonState) {
    this.agent = agent;
    this.apiKey = apiKey;
    this.state = state;
  }

  async run(): Promise<MarathonState> {
    this.log("info", "Marathon execution started");
    this.state.status = "executing";

    while (!this.aborted && !this.paused) {
      const milestone = getNextMilestone(this.state.plan);

      if (!milestone) {
        // Check if all completed or some failed
        const failed = this.state.plan.milestones.filter(
          (m) => m.status === "failed"
        );
        if (failed.length > 0) {
          this.state.status = "failed";
          this.log("error", `Marathon failed. ${failed.length} milestones failed.`);
        } else {
          this.state.status = "completed";
          this.state.completedAt = new Date().toISOString();
          this.log("success", "Marathon completed successfully!");
        }
        break;
      }

      await this.executeMilestone(milestone);

      // Save checkpoint after each milestone
      await this.createCheckpoint(milestone.id);

      // Small delay between milestones
      await this.sleep(2000);
    }

    if (this.paused) {
      this.state.status = "paused";
      this.state.pausedAt = new Date().toISOString();
      this.log("info", "Marathon paused");
    }

    return this.state;
  }

  private async executeMilestone(milestone: Milestone): Promise<void> {
    this.log("info", `Starting milestone: ${milestone.title}`, milestone.id);

    // Update status
    this.state.plan = updateMilestoneStatus(
      this.state.plan,
      milestone.id,
      "in_progress",
      { startedAt: new Date().toISOString() }
    );

    const thinkingLevel = this.state.plan.thinkingStrategy.execution;

    try {
      // Execute the milestone
      const executionPrompt = EXECUTION_PROMPT
        .replace("{goal}", this.state.plan.goal)
        .replace("{milestoneTitle}", milestone.title)
        .replace("{milestoneDescription}", milestone.description)
        .replace("{artifacts}", JSON.stringify(milestone.artifacts))
        .replace("{thoughtSignature}", this.state.thoughtSignature)
        .replace("{workingDirectory}", this.state.workingDirectory);

      this.log("thinking", `Executing with ${thinkingLevel} thinking...`, milestone.id);

      // Use the agent's chat method which has tool access
      // Args: (message, peerId, channel, sessionType?)
      const response = await this.agent.chat(
        executionPrompt,
        "main-executor",
        "main",
        "main"
      );

      // Update thought signature for continuity
      this.state.thoughtSignature = this.extractThoughtSignature(response.text);

      // Verify the milestone
      const verified = await this.verifyMilestone(milestone);

      if (verified) {
        this.state.plan = updateMilestoneStatus(
          this.state.plan,
          milestone.id,
          "completed",
          {
            completedAt: new Date().toISOString(),
            verificationPassed: true,
            actualMinutes: this.calculateActualMinutes(milestone),
          }
        );
        this.log("success", `Milestone completed: ${milestone.title}`, milestone.id);
        await this.notifyMilestoneComplete(milestone);
      } else {
        throw new Error("Verification failed");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log("error", `Milestone failed: ${errorMsg}`, milestone.id);

      // Attempt recovery
      if (milestone.retryCount < milestone.maxRetries) {
        milestone.retryCount++;
        this.log("info", `Attempting recovery (${milestone.retryCount}/${milestone.maxRetries})`, milestone.id);
        await this.attemptRecovery(milestone, errorMsg);
      } else {
        this.state.plan = updateMilestoneStatus(
          this.state.plan,
          milestone.id,
          "failed",
          { errorLog: errorMsg }
        );
        await this.notifyMilestoneFailure(milestone, errorMsg);
      }
    }
  }

  private async verifyMilestone(milestone: Milestone): Promise<boolean> {
    if (milestone.verificationSteps.length === 0) {
      // No verification steps, just check artifacts exist
      return milestone.artifacts.every((artifact) =>
        existsSync(resolve(this.state.workingDirectory, artifact))
      );
    }

    const verificationPrompt = VERIFICATION_PROMPT
      .replace("{milestoneTitle}", milestone.title)
      .replace("{artifacts}", JSON.stringify(milestone.artifacts))
      .replace("{verificationSteps}", JSON.stringify(milestone.verificationSteps));

    const response = await generateWithThinking(
      verificationPrompt,
      this.state.plan.thinkingStrategy.verification,
      this.apiKey
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result.passed === true;
      }
    } catch {
      // If we can't parse, check artifacts manually
      return milestone.artifacts.every((artifact) =>
        existsSync(resolve(this.state.workingDirectory, artifact))
      );
    }

    return false;
  }

  private async attemptRecovery(milestone: Milestone, error: string): Promise<void> {
    const recoveryPrompt = RECOVERY_PROMPT
      .replace("{milestoneTitle}", milestone.title)
      .replace("{error}", error)
      .replace("{attempt}", String(milestone.retryCount))
      .replace("{maxAttempts}", String(milestone.maxRetries))
      .replace("{thoughtSignature}", this.state.thoughtSignature);

    this.log("thinking", "Analyzing failure and attempting recovery...", milestone.id);

    const response = await this.agent.chat(
      recoveryPrompt,
      "main-executor",
      "main",
      "main"
    );
    this.state.thoughtSignature = this.extractThoughtSignature(response.text);

    // Re-verify after recovery attempt
    const verified = await this.verifyMilestone(milestone);

    if (verified) {
      this.state.plan = updateMilestoneStatus(
        this.state.plan,
        milestone.id,
        "completed",
        {
          completedAt: new Date().toISOString(),
          verificationPassed: true,
          actualMinutes: this.calculateActualMinutes(milestone),
        }
      );
      this.log("success", `Recovery successful: ${milestone.title}`, milestone.id);
    } else if (milestone.retryCount < milestone.maxRetries) {
      // Will retry in next iteration
      this.state.plan = updateMilestoneStatus(
        this.state.plan,
        milestone.id,
        "pending"
      );
    }
  }

  private async createCheckpoint(milestoneId: string): Promise<void> {
    const checkpoint: Checkpoint = {
      id: nanoid(8),
      milestoneId,
      createdAt: new Date().toISOString(),
      thoughtSignature: this.state.thoughtSignature,
      filesSnapshot: await this.snapshotFiles(),
      canRestore: true,
    };

    this.state.checkpoints.push(checkpoint);
    this.log("info", `Checkpoint created: ${checkpoint.id}`);

    // Persist state
    this.persistState();
  }

  private async snapshotFiles(): Promise<Record<string, string>> {
    const snapshot: Record<string, string> = {};
    for (const artifact of this.state.artifacts) {
      const fullPath = resolve(this.state.workingDirectory, artifact);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath);
        snapshot[artifact] = createHash("sha256").update(content).digest("hex");
      }
    }
    return snapshot;
  }

  private extractThoughtSignature(response: string): string {
    // Extract key context for continuity between milestones
    // This maintains reasoning state across the main
    const lines = response.split("\n");
    const significantLines = lines.filter(
      (line) =>
        line.includes("created") ||
        line.includes("installed") ||
        line.includes("configured") ||
        line.includes("important") ||
        line.includes("note") ||
        line.includes("TODO") ||
        line.includes("next")
    );

    const signature = {
      timestamp: new Date().toISOString(),
      keyPoints: significantLines.slice(0, 10),
      artifactsCreated: this.state.artifacts,
      milestonesCompleted: this.state.plan.milestones
        .filter((m) => m.status === "completed")
        .map((m) => m.title),
    };

    return JSON.stringify(signature, null, 2);
  }

  private calculateActualMinutes(milestone: Milestone): number {
    if (!milestone.startedAt) return milestone.estimatedMinutes;
    const start = new Date(milestone.startedAt);
    const end = new Date();
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  private log(
    level: MarathonLog["level"],
    message: string,
    milestone?: string
  ): void {
    const log: MarathonLog = {
      timestamp: new Date().toISOString(),
      level,
      milestone,
      message,
    };
    this.state.logs.push(log);

    // Also log to console with colors
    const colors = {
      info: "\x1b[36m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
      success: "\x1b[32m",
      thinking: "\x1b[35m",
    };
    const reset = "\x1b[0m";
    console.log(`${colors[level]}[MARATHON] ${message}${reset}`);
  }

  private async notifyMilestoneComplete(milestone: Milestone): Promise<void> {
    if (!this.state.notifications.enabled) return;
    if (!this.state.notifications.notifyOn.milestoneComplete) return;

    const progress = getPlanProgress(this.state.plan);
    const message = `✅ *Milestone Completed*\n\n` +
      `*${milestone.title}*\n\n` +
      `Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)\n` +
      `Remaining: ~${progress.estimatedRemainingMinutes}min`;

    await this.sendNotifications(message);
  }

  private async notifyMilestoneFailure(milestone: Milestone, error: string): Promise<void> {
    if (!this.state.notifications.enabled) return;
    if (!this.state.notifications.notifyOn.milestoneFailure) return;

    const progress = getPlanProgress(this.state.plan);
    const message = `❌ *Milestone Failed*\n\n` +
      `*${milestone.title}*\n\n` +
      `Error: ${error.slice(0, 200)}\n` +
      `Progress: ${progress.completed}/${progress.total}`;

    await this.sendNotifications(message);
  }

  private async sendNotifications(message: string): Promise<void> {
    const { channels } = this.state.notifications;

    // Telegram notification
    if (channels.telegram?.chatId) {
      try {
        const sent = await sendTelegramMessage(channels.telegram.chatId, message);
        if (sent) {
          this.log("info", "Telegram notification sent");
        }
      } catch (e) {
        this.log("warn", "Failed to send Telegram notification");
      }
    }

    // Discord webhook
    if (channels.discord?.webhookUrl) {
      try {
        await fetch(channels.discord.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.replace(/\*/g, "**") }),
        });
        this.log("info", "Discord notification sent");
      } catch (e) {
        this.log("warn", "Failed to send Discord notification");
      }
    }

    // Slack webhook
    if (channels.slack?.webhookUrl) {
      try {
        await fetch(channels.slack.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message.replace(/\*/g, "*") }),
        });
        this.log("info", "Slack notification sent");
      } catch (e) {
        this.log("warn", "Failed to send Slack notification");
      }
    }
  }

  private getProgressString(): string {
    const completed = this.state.plan.milestones.filter(
      (m) => m.status === "completed"
    ).length;
    const total = this.state.plan.milestones.length;
    return `${completed}/${total} (${Math.round((completed / total) * 100)}%)`;
  }

  private persistState(): void {
    const statePath = resolve(
      this.state.workingDirectory,
      ".wispy",
      "main",
      `${this.state.id}.json`
    );
    try {
      writeFileSync(statePath, JSON.stringify(this.state, null, 2));
    } catch {
      // Directory might not exist yet
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  pause(): void {
    this.paused = true;
  }

  abort(): void {
    this.aborted = true;
  }

  getState(): MarathonState {
    return this.state;
  }
}
