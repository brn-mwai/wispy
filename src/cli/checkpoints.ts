import { existsSync, copyFileSync, readFileSync } from "fs";
import { resolve, relative, dirname } from "path";
import { ensureDir, appendJSONL, readJSONL } from "../utils/file.js";

export interface CheckpointEntry {
  timestamp: number;
  filePath: string;
  snapshotPath: string;
  action: string;
}

export function createCheckpoint(runtimeDir: string, filePath: string): void {
  if (!existsSync(filePath)) return;

  const timestamp = Date.now();
  const checkpointDir = resolve(runtimeDir, "checkpoints", String(timestamp));
  const relativePath = relative(process.cwd(), filePath).replace(/[\\/:*?"<>|]/g, "_");
  const snapshotPath = resolve(checkpointDir, relativePath);

  ensureDir(dirname(snapshotPath));
  copyFileSync(filePath, snapshotPath);

  const indexPath = resolve(runtimeDir, "checkpoints", "index.jsonl");
  ensureDir(dirname(indexPath));
  appendJSONL(indexPath, { timestamp, filePath, snapshotPath, action: "file_write" });
}

export function listCheckpoints(runtimeDir: string): CheckpointEntry[] {
  const indexPath = resolve(runtimeDir, "checkpoints", "index.jsonl");
  if (!existsSync(indexPath)) return [];
  return readJSONL<CheckpointEntry>(indexPath).reverse();
}

export function restoreCheckpoint(entry: CheckpointEntry): boolean {
  if (!existsSync(entry.snapshotPath)) return false;
  ensureDir(dirname(entry.filePath));
  copyFileSync(entry.snapshotPath, entry.filePath);
  return true;
}
