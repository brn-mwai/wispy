/**
 * Context Isolator - Prevents task context bleeding
 *
 * Ensures each task/prompt is handled in isolation without
 * mixing context from previous unrelated tasks.
 */

import { createLogger } from "../infra/logger.js";

const log = createLogger("context-isolator");

export interface TaskContext {
  id: string;
  type: "conversation" | "task" | "background_task" | "one_shot";
  topic: string;
  startedAt: Date;
  status: "active" | "completed" | "cancelled" | "paused";
  peerId: string;
  channel: string;
  messageCount: number;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface ContextBoundary {
  previousTaskId?: string;
  newTaskId: string;
  reason: string;
  timestamp: Date;
}

// Active tasks per user
const activeTasks = new Map<string, TaskContext>();
// Task history per user (last 10 tasks)
const taskHistory = new Map<string, TaskContext[]>();
// Cancelled task IDs
const cancelledTasks = new Set<string>();
// Context boundaries
const contextBoundaries = new Map<string, ContextBoundary[]>();

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get user key from peerId and channel
 */
function getUserKey(peerId: string, channel: string): string {
  return `${channel}:${peerId}`;
}

/**
 * Detect if a message is starting a new task or continuing
 */
export function detectTaskBoundary(
  message: string,
  currentTask: TaskContext | undefined
): { isNewTask: boolean; reason: string; suggestedTopic: string } {
  const lowerMsg = message.toLowerCase().trim();

  // Explicit new task indicators
  const newTaskPhrases = [
    "new task", "different task", "another thing", "something else",
    "forget that", "never mind", "cancel that", "stop that",
    "let's do", "can you", "i want you to", "please help me",
    "start fresh", "new topic", "change of plans"
  ];

  // Explicit continuation indicators
  const continuePhrases = [
    "continue", "keep going", "what's next", "and then",
    "also", "additionally", "furthermore", "now",
    "after that", "following up", "regarding that"
  ];

  // Check for cancellation
  const cancelPhrases = ["stop", "cancel", "halt", "abort", "quit", "end this"];
  const isCancel = cancelPhrases.some(p => lowerMsg.includes(p));
  if (isCancel && currentTask) {
    return { isNewTask: true, reason: "User requested cancellation", suggestedTopic: "cancelled_task" };
  }

  // Check for explicit new task
  const hasNewTaskPhrase = newTaskPhrases.some(p => lowerMsg.includes(p));
  if (hasNewTaskPhrase) {
    // Extract topic from message
    const topic = extractTopic(message);
    return { isNewTask: true, reason: "Explicit new task request", suggestedTopic: topic };
  }

  // Check for continuation
  const hasContinuePhrase = continuePhrases.some(p => lowerMsg.startsWith(p) || lowerMsg.includes(p));
  if (hasContinuePhrase && currentTask) {
    return { isNewTask: false, reason: "Continuation phrase detected", suggestedTopic: currentTask.topic };
  }

  // Time-based boundary (if more than 30 minutes since last activity)
  if (currentTask) {
    const timeSinceLastActivity = Date.now() - currentTask.lastActivity.getTime();
    if (timeSinceLastActivity > 30 * 60 * 1000) {
      const topic = extractTopic(message);
      return { isNewTask: true, reason: "Session timeout (30 min)", suggestedTopic: topic };
    }
  }

  // Semantic similarity check - if message is completely different topic
  if (currentTask && isTopicShift(message, currentTask.topic)) {
    const topic = extractTopic(message);
    return { isNewTask: true, reason: "Topic shift detected", suggestedTopic: topic };
  }

  // Default: continue current task or start new if none
  if (!currentTask) {
    const topic = extractTopic(message);
    return { isNewTask: true, reason: "No active task", suggestedTopic: topic };
  }

  return { isNewTask: false, reason: "Continuing current task", suggestedTopic: currentTask.topic };
}

/**
 * Extract topic from message
 */
function extractTopic(message: string): string {
  // Simple extraction - first 50 chars or first sentence
  const firstSentence = message.split(/[.!?]/)[0];
  const topic = firstSentence.slice(0, 50).trim();
  return topic || "general_conversation";
}

/**
 * Check if message represents a topic shift
 */
function isTopicShift(message: string, currentTopic: string): boolean {
  const lowerMsg = message.toLowerCase();
  const lowerTopic = currentTopic.toLowerCase();

  // Check for common keywords overlap
  const msgWords = new Set(lowerMsg.split(/\s+/).filter(w => w.length > 3));
  const topicWords = lowerTopic.split(/\s+/).filter(w => w.length > 3);

  let overlap = 0;
  for (const word of topicWords) {
    if (msgWords.has(word)) overlap++;
  }

  // If less than 20% word overlap, consider it a topic shift
  const overlapRatio = topicWords.length > 0 ? overlap / topicWords.length : 0;
  return overlapRatio < 0.2 && topicWords.length > 2;
}

/**
 * Start a new task context
 */
export function startTask(
  peerId: string,
  channel: string,
  topic: string,
  type: TaskContext["type"] = "conversation",
  metadata?: Record<string, unknown>
): TaskContext {
  const userKey = getUserKey(peerId, channel);
  const currentTask = activeTasks.get(userKey);

  // Archive current task if exists
  if (currentTask && currentTask.status === "active") {
    currentTask.status = "completed";
    addToHistory(userKey, currentTask);
  }

  const newTask: TaskContext = {
    id: generateTaskId(),
    type,
    topic,
    startedAt: new Date(),
    status: "active",
    peerId,
    channel,
    messageCount: 0,
    lastActivity: new Date(),
    metadata,
  };

  activeTasks.set(userKey, newTask);

  // Record boundary
  const boundaries = contextBoundaries.get(userKey) || [];
  boundaries.push({
    previousTaskId: currentTask?.id,
    newTaskId: newTask.id,
    reason: `New task: ${topic}`,
    timestamp: new Date(),
  });
  if (boundaries.length > 20) boundaries.shift();
  contextBoundaries.set(userKey, boundaries);

  log.info("Started new task: %s (%s) for %s", newTask.id, topic, userKey);
  return newTask;
}

/**
 * Get current active task
 */
export function getCurrentTask(peerId: string, channel: string): TaskContext | undefined {
  const userKey = getUserKey(peerId, channel);
  return activeTasks.get(userKey);
}

/**
 * Update task activity
 */
export function updateTaskActivity(peerId: string, channel: string): void {
  const userKey = getUserKey(peerId, channel);
  const task = activeTasks.get(userKey);
  if (task) {
    task.lastActivity = new Date();
    task.messageCount++;
  }
}

/**
 * Cancel current task
 */
export function cancelTask(peerId: string, channel: string): boolean {
  const userKey = getUserKey(peerId, channel);
  const task = activeTasks.get(userKey);
  if (task) {
    task.status = "cancelled";
    cancelledTasks.add(task.id);
    addToHistory(userKey, task);
    activeTasks.delete(userKey);
    log.info("Cancelled task: %s for %s", task.id, userKey);
    return true;
  }
  return false;
}

/**
 * Fully reset all context for a user (for /clear command)
 */
export function resetUserContext(peerId: string, channel: string): void {
  const userKey = getUserKey(peerId, channel);

  // Clear active task
  const task = activeTasks.get(userKey);
  if (task) {
    cancelledTasks.add(task.id);
  }
  activeTasks.delete(userKey);

  // Clear task history
  taskHistory.delete(userKey);

  // Clear context boundaries
  contextBoundaries.delete(userKey);

  log.info("Fully reset context for user: %s", userKey);
}

/**
 * Check if a task was cancelled
 */
export function isTaskCancelled(taskId: string): boolean {
  return cancelledTasks.has(taskId);
}

/**
 * Complete current task
 */
export function completeTask(peerId: string, channel: string): void {
  const userKey = getUserKey(peerId, channel);
  const task = activeTasks.get(userKey);
  if (task) {
    task.status = "completed";
    addToHistory(userKey, task);
    activeTasks.delete(userKey);
    log.info("Completed task: %s for %s", task.id, userKey);
  }
}

/**
 * Add task to history
 */
function addToHistory(userKey: string, task: TaskContext): void {
  const history = taskHistory.get(userKey) || [];
  history.push(task);
  if (history.length > 10) history.shift();
  taskHistory.set(userKey, history);
}

/**
 * Get task history for user
 */
export function getTaskHistory(peerId: string, channel: string): TaskContext[] {
  const userKey = getUserKey(peerId, channel);
  return taskHistory.get(userKey) || [];
}

/**
 * Build context isolation prompt prefix
 */
export function buildContextIsolationPrompt(task: TaskContext, previousTasks: TaskContext[]): string {
  const lines: string[] = [];

  lines.push("## Current Task Context");
  lines.push(`**Task ID:** ${task.id}`);
  lines.push(`**Topic:** ${task.topic}`);
  lines.push(`**Type:** ${task.type}`);
  lines.push(`**Messages:** ${task.messageCount}`);
  lines.push("");

  lines.push("**IMPORTANT CONTEXT RULES:**");
  lines.push("1. Focus ONLY on the current task above");
  lines.push("2. Do NOT mix context from previous unrelated tasks");
  lines.push("3. If the user changes topic, acknowledge the switch clearly");
  lines.push("4. If asked to stop/cancel, immediately halt the current task");
  lines.push("5. Each new task starts with a clean context");
  lines.push("");

  if (previousTasks.length > 0) {
    lines.push("## Recent Task History (for reference only, do NOT mix contexts)");
    for (const pt of previousTasks.slice(-3)) {
      lines.push(`- [${pt.status}] ${pt.topic} (${pt.messageCount} messages)`);
    }
  }

  return lines.join("\n");
}

/**
 * Process message with context isolation
 */
export function processWithIsolation(
  message: string,
  peerId: string,
  channel: string
): { task: TaskContext; contextPrompt: string; isNewTask: boolean } {
  const currentTask = getCurrentTask(peerId, channel);
  const { isNewTask, reason, suggestedTopic } = detectTaskBoundary(message, currentTask);

  let task: TaskContext;
  if (isNewTask) {
    task = startTask(peerId, channel, suggestedTopic, "conversation");
    log.debug("New task started: %s (reason: %s)", suggestedTopic, reason);
  } else {
    task = currentTask!;
    updateTaskActivity(peerId, channel);
  }

  const history = getTaskHistory(peerId, channel);
  const contextPrompt = buildContextIsolationPrompt(task, history);

  return { task, contextPrompt, isNewTask };
}

export default {
  detectTaskBoundary,
  startTask,
  getCurrentTask,
  updateTaskActivity,
  cancelTask,
  isTaskCancelled,
  completeTask,
  getTaskHistory,
  buildContextIsolationPrompt,
  processWithIsolation,
  resetUserContext,
};
