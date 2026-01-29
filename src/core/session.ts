import { resolve } from "path";
import { existsSync } from "fs";
import { readJSON, writeJSON, appendJSONL, readJSONL, ensureDir } from "../utils/file.js";
import { buildSessionKey, type SessionType } from "../security/isolation.js";

export interface SessionMessage {
  role: "user" | "model" | "system";
  content: string;
  timestamp: string;
  channel?: string;
  peerId?: string;
  thinking?: string;
  toolCalls?: unknown[];
}

export interface SessionMetadata {
  sessionKey: string;
  sessionType: SessionType;
  agentId: string;
  peerId: string;
  channel: string;
  createdAt: string;
  lastActiveAt: string;
  lastActive?: string; // Backwards compatibility alias
  messageCount: number;
  // MoltBot-style session statistics
  stats?: SessionStats;
}

export interface SessionStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  toolCalls: number;
  lastResetAt?: string;
}

export interface SessionRegistry {
  sessions: Record<string, SessionMetadata>;
}

export function getSessionsDir(runtimeDir: string, agentId: string): string {
  return resolve(runtimeDir, "agents", agentId, "sessions");
}

function getRegistryPath(runtimeDir: string, agentId: string): string {
  return resolve(getSessionsDir(runtimeDir, agentId), "index.json");
}

function getHistoryPath(runtimeDir: string, agentId: string, sessionKey: string): string {
  const safe = sessionKey.replace(/[/:]/g, "_");
  return resolve(getSessionsDir(runtimeDir, agentId), `${safe}.jsonl`);
}

export function loadRegistry(runtimeDir: string, agentId: string): SessionRegistry {
  const path = getRegistryPath(runtimeDir, agentId);
  return readJSON<SessionRegistry>(path) || { sessions: {} };
}

function saveRegistry(runtimeDir: string, agentId: string, reg: SessionRegistry) {
  ensureDir(getSessionsDir(runtimeDir, agentId));
  writeJSON(getRegistryPath(runtimeDir, agentId), reg);
}

export function getOrCreateSession(
  runtimeDir: string,
  agentId: string,
  sessionType: SessionType,
  peerId: string,
  channel: string
): SessionMetadata {
  const key = buildSessionKey(agentId, sessionType, peerId);
  const reg = loadRegistry(runtimeDir, agentId);

  if (reg.sessions[key]) {
    reg.sessions[key].lastActiveAt = new Date().toISOString();
    saveRegistry(runtimeDir, agentId, reg);
    return reg.sessions[key];
  }

  const meta: SessionMetadata = {
    sessionKey: key,
    sessionType,
    agentId,
    peerId,
    channel,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    messageCount: 0,
  };

  reg.sessions[key] = meta;
  saveRegistry(runtimeDir, agentId, reg);
  return meta;
}

export function appendMessage(
  runtimeDir: string,
  agentId: string,
  sessionKey: string,
  message: SessionMessage
) {
  const path = getHistoryPath(runtimeDir, agentId, sessionKey);
  appendJSONL(path, message);

  // Update count
  const reg = loadRegistry(runtimeDir, agentId);
  if (reg.sessions[sessionKey]) {
    reg.sessions[sessionKey].messageCount++;
    reg.sessions[sessionKey].lastActiveAt = new Date().toISOString();
    saveRegistry(runtimeDir, agentId, reg);
  }
}

export function loadHistory(
  runtimeDir: string,
  agentId: string,
  sessionKey: string,
  maxMessages: number = 50
): SessionMessage[] {
  const path = getHistoryPath(runtimeDir, agentId, sessionKey);
  const all = readJSONL<SessionMessage>(path);
  // Keep only recent messages to prevent context overflow
  if (all.length > maxMessages) {
    return all.slice(-maxMessages);
  }
  return all;
}

export function clearHistory(
  runtimeDir: string,
  agentId: string,
  sessionKey: string
): void {
  const { writeFileSync } = require("fs");
  const path = getHistoryPath(runtimeDir, agentId, sessionKey);
  writeFileSync(path, "", "utf-8");

  // Reset message count and stats
  const reg = loadRegistry(runtimeDir, agentId);
  if (reg.sessions[sessionKey]) {
    reg.sessions[sessionKey].messageCount = 0;
    reg.sessions[sessionKey].stats = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      toolCalls: 0,
      lastResetAt: new Date().toISOString(),
    };
    saveRegistry(runtimeDir, agentId, reg);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MoltBot-style Session Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update session statistics (tokens, cost, tool calls).
 */
export function updateSessionStats(
  runtimeDir: string,
  agentId: string,
  sessionKey: string,
  update: {
    inputTokens?: number;
    outputTokens?: number;
    toolCalls?: number;
  }
): void {
  const reg = loadRegistry(runtimeDir, agentId);
  if (!reg.sessions[sessionKey]) return;

  const session = reg.sessions[sessionKey];
  if (!session.stats) {
    session.stats = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      toolCalls: 0,
    };
  }

  if (update.inputTokens) {
    session.stats.inputTokens += update.inputTokens;
    session.stats.totalTokens += update.inputTokens;
  }
  if (update.outputTokens) {
    session.stats.outputTokens += update.outputTokens;
    session.stats.totalTokens += update.outputTokens;
  }
  if (update.toolCalls) {
    session.stats.toolCalls += update.toolCalls;
  }

  // Estimate cost (Gemini 2.5 Flash pricing as baseline)
  // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens
  session.stats.estimatedCost =
    (session.stats.inputTokens * 0.000000075) +
    (session.stats.outputTokens * 0.0000003);

  saveRegistry(runtimeDir, agentId, reg);
}

/**
 * Get session statistics.
 */
export function getSessionStats(
  runtimeDir: string,
  agentId: string,
  sessionKey: string
): SessionStats | null {
  const reg = loadRegistry(runtimeDir, agentId);
  return reg.sessions[sessionKey]?.stats || null;
}

/**
 * Check if session should be reset based on idle window or daily reset.
 */
export function shouldResetSession(
  session: SessionMetadata,
  config: { dailyReset?: boolean; resetHour?: number; idleWindowMinutes?: number }
): { shouldReset: boolean; reason?: string } {
  const now = new Date();
  const lastActive = new Date(session.lastActiveAt || session.lastActive || session.createdAt);

  // Check idle window (default 60 minutes)
  const idleMinutes = config.idleWindowMinutes ?? 60;
  const idleMs = now.getTime() - lastActive.getTime();
  if (idleMs > idleMinutes * 60 * 1000) {
    return { shouldReset: true, reason: `Idle for ${Math.round(idleMs / 60000)} minutes` };
  }

  // Check daily reset
  if (config.dailyReset) {
    const resetHour = config.resetHour ?? 4; // Default 4 AM
    const lastActiveDate = lastActive.toDateString();
    const todayDate = now.toDateString();

    if (lastActiveDate !== todayDate && now.getHours() >= resetHour) {
      return { shouldReset: true, reason: "Daily reset" };
    }
  }

  return { shouldReset: false };
}

/**
 * Export session to JSON format.
 */
export function exportSession(
  runtimeDir: string,
  agentId: string,
  sessionKey: string
): { metadata: SessionMetadata; history: SessionMessage[] } | null {
  const reg = loadRegistry(runtimeDir, agentId);
  const session = reg.sessions[sessionKey];
  if (!session) return null;

  const history = loadHistory(runtimeDir, agentId, sessionKey, 1000);
  return { metadata: session, history };
}

/**
 * Import session from exported JSON.
 */
export function importSession(
  runtimeDir: string,
  agentId: string,
  sessionKey: string,
  data: { metadata: SessionMetadata; history: SessionMessage[] }
): void {
  const reg = loadRegistry(runtimeDir, agentId);

  // Create session metadata
  reg.sessions[sessionKey] = {
    ...data.metadata,
    sessionKey,
    agentId,
    lastActiveAt: new Date().toISOString(),
  };
  saveRegistry(runtimeDir, agentId, reg);

  // Write history
  for (const msg of data.history) {
    appendMessage(runtimeDir, agentId, sessionKey, msg);
  }
}

/**
 * Delete a session entirely.
 */
export function deleteSession(
  runtimeDir: string,
  agentId: string,
  sessionKey: string
): boolean {
  const { unlinkSync, existsSync } = require("fs");
  const reg = loadRegistry(runtimeDir, agentId);

  if (!reg.sessions[sessionKey]) return false;

  // Remove history file
  const historyPath = getHistoryPath(runtimeDir, agentId, sessionKey);
  if (existsSync(historyPath)) {
    try {
      unlinkSync(historyPath);
    } catch { /* ignore */ }
  }

  // Remove from registry
  delete reg.sessions[sessionKey];
  saveRegistry(runtimeDir, agentId, reg);

  return true;
}

/**
 * List all sessions with optional filtering.
 */
export function listSessions(
  runtimeDir: string,
  agentId: string,
  options?: {
    channel?: string;
    limit?: number;
    sortBy?: "lastActive" | "messageCount" | "created";
  }
): SessionMetadata[] {
  const reg = loadRegistry(runtimeDir, agentId);
  let sessions = Object.values(reg.sessions);

  // Filter by channel
  if (options?.channel) {
    sessions = sessions.filter(s => s.channel === options.channel);
  }

  // Sort
  const sortBy = options?.sortBy || "lastActive";
  sessions.sort((a, b) => {
    if (sortBy === "lastActive") {
      return new Date(b.lastActiveAt || b.lastActive || "").getTime() -
             new Date(a.lastActiveAt || a.lastActive || "").getTime();
    } else if (sortBy === "messageCount") {
      return (b.messageCount || 0) - (a.messageCount || 0);
    } else {
      return new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime();
    }
  });

  // Limit
  if (options?.limit) {
    sessions = sessions.slice(0, options.limit);
  }

  return sessions;
}

/**
 * Get session by key.
 */
export function getSession(
  runtimeDir: string,
  agentId: string,
  sessionKey: string
): SessionMetadata | null {
  const reg = loadRegistry(runtimeDir, agentId);
  return reg.sessions[sessionKey] || null;
}
