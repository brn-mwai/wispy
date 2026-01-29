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
