/**
 * Marathon Module - Durable Background Agents
 *
 * Autonomous multi-day task execution with:
 * - Auto-save state after every action
 * - Real-time progress streaming
 * - Human approval for sensitive actions
 * - Heartbeat mechanism for crash detection
 * - Auto-resume from last checkpoint
 */

export * from "./types.js";
export * from "./planner.js";
export * from "./executor.js";
export * from "./durable-executor.js";
export * from "./service.js";
export * from "./watchdog.js";
export * from "./nlp-controller.js";
