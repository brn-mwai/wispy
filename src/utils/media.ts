import { resolve } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { ensureDir } from "./file.js";
import { createLogger } from "../infra/logger.js";
import { randomBytes } from "crypto";

const log = createLogger("media");

export type MediaType = "image" | "video" | "audio" | "document" | "unknown";

const MIME_MAP: Record<string, MediaType> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/svg+xml": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "audio/mp4": "audio",
  "application/pdf": "document",
};

const EXT_MAP: Record<string, MediaType> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image",
  ".webp": "image", ".heic": "image", ".svg": "image",
  ".mp4": "video", ".webm": "video", ".mov": "video",
  ".mp3": "audio", ".ogg": "audio", ".wav": "audio", ".m4a": "audio", ".opus": "audio",
  ".pdf": "document", ".docx": "document",
};

export function detectMediaType(filename: string, mime?: string): MediaType {
  if (mime && MIME_MAP[mime]) return MIME_MAP[mime];
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  return EXT_MAP[ext] || "unknown";
}

export function saveMedia(
  runtimeDir: string,
  direction: "incoming" | "outgoing",
  filename: string,
  data: Buffer
): string {
  const dir = resolve(runtimeDir, "media", direction);
  ensureDir(dir);
  const id = randomBytes(8).toString("hex");
  const safeName = `${id}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const path = resolve(dir, safeName);
  writeFileSync(path, data);
  log.debug("Saved %s media: %s", direction, safeName);
  return path;
}

export function loadMedia(path: string): Buffer | null {
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

export async function downloadMedia(url: string, runtimeDir: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const urlParts = new URL(url);
    const filename = urlParts.pathname.split("/").pop() || "download";
    return saveMedia(runtimeDir, "incoming", filename, buf);
  } catch (err) {
    log.error({ err }, "Failed to download media from %s", url);
    return null;
  }
}
