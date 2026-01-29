import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("a2a-peer");

export interface Peer {
  deviceId: string;
  publicKey: string;
  name: string;
  endpoint: string;
  capabilities?: string[];
  lastSeenAt: string;
  trustedAt?: string;
}

interface PeerStore {
  peers: Record<string, Peer>;
}

export function loadPeers(runtimeDir: string): PeerStore {
  const path = resolve(runtimeDir, "peers", "peers.json");
  return readJSON<PeerStore>(path) || { peers: {} };
}

export function savePeers(runtimeDir: string, store: PeerStore) {
  ensureDir(resolve(runtimeDir, "peers"));
  writeJSON(resolve(runtimeDir, "peers", "peers.json"), store);
}

export function addPeer(runtimeDir: string, peer: Peer) {
  const store = loadPeers(runtimeDir);
  store.peers[peer.deviceId] = peer;
  savePeers(runtimeDir, store);
  log.info("Added peer: %s (%s)", peer.name, peer.deviceId.slice(0, 12));
}

export function getPeer(runtimeDir: string, deviceId: string): Peer | null {
  const store = loadPeers(runtimeDir);
  return store.peers[deviceId] || null;
}

export function listPeers(runtimeDir: string): Peer[] {
  const store = loadPeers(runtimeDir);
  return Object.values(store.peers);
}
