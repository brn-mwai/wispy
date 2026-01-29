import { resolve } from "path";
import { readJSON, writeJSON } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("auth");

interface PairingState {
  paired: Record<string, { peerId: string; pairedAt: string }>;
}

interface AllowList {
  groups: string[];
}

export function loadPairing(runtimeDir: string, channel: string): PairingState {
  const path = resolve(runtimeDir, "credentials", `${channel}-pairing.json`);
  return readJSON<PairingState>(path) || { paired: {} };
}

export function savePairing(runtimeDir: string, channel: string, state: PairingState) {
  const path = resolve(runtimeDir, "credentials", `${channel}-pairing.json`);
  writeJSON(path, state);
}

export function isPaired(runtimeDir: string, channel: string, peerId: string): boolean {
  const state = loadPairing(runtimeDir, channel);
  return peerId in state.paired;
}

export function pairUser(runtimeDir: string, channel: string, peerId: string) {
  const state = loadPairing(runtimeDir, channel);
  state.paired[peerId] = { peerId, pairedAt: new Date().toISOString() };
  savePairing(runtimeDir, channel, state);
  log.info("Paired user %s on %s", peerId, channel);
}

export function loadAllowList(runtimeDir: string, channel: string): AllowList {
  const path = resolve(runtimeDir, "credentials", `${channel}-allowFrom.json`);
  return readJSON<AllowList>(path) || { groups: [] };
}

export function isGroupAllowed(runtimeDir: string, channel: string, groupId: string): boolean {
  const list = loadAllowList(runtimeDir, channel);
  return list.groups.includes(groupId);
}
