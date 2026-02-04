/**
 * Marathon Agent Types
 * Autonomous multi-day task execution with Gemini 3
 */

export type MarathonStatus =
  | "planning"
  | "executing"
  | "verifying"
  | "paused"
  | "completed"
  | "failed"
  | "waiting_human";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "ultra";

export interface Milestone {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  dependencies: string[];
  estimatedMinutes: number;
  actualMinutes?: number;
  startedAt?: string;
  completedAt?: string;
  artifacts: string[]; // Files created
  verificationSteps: string[];
  verificationPassed?: boolean;
  errorLog?: string;
  retryCount: number;
  maxRetries: number;
}

export interface MarathonPlan {
  id: string;
  goal: string;
  context: string;
  milestones: Milestone[];
  currentMilestoneIndex: number;
  thinkingStrategy: {
    planning: ThinkingLevel;
    execution: ThinkingLevel;
    verification: ThinkingLevel;
    recovery: ThinkingLevel;
  };
  createdAt: string;
  estimatedTotalMinutes: number;
}

export interface MarathonState {
  id: string;
  plan: MarathonPlan;
  status: MarathonStatus;
  startedAt: string;
  pausedAt?: string;
  completedAt?: string;
  totalTokensUsed: number;
  totalCost: number;
  thoughtSignature: string; // Serialized reasoning state for continuity
  workingDirectory: string;
  artifacts: string[];
  logs: MarathonLog[];
  humanInputQueue: HumanInputRequest[];
  notifications: NotificationConfig;
  checkpoints: Checkpoint[];
}

export interface MarathonLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "success" | "thinking";
  milestone?: string;
  message: string;
  details?: unknown;
}

export interface HumanInputRequest {
  id: string;
  milestone: string;
  question: string;
  options?: string[];
  required: boolean;
  createdAt: string;
  response?: string;
  respondedAt?: string;
}

export interface NotificationConfig {
  enabled: boolean;
  channels: {
    telegram?: { chatId: string };
    discord?: { webhookUrl: string };
    slack?: { webhookUrl: string };
    email?: { address: string };
    whatsapp?: { jid: string };
  };
  notifyOn: {
    milestoneComplete: boolean;
    milestoneFailure: boolean;
    humanInputNeeded: boolean;
    marathonComplete: boolean;
    dailySummary: boolean;
  };
}

export interface Checkpoint {
  id: string;
  milestoneId: string;
  createdAt: string;
  thoughtSignature: string;
  filesSnapshot: Record<string, string>; // path -> hash
  canRestore: boolean;
}

export interface MarathonResult {
  success: boolean;
  completedMilestones: number;
  totalMilestones: number;
  artifacts: string[];
  totalTime: number;
  totalCost: number;
  summary: string;
  deploymentUrl?: string;
}

// ============================================
// DURABLE AGENT TYPES
// ============================================

/**
 * Fine-grained checkpoint after every tool execution
 * Enables resume from exact point of failure
 */
export interface ActionCheckpoint {
  id: string;
  timestamp: string;
  milestoneId: string;
  actionIndex: number;
  toolName: string;
  toolArgs: unknown;
  toolResult?: unknown;
  thoughtSignature: string;
  filesChanged: string[];
  status: "pending" | "completed" | "failed";
}

/**
 * Heartbeat configuration for crash detection
 */
export interface HeartbeatConfig {
  enabled: boolean;
  intervalMs: number;        // How often to send heartbeat (default: 30000)
  timeoutMs: number;         // How long before considered dead (default: 120000)
  lastHeartbeat?: string;
  lastAction?: string;
}

/**
 * Human approval request for sensitive actions
 */
export interface ApprovalRequest {
  id: string;
  timestamp: string;
  milestoneId: string;
  action: string;
  description: string;
  risk: "low" | "medium" | "high" | "critical";
  autoApproveAfterMs?: number;  // Auto-approve after timeout
  expiresAt?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: string;
  reason?: string;
}

/**
 * Sensitive action patterns that require human approval
 */
export interface ApprovalPolicy {
  enabled: boolean;
  requireApprovalFor: {
    fileDelete: boolean;
    bashCommands: string[];    // Regex patterns like "rm -rf", "git push"
    apiCalls: string[];        // URLs or patterns
    payments: boolean;
    externalMessages: boolean;
  };
  autoApproveTimeout?: number;  // Ms before auto-approve (0 = never)
  notifyChannels: string[];     // Which channels to notify for approval
}

/**
 * Real-time streaming configuration
 */
export interface StreamConfig {
  enabled: boolean;
  targets: {
    console: boolean;
    file: boolean;          // Stream to log file
    telegram?: string;      // Chat ID for live updates
    websocket?: string;     // WebSocket URL
    webhook?: string;       // HTTP webhook URL
  };
  throttleMs: number;       // Min ms between updates (prevent spam)
  includeThinking: boolean; // Include AI thinking in stream
}

/**
 * Extended Marathon state for durable agents
 */
export interface DurableMarathonState extends MarathonState {
  // Heartbeat for crash detection
  heartbeat: HeartbeatConfig;

  // Fine-grained action checkpoints (not just milestones)
  actionCheckpoints: ActionCheckpoint[];

  // Pending approval requests
  approvalRequests: ApprovalRequest[];
  approvalPolicy: ApprovalPolicy;

  // Streaming config
  streaming: StreamConfig;

  // Recovery metadata
  crashCount: number;
  lastCrashAt?: string;
  autoResumeEnabled: boolean;

  // Process info for watchdog
  processId?: number;
  startedByHost?: string;
}

/**
 * Marathon event for streaming
 */
export type MarathonEventType =
  | "started"
  | "milestone_started"
  | "milestone_completed"
  | "milestone_failed"
  | "action_started"
  | "action_completed"
  | "tool_executing"
  | "tool_completed"
  | "thinking"
  | "approval_needed"
  | "approval_granted"
  | "approval_rejected"
  | "paused"
  | "resumed"
  | "checkpoint_created"
  | "heartbeat"
  | "crash_detected"
  | "recovering"
  | "completed"
  | "failed";

export interface MarathonEvent {
  type: MarathonEventType;
  timestamp: string;
  marathonId: string;
  milestoneId?: string;
  data: unknown;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}
