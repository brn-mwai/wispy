/**
 * A2A Protocol - Google Agent-to-Agent Communication
 *
 * Implements the official Google A2A protocol for agent discovery,
 * communication, and task delegation across organizational boundaries.
 * Uses @lucid-agents/a2a SDK for spec compliance.
 *
 * Spec: https://a2a-protocol.org/latest/
 */

import { signPayload, verifySignature, type DeviceIdentity } from "../security/device-identity.js";
import { createLogger } from "../infra/logger.js";
import { EventEmitter } from "events";
import {
  fetchAgentCard as fetchA2ACard,
  parseAgentCard,
  findSkill,
} from "@lucid-agents/a2a";

const log = createLogger("a2a");

// ==================== A2A TYPES ====================

/**
 * Agent Card - Published at /.well-known/agent.json
 */
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication?: {
    schemes: ("bearer" | "apiKey" | "oauth2")[];
  };
  defaultInputModes: ("text" | "image" | "audio" | "video")[];
  defaultOutputModes: ("text" | "image" | "audio" | "video")[];
  skills: AgentSkill[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

/**
 * Task Lifecycle States
 */
export type TaskStatus =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

/**
 * Message Part - Content within a message
 */
export interface MessagePart {
  type: "text" | "file" | "data";
  text?: string;
  mimeType?: string;
  data?: string; // base64 encoded
  uri?: string;
}

/**
 * A2A Message - Communication unit
 */
export interface A2AMessage {
  role: "user" | "agent";
  parts: MessagePart[];
  metadata?: Record<string, unknown>;
}

/**
 * Task - Unit of work in A2A
 */
export interface A2ATask {
  id: string;
  sessionId?: string;
  status: TaskStatus;
  message: A2AMessage;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
}

/**
 * Artifact - Output from task execution
 */
export interface A2AArtifact {
  name?: string;
  description?: string;
  parts: MessagePart[];
}

/**
 * Task Update Event - SSE event for streaming
 */
export interface TaskUpdateEvent {
  id: string;
  status: TaskStatus;
  message?: A2AMessage;
  artifact?: A2AArtifact;
  final?: boolean;
}

// ==================== LEGACY COMPAT ====================

/** @deprecated Use A2AMessage instead */
export interface LegacyA2AMessage {
  type: "task_request" | "task_response" | "capability_query" | "capability_response" | "ping" | "pong";
  from: { deviceId: string; publicKey: string; name: string };
  to: { deviceId: string };
  payload: unknown;
  timestamp: string;
  signature: string;
}

export function createA2AMessage(
  identity: DeviceIdentity,
  agentName: string,
  toDeviceId: string,
  type: LegacyA2AMessage["type"],
  payload: unknown
): LegacyA2AMessage {
  const msg: Omit<LegacyA2AMessage, "signature"> = {
    type,
    from: {
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      name: agentName,
    },
    to: { deviceId: toDeviceId },
    payload,
    timestamp: new Date().toISOString(),
  };

  const signature = signPayload(identity, JSON.stringify(msg));
  return { ...msg, signature };
}

export function verifyA2AMessage(message: LegacyA2AMessage): boolean {
  const { signature, ...rest } = message;
  return verifySignature(
    message.from.publicKey,
    JSON.stringify(rest),
    signature
  );
}

// ==================== A2A CLIENT ====================

export interface A2AClientOptions {
  timeout?: number;
  authToken?: string;
}

export class A2AClient extends EventEmitter {
  private baseUrl: string;
  private options: A2AClientOptions;
  private agentCard: AgentCard | null = null;

  constructor(baseUrl: string, options: A2AClientOptions = {}) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.options = {
      timeout: options.timeout || 60000,
      ...options,
    };
  }

  /**
   * Discover agent capabilities
   * Uses @lucid-agents/a2a SDK for spec-compliant discovery
   */
  async discover(): Promise<AgentCard> {
    try {
      // Use SDK's fetchAgentCard for spec compliance
      const lucidCard = await fetchA2ACard(this.baseUrl) as any;

      // Convert to our AgentCard format
      this.agentCard = {
        name: lucidCard.name,
        description: lucidCard.description || "",
        url: lucidCard.url || this.baseUrl,
        version: lucidCard.version || "1.0.0",
        capabilities: {
          streaming: lucidCard.capabilities?.streaming,
          pushNotifications: lucidCard.capabilities?.pushNotifications,
          stateTransitionHistory: lucidCard.capabilities?.stateTransitionHistory,
        },
        defaultInputModes: (lucidCard.defaultInputModes as any) || ["text"],
        defaultOutputModes: (lucidCard.defaultOutputModes as any) || ["text"],
        skills: (lucidCard.skills || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
      };

      log.info("Discovered agent: %s v%s", this.agentCard.name, this.agentCard.version);
      return this.agentCard;
    } catch (err) {
      // Fallback to direct fetch if SDK fails
      const response = await fetch(`${this.baseUrl}/.well-known/agent.json`, {
        signal: AbortSignal.timeout(this.options.timeout!),
      });

      if (!response.ok) {
        throw new Error(`Agent discovery failed: ${response.status}`);
      }

      this.agentCard = await response.json();
      log.info("Discovered agent (fallback): %s v%s", this.agentCard!.name, this.agentCard!.version);
      return this.agentCard!;
    }
  }

  /**
   * Send a task to the agent
   */
  async sendTask(params: {
    message: A2AMessage;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<A2ATask> {
    const response = await fetch(`${this.baseUrl}/task/send`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        message: params.message,
        sessionId: params.sessionId,
        metadata: params.metadata,
      }),
      signal: AbortSignal.timeout(this.options.timeout!),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Task send failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Get task status
   */
  async getTask(taskId: string): Promise<A2ATask> {
    const response = await fetch(`${this.baseUrl}/task/get?id=${taskId}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(this.options.timeout!),
    });

    if (!response.ok) {
      throw new Error(`Task get failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<A2ATask> {
    const response = await fetch(`${this.baseUrl}/task/cancel`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ id: taskId }),
      signal: AbortSignal.timeout(this.options.timeout!),
    });

    if (!response.ok) {
      throw new Error(`Task cancel failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Subscribe to task updates (streaming)
   */
  async *subscribeToTask(params: {
    message: A2AMessage;
    sessionId?: string;
  }): AsyncGenerator<TaskUpdateEvent> {
    const response = await fetch(`${this.baseUrl}/task/sendSubscribe`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        message: params.message,
        sessionId: params.sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Task subscribe failed: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;

          try {
            const event: TaskUpdateEvent = JSON.parse(data);
            yield event;

            if (event.final) return;
          } catch (e) {
            log.warn("Failed to parse SSE event: %s", data);
          }
        }
      }
    }
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(
    taskId: string,
    options?: {
      pollingInterval?: number;
      timeout?: number;
      onUpdate?: (task: A2ATask) => void;
    }
  ): Promise<A2ATask> {
    const interval = options?.pollingInterval || 1000;
    const timeout = options?.timeout || 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const task = await this.getTask(taskId);

      if (options?.onUpdate) {
        options.onUpdate(task);
      }

      if (task.status === "completed" || task.status === "failed" || task.status === "canceled") {
        return task;
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Task ${taskId} timed out`);
  }

  /**
   * Simple text delegation
   */
  async delegateTask(
    instruction: string,
    context?: string
  ): Promise<A2ATask> {
    const message: A2AMessage = {
      role: "user",
      parts: [{ type: "text", text: instruction }],
      metadata: context ? { context } : undefined,
    };

    const task = await this.sendTask({ message });
    return this.waitForCompletion(task.id);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.options.authToken) {
      headers["Authorization"] = `Bearer ${this.options.authToken}`;
    }

    return headers;
  }
}

// ==================== A2A SERVER ====================

export interface TaskHandler {
  (task: A2ATask): Promise<{
    status: TaskStatus;
    message?: A2AMessage;
    artifacts?: A2AArtifact[];
  }>;
}

export interface A2AServerOptions {
  agentCard: AgentCard;
  taskHandler: TaskHandler;
}

export function createAgentCard(config: {
  name: string;
  description: string;
  url: string;
  version: string;
  skills?: AgentSkill[];
}): AgentCard {
  return {
    name: config.name,
    description: config.description,
    url: config.url,
    version: config.version,
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: config.skills || [
      {
        id: "chat",
        name: "Chat",
        description: "General conversation and assistance",
      },
      {
        id: "marathon",
        name: "Marathon Mode",
        description: "Multi-day autonomous task execution",
      },
    ],
  };
}

// Legacy exports for compatibility
export interface TaskRequest {
  taskId: string;
  instruction: string;
  context?: string;
  timeout?: number;
}

export interface TaskResponse {
  taskId: string;
  status: "completed" | "failed" | "rejected";
  result?: string;
  error?: string;
}

export interface CapabilityResponse {
  name: string;
  skills: string[];
  channels: string[];
  models: string[];
}
