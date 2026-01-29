/**
 * Browser Module
 * CDP-based browser automation for Wispy
 */

export { BrowserController, getBrowser, type BrowserStatus, type BrowserTab, type SnapshotResult } from "./controller.js";
export { browserToolDefinitions, executeBrowserTool, isBrowserTool } from "./tools.js";
