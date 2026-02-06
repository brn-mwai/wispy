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
import {
  updateProgressMessage,
  sendMilestoneNotification,
  sendMarathonComplete,
  sendVerificationNotification,
} from "./telegram-visuals.js";

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

  // Loop detection - tracks action history to prevent infinite loops
  private actionHistory: Array<{ action: string; hash: string; timestamp: number }> = [];
  private readonly MAX_IDENTICAL_ACTIONS = 3;
  private readonly ACTION_HISTORY_WINDOW = 10;

  // Telegram integration for visual updates
  private telegramBot: any = null;
  private telegramChatId: string | null = null;

  // Stats tracking for visuals
  private stats = {
    startTime: Date.now(),
    tokensUsed: 0,
    toolCalls: 0,
    filesCreated: 0,
  };

  constructor(
    agent: Agent,
    apiKey: string,
    state: MarathonState,
    options?: {
      telegramBot?: any;
      telegramChatId?: string;
    }
  ) {
    this.agent = agent;
    this.apiKey = apiKey;
    this.state = state;
    if (options?.telegramBot) {
      this.telegramBot = options.telegramBot;
    }
    if (options?.telegramChatId) {
      this.telegramChatId = options.telegramChatId;
    }
  }

  /**
   * LOOP DETECTION: Hash an action to detect repetition
   * This solves the #1 competitor complaint: infinite loops
   */
  private hashAction(milestoneId: string, response: string): string {
    // Create a semantic hash of the action
    const normalized = response
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[0-9]+/g, 'N')  // Normalize numbers
      .slice(0, 500);  // First 500 chars
    return createHash('md5').update(`${milestoneId}:${normalized}`).digest('hex').slice(0, 16);
  }

  /**
   * Check if we're stuck in a loop
   */
  private detectLoop(milestoneId: string, response: string): { isLoop: boolean; count: number } {
    const hash = this.hashAction(milestoneId, response);
    const now = Date.now();

    // Add to history
    this.actionHistory.push({ action: milestoneId, hash, timestamp: now });

    // Keep only recent actions
    if (this.actionHistory.length > this.ACTION_HISTORY_WINDOW) {
      this.actionHistory = this.actionHistory.slice(-this.ACTION_HISTORY_WINDOW);
    }

    // Count identical actions in recent history
    const identicalCount = this.actionHistory.filter(a => a.hash === hash).length;

    return {
      isLoop: identicalCount >= this.MAX_IDENTICAL_ACTIONS,
      count: identicalCount
    };
  }

  /**
   * Force replanning when stuck - breaks the loop
   */
  private async forceReplan(milestone: Milestone, loopCount: number): Promise<void> {
    this.log("warn", `Loop detected (${loopCount}x identical actions). Forcing replan...`, milestone.id);

    const replanPrompt = `CRITICAL: You are stuck in a loop, repeating the same action ${loopCount} times.

MILESTONE: ${milestone.title}
DESCRIPTION: ${milestone.description}

The previous approach is NOT working. You MUST try a COMPLETELY DIFFERENT strategy:
1. Analyze what keeps failing
2. Identify the root cause
3. Propose an alternative approach
4. If the task is impossible, explain why and mark as blocked

DO NOT repeat the same actions. Try something fundamentally different.`;

    await this.agent.chat(replanPrompt, "main-executor", "main", "main");

    // Clear action history to give fresh start
    this.actionHistory = [];
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

      // LOOP DETECTION: Check if we're stuck
      const loopCheck = this.detectLoop(milestone.id, response.text);
      if (loopCheck.isLoop) {
        await this.forceReplan(milestone, loopCheck.count);
        // After replan, let the outer loop retry the milestone
        throw new Error(`Loop detected after ${loopCheck.count} identical actions - replanning`);
      }

      // Update thought signature for continuity (Gemini 3 feature)
      // Pass native signature from API response when available
      this.state.thoughtSignature = this.extractThoughtSignature(
        response.text,
        (response as any).thoughtSignature
      );

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
    // Update thought signature for recovery context continuity
    this.state.thoughtSignature = this.extractThoughtSignature(
      response.text,
      (response as any).thoughtSignature
    );

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

  /**
   * Extract Thought Signature for context continuity
   *
   * Gemini 3's Thought Signatures are encrypted representations of the model's
   * internal thought process. They maintain reasoning context across API calls,
   * enabling Marathon Mode's multi-day task execution with seamless continuity.
   *
   * When Gemini 3 returns a native thoughtSignature, we use it directly.
   * Otherwise, we construct a semantic signature from the response.
   */
  private extractThoughtSignature(response: string, nativeSignature?: string): string {
    // If Gemini 3 provided a native thought signature, use it as the base
    if (nativeSignature) {
      // Combine native signature with our structured context
      const signature = {
        gemini3ThoughtSignature: nativeSignature,
        timestamp: new Date().toISOString(),
        artifactsCreated: this.state.artifacts,
        milestonesCompleted: this.state.plan.milestones
          .filter((m) => m.status === "completed")
          .map((m) => m.title),
        progress: `${this.state.plan.milestones.filter(m => m.status === "completed").length}/${this.state.plan.milestones.length}`,
      };
      return JSON.stringify(signature, null, 2);
    }

    // Fallback: Extract key context from response text for continuity
    const lines = response.split("\n");
    const significantLines = lines.filter(
      (line) =>
        line.includes("created") ||
        line.includes("installed") ||
        line.includes("configured") ||
        line.includes("important") ||
        line.includes("note") ||
        line.includes("TODO") ||
        line.includes("next") ||
        line.includes("completed") ||
        line.includes("success")
    );

    const signature = {
      timestamp: new Date().toISOString(),
      keyPoints: significantLines.slice(0, 15),
      artifactsCreated: this.state.artifacts,
      milestonesCompleted: this.state.plan.milestones
        .filter((m) => m.status === "completed")
        .map((m) => m.title),
      workingDirectory: this.state.workingDirectory,
      progress: `${this.state.plan.milestones.filter(m => m.status === "completed").length}/${this.state.plan.milestones.length}`,
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
    const progress = getPlanProgress(this.state.plan);
    const milestoneIndex = this.state.plan.milestones.findIndex(m => m.id === milestone.id);
    const totalMilestones = this.state.plan.milestones.length;

    // Send visual Telegram notification using enhanced visuals
    if (this.telegramChatId) {
      try {
        await sendMilestoneNotification(
          this.telegramChatId,
          milestone,
          milestoneIndex + 1,
          totalMilestones,
          "complete",
          {
            duration: (Date.now() - this.stats.startTime) / 60000,
            artifacts: milestone.artifacts,
          }
        );
        this.log("info", "Telegram visual notification sent");
      } catch (e) {
        this.log("warn", "Failed to send Telegram visual notification");
      }
    }

    if (!this.state.notifications.enabled) return;
    if (!this.state.notifications.notifyOn.milestoneComplete) return;

    const message = `✅ *Milestone Completed*\n\n` +
      `*${milestone.title}*\n\n` +
      `Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)\n` +
      `Remaining: ~${progress.estimatedRemainingMinutes}min`;

    await this.sendNotifications(message);
  }

  private async notifyMilestoneFailure(milestone: Milestone, error: string): Promise<void> {
    const progress = getPlanProgress(this.state.plan);
    const milestoneIndex = this.state.plan.milestones.findIndex(m => m.id === milestone.id);
    const totalMilestones = this.state.plan.milestones.length;

    // Send visual Telegram notification using enhanced visuals
    if (this.telegramChatId) {
      try {
        await sendMilestoneNotification(
          this.telegramChatId,
          milestone,
          milestoneIndex + 1,
          totalMilestones,
          "failed",
          {
            error: error,
            retryCount: milestone.retryCount,
          }
        );
        this.log("info", "Telegram visual notification sent");
      } catch (e) {
        this.log("warn", "Failed to send Telegram visual notification");
      }
    }

    if (!this.state.notifications.enabled) return;
    if (!this.state.notifications.notifyOn.milestoneFailure) return;

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
