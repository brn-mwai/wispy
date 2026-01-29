/**
 * Shows recent sessions on launch as a bordered interactive panel.
 *
 * ┌─ Recent Sessions ─────────────────────────┐
 * │                                            │
 * │   1  main           12 msgs    2m ago      │
 * │   2  research        8 msgs    1h ago      │
 * │   3  debug           3 msgs    2d ago      │
 * │                                            │
 * │   Enter = new session · 1-5 = resume       │
 * └────────────────────────────────────────────┘
 */

import chalk from "chalk";
import { screen } from "./screen.js";
import { KeyHandler } from "./key-handler.js";
import { loadRegistry, type SessionMetadata } from "../../core/session.js";

const border = chalk.rgb(77, 209, 249);
const dim = chalk.dim;

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diff / 1000);

  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

// ── Panel ────────────────────────────────────────────────────────────

export async function showRecentsPanel(
  runtimeDir: string,
  agentId: string,
): Promise<string | null> {
  const registry = loadRegistry(runtimeDir, agentId);
  const entries = Object.values(registry.sessions)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
    .slice(0, 5);

  if (entries.length === 0) return null;

  // ── Dimensions ──────────────────────────────────────────────────
  const panelWidth = 50;
  const innerWidth = panelWidth - 2; // minus left/right border chars

  // ── Draw panel ──────────────────────────────────────────────────
  const { rows } = screen.getSize();
  const startRow = Math.max(2, Math.floor((rows - entries.length - 6) / 2));

  const title = " Recent Sessions ";
  const topBorder =
    border("┌─") + border(title) + border("─".repeat(Math.max(0, innerWidth - title.length - 1))) + border("┐");

  const emptyLine = border("│") + " ".repeat(innerWidth) + border("│");

  const bottomLabel = "  Enter = new session · 1-5 = resume  ";
  const bottomLine =
    border("│") +
    dim(pad(bottomLabel, innerWidth)) +
    border("│");

  const closingBorder = border("└") + border("─".repeat(innerWidth)) + border("┘");

  let row = startRow;
  screen.moveTo(row++, 1);
  screen.write(topBorder);

  screen.moveTo(row++, 1);
  screen.write(emptyLine);

  for (let i = 0; i < entries.length; i++) {
    const s = entries[i]!;
    const num = chalk.bold(`${i + 1}`);
    const name = pad(extractName(s), 16);
    const msgs = dim(pad(`${s.messageCount} msgs`, 10));
    const ago = dim(pad(timeAgo(s.lastActiveAt), 10));

    const content = `   ${num}  ${name}${msgs}${ago}`;
    // Pad content to innerWidth
    const padded = pad(content, innerWidth);
    screen.moveTo(row++, 1);
    screen.write(border("│") + padded + border("│"));
  }

  screen.moveTo(row++, 1);
  screen.write(emptyLine);

  screen.moveTo(row++, 1);
  screen.write(bottomLine);

  screen.moveTo(row++, 1);
  screen.write(closingBorder);

  // ── Key input ───────────────────────────────────────────────────
  return new Promise<string | null>((resolve) => {
    const keys = new KeyHandler();
    keys.start();

    const cleanup = (result: string | null) => {
      keys.stop();
      resolve(result);
    };

    keys.on("enter", () => cleanup(null));
    keys.on("escape", () => cleanup(null));
    keys.on("double-esc", () => cleanup(null));
    keys.on("sigint", () => cleanup(null));

    keys.on("char", (ev: { sequence: string }) => {
      const n = parseInt(ev.sequence, 10);
      if (n >= 1 && n <= entries.length) {
        cleanup(entries[n - 1]!.sessionKey);
      }
    });
  });
}

/** Extract a short display name from a session key or metadata. */
function extractName(meta: SessionMetadata): string {
  // sessionKey format is typically "agentId:type:peerId"
  // Use channel or last segment as display name
  if (meta.channel && meta.channel !== "cli") return meta.channel;
  const parts = meta.sessionKey.split(":");
  return parts[parts.length - 1] ?? "session";
}
