import { resolve } from "path";
import { existsSync, copyFileSync } from "fs";
import { readYAML, writeYAML } from "../utils/file.js";
import { validateConfig, type WispyConfig } from "./schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("config");

const DEFAULT_CONFIG: WispyConfig = {
  agent: {
    name: "wispy",
    id: "main",
  },
  gemini: {
    models: {
      pro: "gemini-3-pro-preview",         // Gemini 3 Pro - advanced reasoning, 1M context
      flash: "gemini-3-flash-preview",     // Gemini 3 Flash - pro-level at flash speed
      image: "gemini-3-pro-image-preview", // Gemini 3 Image - highest quality generation
      embedding: "text-embedding-004",
    },
  },
  channels: {
    web: { enabled: true, port: 4000 },
    rest: { enabled: true, port: 4001 },
    telegram: { enabled: false },
    whatsapp: { enabled: false },
  },
  memory: {
    embeddingDimensions: 768,
    heartbeatIntervalMinutes: 30,
  },
  security: {
    requireApprovalForExternal: true,
    allowedGroups: [],
  },
};

export function getConfigPath(runtimeDir: string): string {
  return resolve(runtimeDir, "config.yaml");
}

export function loadConfig(runtimeDir: string): WispyConfig {
  const configPath = getConfigPath(runtimeDir);

  if (!existsSync(configPath)) {
    log.info("Creating default config at %s", configPath);
    writeYAML(configPath, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  // Backup before reading
  const backupPath = configPath + ".bak";
  copyFileSync(configPath, backupPath);

  const raw = readYAML<WispyConfig>(configPath);
  if (!raw) {
    log.warn("Empty config, using defaults");
    return DEFAULT_CONFIG;
  }

  const valid = validateConfig(raw);
  if (!valid) {
    log.error({ errors: validateConfig.errors }, "Invalid config, using defaults");
    return DEFAULT_CONFIG;
  }

  // Merge env overrides
  if (process.env.GEMINI_API_KEY) {
    raw.gemini.apiKey = process.env.GEMINI_API_KEY;
  }

  return raw;
}

export function saveConfig(runtimeDir: string, config: WispyConfig) {
  const configPath = getConfigPath(runtimeDir);
  writeYAML(configPath, config);
}
