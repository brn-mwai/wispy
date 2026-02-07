// Plugin dock pattern — channels declare capabilities as metadata
// Supports event broadcasting for cross-channel sync (CLI <-> Telegram)

export interface ChannelCapabilities {
  text: boolean;
  media: boolean;
  voice: boolean;
  buttons: boolean;
  reactions: boolean;
  groups: boolean;
  threads: boolean;
}

export interface ChannelDock {
  name: string;
  type: string;
  capabilities: ChannelCapabilities;
  status: "connected" | "connecting" | "disconnected" | "error";
  connectedAt?: string;
  error?: string;
}

export interface ChannelEvent {
  type: "message" | "marathon_update" | "approval" | "notification" | "status_change";
  source: string;
  target?: string; // If undefined, broadcast to all channels
  data: Record<string, unknown>;
  timestamp: string;
}

export type ChannelEventListener = (event: ChannelEvent) => void;

const registry = new Map<string, ChannelDock>();
const eventListeners = new Map<string, ChannelEventListener[]>();

export function registerChannel(dock: ChannelDock) {
  registry.set(dock.name, dock);
}

export function getChannel(name: string): ChannelDock | undefined {
  return registry.get(name);
}

export function getAllChannels(): ChannelDock[] {
  return Array.from(registry.values());
}

export function updateChannelStatus(
  name: string,
  status: ChannelDock["status"],
  error?: string
) {
  const ch = registry.get(name);
  if (ch) {
    ch.status = status;
    ch.error = error;
    if (status === "connected") ch.connectedAt = new Date().toISOString();
  }
}

/**
 * Subscribe a channel to events
 */
export function onChannelEvent(channelName: string, listener: ChannelEventListener): () => void {
  const listeners = eventListeners.get(channelName) || [];
  listeners.push(listener);
  eventListeners.set(channelName, listeners);
  return () => {
    const current = eventListeners.get(channelName) || [];
    eventListeners.set(channelName, current.filter(l => l !== listener));
  };
}

/**
 * Broadcast an event to all channels (or a specific target)
 */
export function broadcastChannelEvent(event: ChannelEvent): void {
  if (event.target) {
    // Send to specific channel
    const listeners = eventListeners.get(event.target) || [];
    for (const listener of listeners) {
      try { listener(event); } catch {}
    }
  } else {
    // Broadcast to all channels except source
    for (const [name, listeners] of eventListeners) {
      if (name === event.source) continue;
      for (const listener of listeners) {
        try { listener(event); } catch {}
      }
    }
  }
}
