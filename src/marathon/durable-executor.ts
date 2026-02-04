/**
 * Durable Marathon Executor
 *
 * Enhanced executor for long-running background agents that:
 * - Auto-save state after every tool execution
 * - Stream progress in real-time (Telegram, WebSocket, console)
 * - Pause for human approval on sensitive actions
 * - Heartbeat mechanism for crash detection
 * - Auto-resume from exact checkpoint on restart
 */

import { EventEmitter } from "events";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { generateWithThinking } from "../ai/gemini.js";
import type { Agent } from "../core/agent.js";
import type {
  MarathonState,
  Milestone,
  MarathonLog,
  ActionCheckpoint,
  ApprovalRequest,
  DurableMarathonState,
  MarathonEvent,
  MarathonEventType,
} from "./types.js";
import { updateMilestoneStatus, getNextMilestone, getPlanProgress } from "./planner.js";
import { sendTelegramMessage } from "../channels/telegram/adapter.js";

export class DurableMarathonExecutor extends EventEmitter {
  private agent: Agent;
  private apiKey: string;
  private state: DurableMarathonState;
  private aborted = false;
  private paused = false;
  private waitingForApproval = false;
  private currentApprovalId: string | null = null;

  // Heartbeat
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Streaming throttle
  private lastStreamTime = 0;

  // Loop detection
  private actionHistory: Array<{ action: string; hash: string; timestamp: number }> = [];
  private readonly MAX_IDENTICAL_ACTIONS = 3;
  private readonly ACTION_HISTORY_WINDOW = 10;

  // State persistence path
  private statePath: string;

  constructor(agent: Agent, apiKey: string, state: DurableMarathonState) {
    super();
    this.agent = agent;
    this.apiKey = apiKey;
    this.state = state;

    // Initialize state path
    const runtimeDir = resolve(state.workingDirectory, ".wispy", "marathon");
    this.statePath = resolve(runtimeDir, `${state.id}.json`);

    // Ensure directory exists
    const dir = dirname(this.statePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Set process info for watchdog
    this.state.processId = process.pid;
    this.state.startedByHost = process.env.HOSTNAME || "local";
  }

  /**
   * Initialize a new durable state from basic marathon state
   */
  static initializeDurableState(baseState: MarathonState): DurableMarathonState {
    return {
      ...baseState,
      heartbeat: {
        enabled: true,
        intervalMs: 30000,
        timeoutMs: 120000,
      },
      actionCheckpoints: [],
      approvalRequests: [],
      approvalPolicy: {
        enabled: true,
        requireApprovalFor: {
          fileDelete: true,
          bashCommands: ["rm -rf", "git push --force", "drop database", "sudo"],
          apiCalls: [],
          payments: true,
          externalMessages: true,
        },
        autoApproveTimeout: 0, // Never auto-approve by default
        notifyChannels: ["telegram"],
      },
      streaming: {
        enabled: true,
        targets: {
          console: true,
          file: true,
          telegram: undefined,
          websocket: undefined,
          webhook: undefined,
        },
        throttleMs: 1000,
        includeThinking: false,
      },
      crashCount: 0,
      autoResumeEnabled: true,
    };
  }

  /**
   * Main execution loop
   */
  async run(): Promise<DurableMarathonState> {
    this.log("info", "Durable Marathon executor started");
    this.state.status = "executing";

    // Start heartbeat
    this.startHeartbeat();

    // Emit started event
    this.emitEvent("started", { goal: this.state.plan.goal });

    try {
      while (!this.aborted && !this.paused) {
        // Check for pending approvals
        if (this.waitingForApproval) {
          await this.waitForApproval();
          continue;
        }

        const milestone = getNextMilestone(this.state.plan);

        if (!milestone) {
          // Check completion status
          const failed = this.state.plan.milestones.filter(m => m.status === "failed");
          if (failed.length > 0) {
            this.state.status = "failed";
            this.log("error", `Marathon failed. ${failed.length} milestones failed.`);
            this.emitEvent("failed", { failedMilestones: failed.map(m => m.title) });
          } else {
            this.state.status = "completed";
            this.state.completedAt = new Date().toISOString();
            this.log("success", "Marathon completed successfully!");
            this.emitEvent("completed", {
              completedAt: this.state.completedAt,
              artifacts: this.state.artifacts,
            });
          }
          break;
        }

        await this.executeMilestone(milestone);

        // Persist after each milestone
        this.persistState();

        // Small delay between milestones
        await this.sleep(2000);
      }
    } finally {
      this.stopHeartbeat();
    }

    if (this.paused) {
      this.state.status = "paused";
      this.state.pausedAt = new Date().toISOString();
      this.log("info", "Marathon paused");
      this.emitEvent("paused", { pausedAt: this.state.pausedAt });
    }

    this.persistState();
    return this.state;
  }

  /**
   * Execute a single milestone with action-level checkpointing
   */
  private async executeMilestone(milestone: Milestone): Promise<void> {
    this.log("info", `Starting milestone: ${milestone.title}`, milestone.id);
    this.emitEvent("milestone_started", { milestone: milestone.title });

    // Update status
    this.state.plan = updateMilestoneStatus(
      this.state.plan,
      milestone.id,
      "in_progress",
      { startedAt: new Date().toISOString() }
    );
    this.persistState();

    try {
      // Build execution prompt
      const executionPrompt = this.buildExecutionPrompt(milestone);

      this.log("thinking", `Executing with thinking...`, milestone.id);
      this.emitEvent("thinking", { milestone: milestone.id });

      // Execute via agent with tool interception for checkpointing
      const response = await this.executeWithCheckpointing(
        executionPrompt,
        milestone.id
      );

      // Loop detection
      const loopCheck = this.detectLoop(milestone.id, response);
      if (loopCheck.isLoop) {
        await this.forceReplan(milestone, loopCheck.count);
        throw new Error(`Loop detected after ${loopCheck.count} identical actions`);
      }

      // Update thought signature
      this.state.thoughtSignature = this.extractThoughtSignature(response);

      // Verify
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
        this.emitEvent("milestone_completed", { milestone: milestone.title });
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
        this.emitEvent("milestone_failed", { milestone: milestone.title, error: errorMsg });
        await this.notifyMilestoneFailure(milestone, errorMsg);
      }
    }
  }

  /**
   * Execute with action-level checkpointing
   * Creates checkpoint after every tool execution
   */
  private async executeWithCheckpointing(
    prompt: string,
    milestoneId: string
  ): Promise<string> {
    // Create pre-execution checkpoint
    const checkpoint: ActionCheckpoint = {
      id: nanoid(8),
      timestamp: new Date().toISOString(),
      milestoneId,
      actionIndex: this.state.actionCheckpoints.length,
      toolName: "agent_chat",
      toolArgs: { prompt: prompt.slice(0, 200) + "..." },
      thoughtSignature: this.state.thoughtSignature,
      filesChanged: [],
      status: "pending",
    };
    this.state.actionCheckpoints.push(checkpoint);
    this.persistState();

    this.emitEvent("action_started", { checkpointId: checkpoint.id });

    try {
      // Execute via agent
      const response = await this.agent.chat(
        prompt,
        "marathon-executor",
        "main",
        "main"
      );

      // Update checkpoint
      checkpoint.toolResult = response.text.slice(0, 500);
      checkpoint.status = "completed";
      this.persistState();

      this.emitEvent("action_completed", {
        checkpointId: checkpoint.id,
        success: true,
      });

      return response.text;
    } catch (error) {
      checkpoint.status = "failed";
      checkpoint.toolResult = error instanceof Error ? error.message : String(error);
      this.persistState();

      this.emitEvent("action_completed", {
        checkpointId: checkpoint.id,
        success: false,
        error: checkpoint.toolResult,
      });

      throw error;
    }
  }

  /**
   * Check if action requires human approval
   */
  private async checkApproval(
    action: string,
    description: string,
    risk: ApprovalRequest["risk"]
  ): Promise<boolean> {
    if (!this.state.approvalPolicy.enabled) {
      return true; // Auto-approve if policy disabled
    }

    const policy = this.state.approvalPolicy.requireApprovalFor;

    // Check patterns
    let needsApproval = false;

    // Check bash commands
    if (policy.bashCommands.some(pattern => action.includes(pattern))) {
      needsApproval = true;
    }

    // File delete
    if (policy.fileDelete && (action.includes("delete") || action.includes("remove"))) {
      needsApproval = true;
    }

    // Payments
    if (policy.payments && action.includes("payment")) {
      needsApproval = true;
    }

    if (!needsApproval) {
      return true;
    }

    // Create approval request
    const request: ApprovalRequest = {
      id: nanoid(8),
      timestamp: new Date().toISOString(),
      milestoneId: this.state.plan.milestones.find(m => m.status === "in_progress")?.id || "",
      action,
      description,
      risk,
      status: "pending",
    };

    if (this.state.approvalPolicy.autoApproveTimeout) {
      request.autoApproveAfterMs = this.state.approvalPolicy.autoApproveTimeout;
      request.expiresAt = new Date(
        Date.now() + this.state.approvalPolicy.autoApproveTimeout
      ).toISOString();
    }

    this.state.approvalRequests.push(request);
    this.currentApprovalId = request.id;
    this.waitingForApproval = true;
    this.state.status = "waiting_human";
    this.persistState();

    // Notify
    this.emitEvent("approval_needed", { request });
    await this.notifyApprovalNeeded(request);

    this.log("info", `Waiting for approval: ${description}`);

    return false; // Will resume after approval
  }

  /**
   * Wait for pending approval
   */
  private async waitForApproval(): Promise<void> {
    const request = this.state.approvalRequests.find(
      r => r.id === this.currentApprovalId
    );

    if (!request) {
      this.waitingForApproval = false;
      return;
    }

    // Check auto-approve timeout
    if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
      request.status = "approved";
      request.approvedBy = "auto-timeout";
      request.approvedAt = new Date().toISOString();
      this.waitingForApproval = false;
      this.currentApprovalId = null;
      this.state.status = "executing";
      this.persistState();
      this.log("info", "Auto-approved after timeout");
      return;
    }

    // Check if approved/rejected externally
    if (request.status === "approved") {
      this.waitingForApproval = false;
      this.currentApprovalId = null;
      this.state.status = "executing";
      this.emitEvent("approval_granted", { requestId: request.id });
      return;
    }

    if (request.status === "rejected") {
      this.waitingForApproval = false;
      this.currentApprovalId = null;
      this.state.status = "paused";
      this.emitEvent("approval_rejected", {
        requestId: request.id,
        reason: request.reason,
      });
      this.paused = true;
      return;
    }

    // Still waiting - sleep and check again
    await this.sleep(5000);
  }

  /**
   * External method to approve a request
   */
  approve(requestId: string, approvedBy: string = "user"): void {
    const request = this.state.approvalRequests.find(r => r.id === requestId);
    if (request && request.status === "pending") {
      request.status = "approved";
      request.approvedBy = approvedBy;
      request.approvedAt = new Date().toISOString();
      this.persistState();
      this.log("info", `Approval granted for: ${request.description}`);
    }
  }

  /**
   * External method to reject a request
   */
  reject(requestId: string, reason: string = "User rejected"): void {
    const request = this.state.approvalRequests.find(r => r.id === requestId);
    if (request && request.status === "pending") {
      request.status = "rejected";
      request.reason = reason;
      this.persistState();
      this.log("warn", `Approval rejected for: ${request.description}`);
    }
  }

  // === HEARTBEAT ===

  private startHeartbeat(): void {
    if (!this.state.heartbeat.enabled) return;

    this.state.heartbeat.lastHeartbeat = new Date().toISOString();
    this.persistState();

    this.heartbeatInterval = setInterval(() => {
      this.state.heartbeat.lastHeartbeat = new Date().toISOString();
      this.state.heartbeat.lastAction = this.state.logs[this.state.logs.length - 1]?.message;
      this.persistState();
      this.emitEvent("heartbeat", {
        timestamp: this.state.heartbeat.lastHeartbeat,
        processId: process.pid,
      });
    }, this.state.heartbeat.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // === STREAMING ===

  private emitEvent(type: MarathonEventType, data: unknown): void {
    const now = Date.now();

    // Throttle
    if (now - this.lastStreamTime < this.state.streaming.throttleMs) {
      if (type !== "heartbeat" && type !== "checkpoint_created") {
        return;
      }
    }
    this.lastStreamTime = now;

    const progress = getPlanProgress(this.state.plan);

    const event: MarathonEvent = {
      type,
      timestamp: new Date().toISOString(),
      marathonId: this.state.id,
      milestoneId: this.state.plan.milestones.find(m => m.status === "in_progress")?.id,
      data,
      progress: {
        completed: progress.completed,
        total: progress.total,
        percentage: progress.percentage,
      },
    };

    // Emit to EventEmitter listeners
    this.emit("event", event);
    this.emit(type, event);

    // Stream to targets
    this.streamToTargets(event);
  }

  private async streamToTargets(event: MarathonEvent): Promise<void> {
    const targets = this.state.streaming.targets;

    // Console
    if (targets.console) {
      const icons: Record<string, string> = {
        started: "🚀",
        milestone_started: "📍",
        milestone_completed: "✅",
        milestone_failed: "❌",
        thinking: "🧠",
        approval_needed: "⚠️",
        completed: "🏁",
        heartbeat: "💓",
      };
      const icon = icons[event.type] || "📢";
      console.log(
        `${icon} [${event.type}] ${JSON.stringify(event.data)} (${event.progress.percentage}%)`
      );
    }

    // Telegram
    if (targets.telegram) {
      const message = this.formatEventForTelegram(event);
      if (message) {
        try {
          await sendTelegramMessage(targets.telegram, message);
        } catch {}
      }
    }

    // Webhook
    if (targets.webhook) {
      try {
        await fetch(targets.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });
      } catch {}
    }
  }

  private formatEventForTelegram(event: MarathonEvent): string | null {
    switch (event.type) {
      case "started":
        return `🚀 *Marathon Started*\n\nGoal: ${(event.data as any).goal}`;
      case "milestone_completed":
        return `✅ *Milestone Completed*\n\n${(event.data as any).milestone}\n\nProgress: ${event.progress.percentage}%`;
      case "milestone_failed":
        return `❌ *Milestone Failed*\n\n${(event.data as any).milestone}\n\nError: ${(event.data as any).error}`;
      case "approval_needed":
        const req = (event.data as any).request as ApprovalRequest;
        return `⚠️ *Approval Needed*\n\n${req.description}\n\nRisk: ${req.risk}\n\nReply with /approve ${req.id} or /reject ${req.id}`;
      case "completed":
        return `🏁 *Marathon Completed!*\n\nArtifacts: ${((event.data as any).artifacts || []).length}`;
      default:
        return null;
    }
  }

  // === CRASH RECOVERY ===

  /**
   * Resume from last checkpoint after crash
   */
  static async resumeFromCrash(
    statePath: string,
    agent: Agent,
    apiKey: string
  ): Promise<DurableMarathonExecutor | null> {
    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const stateJson = readFileSync(statePath, "utf-8");
      const state: DurableMarathonState = JSON.parse(stateJson);

      // Check if it was actually running (heartbeat expired)
      if (state.heartbeat.lastHeartbeat) {
        const lastBeat = new Date(state.heartbeat.lastHeartbeat).getTime();
        const now = Date.now();
        const isStale = now - lastBeat > state.heartbeat.timeoutMs;

        if (isStale && state.status === "executing") {
          console.log(`🔄 Detected crashed marathon ${state.id}, resuming...`);

          state.crashCount++;
          state.lastCrashAt = new Date().toISOString();
          state.status = "executing";

          const executor = new DurableMarathonExecutor(agent, apiKey, state);
          executor.emitEvent("recovering", {
            crashCount: state.crashCount,
            lastCheckpoint: state.actionCheckpoints[state.actionCheckpoints.length - 1]?.id,
          });

          return executor;
        }
      }
    } catch (e) {
      console.error("Failed to resume marathon:", e);
    }

    return null;
  }

  // === EXISTING METHODS (adapted) ===

  private buildExecutionPrompt(milestone: Milestone): string {
    return `You are an autonomous AI agent executing a specific milestone in a larger project.

PROJECT GOAL: ${this.state.plan.goal}

CURRENT MILESTONE: ${milestone.title}
DESCRIPTION: ${milestone.description}
EXPECTED ARTIFACTS: ${JSON.stringify(milestone.artifacts)}

PREVIOUS CONTEXT (Thought Signature):
${this.state.thoughtSignature}

WORKING DIRECTORY: ${this.state.workingDirectory}

Execute this milestone by:
1. Creating/modifying the necessary files
2. Running any required commands
3. Verifying the work is correct

Use the available tools to complete this task.
Be thorough but efficient. Focus only on this milestone.
After completing, summarize what you did.`;
  }

  private hashAction(milestoneId: string, response: string): string {
    const normalized = response
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[0-9]+/g, "N")
      .slice(0, 500);
    return createHash("md5").update(`${milestoneId}:${normalized}`).digest("hex").slice(0, 16);
  }

  private detectLoop(milestoneId: string, response: string): { isLoop: boolean; count: number } {
    const hash = this.hashAction(milestoneId, response);
    const now = Date.now();

    this.actionHistory.push({ action: milestoneId, hash, timestamp: now });

    if (this.actionHistory.length > this.ACTION_HISTORY_WINDOW) {
      this.actionHistory = this.actionHistory.slice(-this.ACTION_HISTORY_WINDOW);
    }

    const identicalCount = this.actionHistory.filter(a => a.hash === hash).length;

    return {
      isLoop: identicalCount >= this.MAX_IDENTICAL_ACTIONS,
      count: identicalCount,
    };
  }

  private async forceReplan(milestone: Milestone, loopCount: number): Promise<void> {
    this.log("warn", `Loop detected (${loopCount}x). Forcing replan...`, milestone.id);

    const replanPrompt = `CRITICAL: You are stuck in a loop, repeating the same action ${loopCount} times.

MILESTONE: ${milestone.title}
DESCRIPTION: ${milestone.description}

Try a COMPLETELY DIFFERENT strategy. DO NOT repeat the same actions.`;

    await this.agent.chat(replanPrompt, "marathon-executor", "main", "main");
    this.actionHistory = [];
  }

  private async verifyMilestone(milestone: Milestone): Promise<boolean> {
    if (milestone.verificationSteps.length === 0) {
      return milestone.artifacts.every(artifact =>
        existsSync(resolve(this.state.workingDirectory, artifact))
      );
    }

    const verificationPrompt = `Verify that milestone "${milestone.title}" was completed.
Expected artifacts: ${JSON.stringify(milestone.artifacts)}
Verification steps: ${JSON.stringify(milestone.verificationSteps)}

Run the verification steps and report as JSON:
{"passed": true/false, "summary": "Brief summary"}`;

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
    } catch {}

    return milestone.artifacts.every(artifact =>
      existsSync(resolve(this.state.workingDirectory, artifact))
    );
  }

  private async attemptRecovery(milestone: Milestone, error: string): Promise<void> {
    const recoveryPrompt = `A milestone failed. Analyze and attempt recovery.

MILESTONE: ${milestone.title}
ERROR: ${error}
ATTEMPT: ${milestone.retryCount} of ${milestone.maxRetries}

Analyze what went wrong and try a different approach.`;

    const response = await this.agent.chat(
      recoveryPrompt,
      "marathon-executor",
      "main",
      "main"
    );

    this.state.thoughtSignature = this.extractThoughtSignature(response.text);

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
      this.state.plan = updateMilestoneStatus(this.state.plan, milestone.id, "pending");
    }
  }

  private extractThoughtSignature(response: string): string {
    const lines = response.split("\n");
    const significantLines = lines.filter(
      line =>
        line.includes("created") ||
        line.includes("installed") ||
        line.includes("completed") ||
        line.includes("success")
    );

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      keyPoints: significantLines.slice(0, 15),
      artifactsCreated: this.state.artifacts,
      milestonesCompleted: this.state.plan.milestones
        .filter(m => m.status === "completed")
        .map(m => m.title),
      progress: `${this.state.plan.milestones.filter(m => m.status === "completed").length}/${this.state.plan.milestones.length}`,
    }, null, 2);
  }

  private calculateActualMinutes(milestone: Milestone): number {
    if (!milestone.startedAt) return milestone.estimatedMinutes;
    const start = new Date(milestone.startedAt);
    const end = new Date();
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  private log(level: MarathonLog["level"], message: string, milestone?: string): void {
    const log: MarathonLog = {
      timestamp: new Date().toISOString(),
      level,
      milestone,
      message,
    };
    this.state.logs.push(log);

    const colors = {
      info: "\x1b[36m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
      success: "\x1b[32m",
      thinking: "\x1b[35m",
    };
    const reset = "\x1b[0m";
    console.log(`${colors[level]}[DURABLE-MARATHON] ${message}${reset}`);
  }

  private async notifyMilestoneComplete(milestone: Milestone): Promise<void> {
    if (!this.state.notifications.enabled) return;

    const progress = getPlanProgress(this.state.plan);
    const message =
      `✅ *Milestone Completed*\n\n` +
      `*${milestone.title}*\n\n` +
      `Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)\n` +
      `Remaining: ~${progress.estimatedRemainingMinutes}min`;

    await this.sendNotifications(message);
  }

  private async notifyMilestoneFailure(milestone: Milestone, error: string): Promise<void> {
    if (!this.state.notifications.enabled) return;

    const progress = getPlanProgress(this.state.plan);
    const message =
      `❌ *Milestone Failed*\n\n` +
      `*${milestone.title}*\n\n` +
      `Error: ${error.slice(0, 200)}\n` +
      `Progress: ${progress.completed}/${progress.total}`;

    await this.sendNotifications(message);
  }

  private async notifyApprovalNeeded(request: ApprovalRequest): Promise<void> {
    const message =
      `⚠️ *Approval Required*\n\n` +
      `Action: ${request.action}\n` +
      `Description: ${request.description}\n` +
      `Risk: ${request.risk.toUpperCase()}\n\n` +
      `Reply with:\n` +
      `/approve ${request.id}\n` +
      `/reject ${request.id} [reason]`;

    await this.sendNotifications(message);
  }

  private async sendNotifications(message: string): Promise<void> {
    const { channels } = this.state.notifications;

    if (channels.telegram?.chatId) {
      try {
        await sendTelegramMessage(channels.telegram.chatId, message);
      } catch {}
    }

    if (channels.discord?.webhookUrl) {
      try {
        await fetch(channels.discord.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.replace(/\*/g, "**") }),
        });
      } catch {}
    }
  }

  private persistState(): void {
    try {
      writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("Failed to persist state:", e);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  pause(): void {
    this.paused = true;
  }

  abort(): void {
    this.aborted = true;
  }

  getState(): DurableMarathonState {
    return this.state;
  }
}
