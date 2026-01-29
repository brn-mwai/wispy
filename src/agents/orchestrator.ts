/**
 * Multi-agent orchestrator.
 *
 * Routes user requests to the appropriate agent(s). When a task requires
 * multiple capabilities, the orchestrator coordinates collaboration between
 * agents, passing context and results through a message chain.
 */

import { getAgentType, getEnabledAgents, type WorkspaceConfig } from "./workspace.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("orchestrator");

// ─── Types ──────────────────────────────────────────────────

export interface TaskAssignment {
  agentId: string;
  task: string;
  dependsOn: number[];
  parallel: boolean;
}

export interface OrchestrationPlan {
  tasks: TaskAssignment[];
  reasoning: string;
}

export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  timestamp: string;
}

// ─── Orchestrator ───────────────────────────────────────────

export class Orchestrator {
  private workspace: WorkspaceConfig;
  private messageLog: AgentMessage[] = [];

  constructor(workspace: WorkspaceConfig) {
    this.workspace = workspace;
  }

  /**
   * Determine which agent should handle a user message.
   * Returns the best single agent for simple tasks, or a plan for complex tasks.
   */
  route(userMessage: string): {
    primaryAgent: string;
    plan?: OrchestrationPlan;
  } {
    const enabled = getEnabledAgents(this.workspace);
    if (enabled.length === 0) {
      return { primaryAgent: "coder" }; // fallback
    }

    const msg = userMessage.toLowerCase();

    // Simple routing based on intent signals
    if (this.isCodeTask(msg)) {
      return { primaryAgent: "coder" };
    }
    if (this.isResearchTask(msg)) {
      return { primaryAgent: "researcher" };
    }
    if (this.isWritingTask(msg)) {
      return { primaryAgent: this.hasAgent("writer") ? "writer" : "coder" };
    }
    if (this.isSecurityTask(msg)) {
      return { primaryAgent: this.hasAgent("security") ? "security" : "coder" };
    }
    if (this.isDevOpsTask(msg)) {
      return { primaryAgent: this.hasAgent("devops") ? "devops" : "coder" };
    }
    if (this.isDataTask(msg)) {
      return { primaryAgent: this.hasAgent("data") ? "data" : "coder" };
    }
    if (this.isDesignTask(msg)) {
      return { primaryAgent: this.hasAgent("designer") ? "designer" : "coder" };
    }

    // Complex task — check if planner should decompose
    if (this.isComplexTask(msg) && this.hasAgent("planner")) {
      return { primaryAgent: "planner" };
    }

    // Default to coder
    return { primaryAgent: "coder" };
  }

  /**
   * Record a message between agents for context passing.
   */
  recordMessage(from: string, to: string, content: string): void {
    if (this.messageLog.length > 100) {
      this.messageLog = this.messageLog.slice(-50);
    }
    this.messageLog.push({
      from,
      to,
      content: content.slice(0, 2000),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get recent messages relevant to an agent.
   */
  getContext(agentId: string, limit: number = 5): AgentMessage[] {
    return this.messageLog
      .filter((m) => m.to === agentId || m.from === agentId)
      .slice(-limit);
  }

  /**
   * Parse a planner's output into structured task assignments.
   */
  parsePlan(plannerOutput: string): OrchestrationPlan {
    const tasks: TaskAssignment[] = [];
    const lines = plannerOutput.split("\n").filter((l) => l.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const agentMatch = line.match(/\[agent:\s*(\w+)\]\s*(.+)/);
      if (agentMatch) {
        const dependsMatch = line.match(/depends on:\s*([\d,\s]+)/);
        const parallelMatch = line.match(/parallel with:\s*([\d,\s]+)/);

        tasks.push({
          agentId: agentMatch[1],
          task: agentMatch[2].replace(/\(.*\)/, "").trim(),
          dependsOn: dependsMatch
            ? dependsMatch[1].split(",").map((n) => parseInt(n.trim()) - 1)
            : [],
          parallel: !!parallelMatch,
        });
      }
    }

    return {
      tasks,
      reasoning: plannerOutput,
    };
  }

  // ─── Intent Detection ───────────────────────────────────

  private isCodeTask(msg: string): boolean {
    const signals = [
      "code", "function", "class", "component", "api", "endpoint",
      "bug", "fix", "error", "debug", "refactor", "test", "implement",
      "build", "create a", "write a", "generate", "typescript", "python",
      "javascript", "react", "next.js", "css", "html", "compile",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isResearchTask(msg: string): boolean {
    const signals = [
      "search", "find", "research", "what is", "how does",
      "compare", "analyze", "latest", "news", "trending",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isWritingTask(msg: string): boolean {
    const signals = [
      "write a blog", "draft", "article", "copy", "content",
      "email", "newsletter", "post", "tweet", "documentation",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isSecurityTask(msg: string): boolean {
    const signals = [
      "security", "vulnerability", "audit", "owasp", "penetration",
      "credential", "leak", "injection", "xss", "csrf",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isDevOpsTask(msg: string): boolean {
    const signals = [
      "deploy", "docker", "ci/cd", "pipeline", "kubernetes",
      "nginx", "ssl", "dns", "server", "infrastructure",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isDataTask(msg: string): boolean {
    const signals = [
      "data", "sql", "query", "database", "csv", "analytics",
      "chart", "graph", "statistics", "metric",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isDesignTask(msg: string): boolean {
    const signals = [
      "design", "ui", "ux", "layout", "mockup", "wireframe",
      "color", "typography", "accessibility", "responsive",
    ];
    return signals.some((s) => msg.includes(s));
  }

  private isComplexTask(msg: string): boolean {
    return (
      msg.length > 100 ||
      msg.includes(" and ") ||
      msg.includes("with") ||
      msg.includes("including") ||
      msg.includes("full") ||
      msg.includes("complete")
    );
  }

  private hasAgent(id: string): boolean {
    const conf = this.workspace.agents[id];
    return !!conf?.enabled && !!getAgentType(id);
  }
}
