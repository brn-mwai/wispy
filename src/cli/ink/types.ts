/**
 * Shared types for the Ink-based CLI UI.
 */

export interface ToolCallData {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultData {
  name: string;
  result: string;
  durationMs: number;
  isError: boolean;
}

export interface StatsData {
  model: string;
  tokens: number;
  cost: number;
  contextPercent: number;
  elapsed: string;
  mode?: string;
  backend?: string;
}

export interface X402DashboardData {
  walletAddress: string;
  explorerUrl: string;
  usdcBalance: string;
  dailySpent: number;
  dailyLimit: number;
  budgetRemaining: number;
  recentPayments: Array<{
    service: string;
    amount: number;
    txHash: string;
    status: string;
    timestamp: string;
  }>;
}

export interface X402PaymentData {
  service: string;
  amount: number;
  txHash: string;
  recipient: string;
  status: string;
  explorerLink: string;
  timestamp: string;
}

export type HistoryEntry =
  | { id: string; type: "banner"; model: string; provider: string; cwd: string; vertexai: boolean; channels?: string[] }
  | { id: string; type: "separator" }
  | { id: string; type: "user-input"; text: string }
  | { id: string; type: "tool-call"; data: ToolCallData }
  | { id: string; type: "tool-result"; data: ToolResultData }
  | { id: string; type: "thinking"; text: string }
  | { id: string; type: "response"; text: string }
  | { id: string; type: "stats"; data: StatsData }
  | { id: string; type: "error"; message: string }
  | { id: string; type: "context-compacted" }
  | { id: string; type: "image-attached"; count: number }
  | { id: string; type: "cross-channel"; source: string; text: string; isVoice?: boolean }
  | { id: string; type: "marathon-progress"; event: string; milestone: string; progress: number; total: number }
  | { id: string; type: "x402-dashboard"; data: X402DashboardData }
  | { id: string; type: "x402-payment"; data: X402PaymentData }
  | { id: string; type: "verbose-toggle"; enabled: boolean };

/** Distributive Omit for discriminated unions */
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/** A history entry without the `id` field (for creating new entries) */
export type NewHistoryEntry = DistributiveOmit<HistoryEntry, "id">;
