/**
 * Antigravity Channel Adapter
 *
 * Connects Wispy to the Antigravity VS Code extension via WebSocket.
 * Extension users authenticate with their Google Account, which provides
 * identity context for per-user sessions, memory, and tool access.
 *
 * Connection flow:
 *   1. Extension opens WebSocket to the gateway
 *   2. Sends an `antigravity_connect` frame with Google Account info
 *   3. Gateway marks the client as type "antigravity"
 *   4. All subsequent chat frames route through the agent with channel="antigravity"
 *   5. Streaming responses are pushed back over the same WebSocket
 *
 * The MCP server (src/mcp/server.ts) handles the stdio-based tool protocol
 * when the extension uses MCP directly. This adapter handles the real-time
 * WebSocket channel for interactive chat and event broadcasting.
 */

import {
  registerChannel,
  updateChannelStatus,
  onChannelEvent,
  broadcastChannelEvent,
  type ChannelEvent,
} from "../dock.js";
import type { Agent } from "../../core/agent.js";
import { createLogger } from "../../infra/logger.js";

const log = createLogger("antigravity");

// ── Types ────────────────────────────────────────────────────────

export interface AntigravityUser {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  connectedAt: string;
  clientId: string;
}

export interface AntigravityConnectPayload {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  extensionVersion?: string;
  vscodeVersion?: string;
  workspaceName?: string;
}

// ── State ────────────────────────────────────────────────────────

const connectedUsers = new Map<string, AntigravityUser>();
let agentInstance: Agent | null = null;
let cleanupFn: (() => void) | null = null;

// ── Channel Registration ─────────────────────────────────────────

/**
 * Initialize the Antigravity channel adapter.
 * Registers the channel in the dock and sets up event listeners.
 */
export function startAntigravity(agent: Agent): void {
  agentInstance = agent;

  registerChannel({
    name: "antigravity",
    type: "antigravity",
    capabilities: {
      text: true,
      media: true,
      voice: false,
      buttons: false,
      reactions: false,
      groups: false,
      threads: true, // VS Code supports threaded conversations
    },
    status: "connected",
    connectedAt: new Date().toISOString(),
  });

  // Listen for cross-channel events (marathon updates, notifications, etc.)
  cleanupFn = onChannelEvent("antigravity", handleChannelEvent);

  log.info("Antigravity channel adapter initialized");
}

// ── Client Management ────────────────────────────────────────────

/**
 * Register a new Antigravity extension client.
 * Called by the gateway when it receives an `antigravity_connect` frame.
 */
export function registerAntigravityClient(
  clientId: string,
  payload: AntigravityConnectPayload
): AntigravityUser {
  const user: AntigravityUser = {
    googleId: payload.googleId,
    email: payload.email,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
    connectedAt: new Date().toISOString(),
    clientId,
  };

  connectedUsers.set(clientId, user);
  updateChannelStatus("antigravity", "connected");

  log.info(
    "Antigravity client connected: %s (%s) via %s",
    user.displayName,
    user.email,
    clientId
  );

  // Broadcast connection event to other channels
  broadcastChannelEvent({
    type: "notification",
    source: "antigravity",
    data: {
      event: "client_connected",
      user: user.displayName,
      email: user.email,
      extensionVersion: payload.extensionVersion,
      workspaceName: payload.workspaceName,
    },
    timestamp: new Date().toISOString(),
  });

  return user;
}

/**
 * Unregister an Antigravity extension client.
 * Called by the gateway when the WebSocket closes.
 */
export function unregisterAntigravityClient(clientId: string): void {
  const user = connectedUsers.get(clientId);
  if (user) {
    connectedUsers.delete(clientId);
    log.info("Antigravity client disconnected: %s (%s)", user.displayName, clientId);

    broadcastChannelEvent({
      type: "notification",
      source: "antigravity",
      data: {
        event: "client_disconnected",
        user: user.displayName,
        email: user.email,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Update status based on remaining connections
  if (connectedUsers.size === 0) {
    updateChannelStatus("antigravity", "disconnected");
  }
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Get a connected user by their gateway client ID.
 */
export function getAntigravityUser(clientId: string): AntigravityUser | undefined {
  return connectedUsers.get(clientId);
}

/**
 * Get all connected Antigravity users.
 */
export function getConnectedUsers(): AntigravityUser[] {
  return Array.from(connectedUsers.values());
}

/**
 * Get connected user count.
 */
export function getAntigravityClientCount(): number {
  return connectedUsers.size;
}

/**
 * Find a user by their Google email.
 */
export function findUserByEmail(email: string): AntigravityUser | undefined {
  for (const user of connectedUsers.values()) {
    if (user.email === email) return user;
  }
  return undefined;
}

/**
 * Build the peer ID for an Antigravity user (used for session isolation).
 */
export function buildAntigravityPeerId(user: AntigravityUser): string {
  return `antigravity:${user.googleId}`;
}

// ── Event Handling ───────────────────────────────────────────────

/**
 * Handle events broadcast from other channels (e.g., marathon updates from Telegram).
 */
function handleChannelEvent(event: ChannelEvent): void {
  log.debug("Antigravity received channel event: %s from %s", event.type, event.source);

  // Forward relevant events to all connected extension clients via the gateway
  // The gateway's ClientManager handles the actual WebSocket delivery
  if (event.type === "marathon_update" || event.type === "notification") {
    for (const user of connectedUsers.values()) {
      log.debug(
        "Would forward %s event to %s (%s)",
        event.type,
        user.displayName,
        user.clientId
      );
      // Actual forwarding is handled by the gateway server
      // since it owns the WebSocket connections
    }
  }
}

/**
 * Send a message to an Antigravity user via the agent.
 * Used for programmatic notifications from other parts of the system.
 */
export async function sendAntigravityMessage(
  email: string,
  message: string
): Promise<boolean> {
  const user = findUserByEmail(email);
  if (!user) {
    log.warn("Cannot send message - user not connected: %s", email);
    return false;
  }

  // Broadcast as a channel event - the gateway will pick it up
  broadcastChannelEvent({
    type: "notification",
    source: "antigravity",
    target: "antigravity",
    data: {
      event: "direct_message",
      clientId: user.clientId,
      message,
    },
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Stop the Antigravity adapter and clean up.
 */
export function stopAntigravity(): void {
  if (cleanupFn) cleanupFn();
  connectedUsers.clear();
  updateChannelStatus("antigravity", "disconnected");
  agentInstance = null;
  log.info("Antigravity channel adapter stopped");
}
