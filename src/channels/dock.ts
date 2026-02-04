// Plugin dock pattern — channels declare capabilities as metadata

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

const registry = new Map<string, ChannelDock>();

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
