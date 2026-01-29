import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("memory");

export interface HeartbeatState {
  lastRun: string | null;
  lastSyncMessageIndex: number;
  pendingFollowUps: string[];
}

export function loadHeartbeatState(soulDir: string): HeartbeatState {
  const path = resolve(soulDir, "memory", "heartbeat-state.json");
  return readJSON<HeartbeatState>(path) || {
    lastRun: null,
    lastSyncMessageIndex: 0,
    pendingFollowUps: [],
  };
}

export function saveHeartbeatState(soulDir: string, state: HeartbeatState) {
  const path = resolve(soulDir, "memory", "heartbeat-state.json");
  ensureDir(resolve(soulDir, "memory"));
  writeJSON(path, state);
}

export function appendToMemory(soulDir: string, category: string, fact: string) {
  const memPath = resolve(soulDir, "MEMORY.md");
  if (!existsSync(memPath)) return;

  let content = readFileSync(memPath, "utf-8");
  const marker = `## ${category}`;
  const idx = content.indexOf(marker);
  if (idx === -1) {
    content += `\n## ${category}\n- ${fact}\n`;
  } else {
    const endOfLine = content.indexOf("\n", idx);
    content =
      content.slice(0, endOfLine + 1) +
      `- ${fact}\n` +
      content.slice(endOfLine + 1);
  }

  writeFileSync(memPath, content, "utf-8");
  log.info("Added to memory [%s]: %s", category, fact.slice(0, 50));
}

export function getDailyNotePath(soulDir: string, date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split("T")[0];
  return resolve(soulDir, "memory", `${dateStr}.md`);
}

export function appendDailyNote(soulDir: string, note: string, date?: Date) {
  const path = getDailyNotePath(soulDir, date);
  ensureDir(resolve(soulDir, "memory"));
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  const line = `- [${timestamp}] ${note}\n`;

  if (!existsSync(path)) {
    const d = date || new Date();
    const header = `# Daily Note: ${d.toISOString().split("T")[0]}\n\n`;
    writeFileSync(path, header + line, "utf-8");
  } else {
    writeFileSync(path, line, { flag: "a", encoding: "utf-8" });
  }
}
