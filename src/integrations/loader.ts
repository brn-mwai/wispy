/**
 * Integration loader — discovers and registers all integrations.
 *
 * Scans the integrations directory for modules that export a default class
 * extending Integration. Auto-enables integrations listed in config.
 */

import type { Integration, IntegrationContext } from "./base.js";
import { IntegrationRegistry } from "./registry.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("integrations");

/**
 * Load all built-in integrations and register them.
 * This function imports each integration module directly (no filesystem scan)
 * for reliability across platforms and bundlers.
 */
export async function loadIntegrations(
  ctx: IntegrationContext,
  enabledIds: string[] = []
): Promise<IntegrationRegistry> {
  const registry = new IntegrationRegistry(ctx.credentialManager);

  // Import all integration modules
  const modules = await importAllIntegrations(ctx);

  for (const mod of modules) {
    try {
      registry.register(mod);
      log.debug("Registered: %s", mod.manifest.id);
    } catch (err) {
      log.warn("Failed to register %s: %s", mod.manifest.id, err);
    }
  }

  log.info("Loaded %d integration(s)", registry.size);

  // Auto-enable configured integrations
  for (const id of enabledIds) {
    try {
      await registry.enable(id);
    } catch (err) {
      log.warn("Failed to enable %s: %s", id, err);
    }
  }

  // Auto-enable agentic-commerce when AGENT_PRIVATE_KEY is detected
  if (process.env.AGENT_PRIVATE_KEY && !enabledIds.includes("agentic-commerce")) {
    try {
      await registry.enable("agentic-commerce");
      log.info("Auto-enabled agentic-commerce (AGENT_PRIVATE_KEY detected)");
    } catch (err) {
      log.warn("Failed to auto-enable agentic-commerce: %s", err);
    }
  }

  if (registry.enabledCount > 0) {
    log.info("Enabled %d integration(s)", registry.enabledCount);
  }

  return registry;
}

/**
 * Import all integration modules. Each module exports a default class.
 * We use explicit imports for tree-shaking and bundler compatibility.
 */
async function importAllIntegrations(ctx: IntegrationContext): Promise<Integration[]> {
  const instances: Integration[] = [];

  const importSafe = async (path: string) => {
    try {
      const mod = await import(path);
      if (mod.default) {
        instances.push(new mod.default(ctx));
      }
    } catch {
      // Integration not available (missing deps, etc.)
    }
  };

  // Google
  await importSafe("./google/calendar.js");
  await importSafe("./google/gmail.js");
  await importSafe("./google/drive.js");
  await importSafe("./google/docs.js");
  await importSafe("./google/sheets.js");
  await importSafe("./google/meet.js");
  await importSafe("./google/maps.js");
  await importSafe("./google/search.js");
  await importSafe("./google/youtube.js");

  // Chat
  await importSafe("./chat/discord.js");
  await importSafe("./chat/slack.js");
  await importSafe("./chat/whatsapp.js");

  // AI Models
  await importSafe("./ai-models/openai.js");
  await importSafe("./ai-models/ollama.js");

  // Productivity
  await importSafe("./productivity/notion.js");
  await importSafe("./productivity/obsidian.js");
  await importSafe("./productivity/github.js");
  await importSafe("./productivity/linear.js");

  // Music
  await importSafe("./music/spotify.js");

  // Smart Home
  await importSafe("./smart-home/hue.js");
  await importSafe("./smart-home/homeassistant.js");

  // Tools
  await importSafe("./tools/browser.js");
  await importSafe("./tools/webhooks.js");
  await importSafe("./tools/weather.js");

  // Social
  await importSafe("./social/twitter.js");
  await importSafe("./social/email-smtp.js");

  // Agentic Commerce (x402 hackathon)
  await importSafe("./agentic-commerce/index.js");

  return instances;
}
