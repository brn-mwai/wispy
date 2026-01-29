/**
 * Inter-agent collaboration protocol.
 *
 * Enables agents to pass tasks and context between each other. The collaboration
 * manager enforces chain depth limits to prevent infinite delegation loops.
 */

import type { Orchestrator, TaskAssignment } from "./orchestrator.js";
import { getAgentType } from "./workspace.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("collaboration");

export interface CollaborationResult {
  agentId: string;
  task: string;
  output: string;
  success: boolean;
  tokensUsed: number;
}

export interface CollaborationSession {
  id: string;
  initiator: string;
  tasks: TaskAssignment[];
  results: CollaborationResult[];
  depth: number;
  maxDepth: number;
  startedAt: string;
  completedAt?: string;
}

export class CollaborationManager {
  private orchestrator: Orchestrator;
  private maxChainDepth: number;
  private activeSessions = new Map<string, CollaborationSession>();

  constructor(orchestrator: Orchestrator, maxChainDepth: number = 5) {
    this.orchestrator = orchestrator;
    this.maxChainDepth = maxChainDepth;
  }

  /**
   * Start a collaboration session for a set of tasks.
   */
  createSession(
    initiator: string,
    tasks: TaskAssignment[]
  ): CollaborationSession {
    const session: CollaborationSession = {
      id: `collab-${Date.now()}`,
      initiator,
      tasks,
      results: [],
      depth: 0,
      maxDepth: this.maxChainDepth,
      startedAt: new Date().toISOString(),
    };

    this.activeSessions.set(session.id, session);
    log.info(
      "Collaboration session %s started: %d tasks from %s",
      session.id,
      tasks.length,
      initiator
    );

    return session;
  }

  /**
   * Record a result from an agent in a collaboration session.
   */
  recordResult(
    sessionId: string,
    result: CollaborationResult
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.results.push(result);
    this.orchestrator.recordMessage(
      result.agentId,
      session.initiator,
      result.output.slice(0, 1000)
    );

    log.debug(
      "Collab %s: %s completed task (%s)",
      sessionId,
      result.agentId,
      result.success ? "ok" : "failed"
    );
  }

  /**
   * Check if an agent can delegate further (chain depth limit).
   */
  canDelegate(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return true;
    return session.depth < session.maxDepth;
  }

  /**
   * Increment chain depth when a task is delegated.
   */
  incrementDepth(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.depth++;
      if (session.depth >= session.maxDepth) {
        log.warn("Collab %s: max chain depth reached (%d)", sessionId, session.maxDepth);
      }
    }
  }

  /**
   * Complete a collaboration session.
   */
  complete(sessionId: string): CollaborationSession | undefined {
    const session = this.activeSessions.get(sessionId);
    if (!session) return undefined;

    session.completedAt = new Date().toISOString();
    this.activeSessions.delete(sessionId);

    log.info(
      "Collab %s completed: %d/%d tasks succeeded",
      sessionId,
      session.results.filter((r) => r.success).length,
      session.tasks.length
    );

    return session;
  }

  /**
   * Build a summary of collaboration results for the user.
   */
  summarize(session: CollaborationSession): string {
    const lines: string[] = [];
    lines.push(`Collaboration: ${session.tasks.length} task(s)\n`);

    for (let i = 0; i < session.tasks.length; i++) {
      const task = session.tasks[i];
      const result = session.results[i];
      const agent = getAgentType(task.agentId);
      const agentName = agent?.name || task.agentId;

      if (result) {
        const status = result.success ? "done" : "failed";
        lines.push(`  ${i + 1}. [${agentName}] ${task.task} — ${status}`);
        if (result.output) {
          lines.push(`     ${result.output.slice(0, 200)}`);
        }
      } else {
        lines.push(`  ${i + 1}. [${agentName}] ${task.task} — pending`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get active session count.
   */
  get activeCount(): number {
    return this.activeSessions.size;
  }
}
