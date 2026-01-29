import { existsSync } from "fs";
import { resolve } from "path";
import { ensureDir } from "../utils/file.js";
import { loadOrCreateIdentity } from "../security/device-identity.js";
import { loadConfig } from "../config/config.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("boot");

interface BootOpts {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
}

export async function runBoot(opts: BootOpts): Promise<boolean> {
  const { runtimeDir, soulDir } = opts;

  log.info("☁️👀 Running boot sequence...");

  // 1. Create runtime directories
  const dirs = [
    "",
    "credentials",
    "identity",
    "agents/main/sessions",
    "cron",
    "media/incoming",
    "media/outgoing",
    "memory",
    "mcp",
    "wallet",
    "peers",
    "logs",
  ];
  for (const d of dirs) {
    ensureDir(resolve(runtimeDir, d));
  }
  log.info("Runtime directories created");

  // 2. Device identity
  const identity = loadOrCreateIdentity(runtimeDir);
  log.info("Device ID: %s", identity.deviceId.slice(0, 16) + "...");

  // 3. Config
  const config = loadConfig(runtimeDir);
  log.info("Config loaded (agent: %s)", config.agent.name);

  // 4. Check Gemini API key
  const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    log.warn("⚠️  No Gemini API key configured. Set GEMINI_API_KEY in .env");
    return false;
  }

  log.info("✅ Boot sequence complete");
  return true;
}

export async function runOnboarding(opts: BootOpts) {
  log.info("☁️👀 Starting Wispy onboarding...\n");

  const bootOk = await runBoot(opts);

  console.log(`
  ☁️👀  Welcome to Wispy!

  Your autonomous AI companion is ready.

  Device ID: ${loadOrCreateIdentity(opts.runtimeDir).deviceId.slice(0, 16)}...
  Runtime:   ${opts.runtimeDir}
  Soul:      ${opts.soulDir}

  ${bootOk ? "✅ All systems go!" : "⚠️  Please set GEMINI_API_KEY in .env"}

  Next steps:
  1. Set your Gemini API key in .env
  2. Run: wispy gateway
  3. Connect via web dashboard at http://localhost:4000
  `);
}
