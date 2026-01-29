import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import YAML from "yaml";
import JSON5 from "json5";

export function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readJSON<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeJSON(path: string, data: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export function readJSON5<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON5.parse(readFileSync(path, "utf-8"));
}

/** Alias for workspace.ts compatibility */
export const readYaml = readYAML;
/** Alias for workspace.ts compatibility */
export const writeYaml = writeYAML;

export function readYAML<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  return YAML.parse(readFileSync(path, "utf-8"));
}

export function writeYAML(path: string, data: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, YAML.stringify(data), "utf-8");
}

export function readMD(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function appendJSONL(path: string, entry: unknown) {
  ensureDir(dirname(path));
  const line = JSON.stringify(entry) + "\n";
  writeFileSync(path, line, { flag: "a", encoding: "utf-8" });
}

export function readJSONL<T = unknown>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
