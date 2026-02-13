/**
 * Wispy REPL — interactive CLI experience.
 *
 * Layout:
 *   [cloud icon]  Wispy v0.4.6
 *                 Gemini 2.5 Flash
 *                 C:\Users\...
 *
 *   ❯ user input
 *
 *   ◆ Thinking...
 *
 *   ⏺ Read File
 *     path: src/index.ts
 *     ✓ Done (0.3s)
 *
 *   Here's the **formatted markdown** response.
 *
 *   2.5 Pro · 1,234 tokens · $0.02 · 12% context · 3.2s
 *   ● Tokens: 1,234 ($0.02) │ Session: main │ Context: 12%
 */

import * as readline from "readline";
import { existsSync, readFileSync } from "fs";
import { join, extname } from "path";
import chalk from "chalk";
import { showBanner, WISPY_VERSION } from "./ui/banner.js";
import { t } from "./ui/theme.js";
import { startSpinner, startThinkingSpinner, startToolSpinner, stopSpinner, updateSpinner, succeedSpinner, failSpinner } from "./ui/spinner.js";
import { formatToolCall, type ToolCallDisplay } from "./ui/tool-display.js";
import { OutputRenderer } from "./tui/output-renderer.js";
import { StatusBar, type StatusBarState } from "./tui/status-bar.js";
import { calculateLayout, onResize } from "./tui/layout.js";
import { CliHistory } from "./history.js";
import { handleSlashCommand, getCommands, verboseMode, type CommandContext } from "./commands.js";
import { loadEnv } from "../infra/dotenv.js";
import { loadConfig } from "../config/config.js";
import { loadOrCreateIdentity } from "../security/device-identity.js";
import { initGemini } from "../ai/gemini.js";
import { Agent } from "../core/agent.js";
import { runBoot } from "../gateway/boot.js";
import { logger } from "../infra/logger.js";
import { TokenManager } from "../token/estimator.js";
import { McpRegistry } from "../mcp/client.js";
import { loadSkills } from "../skills/loader.js";
import { setApprovalHandler } from "../security/action-guard.js";
import { showApprovalDialog } from "./permissions.js";
import { CronService } from "../cron/service.js";
import { ReminderService, type Reminder } from "../cron/reminders.js";
import { printUpdateNotification } from "./update-checker.js";
import { MarathonRenderer } from "./tui/marathon-renderer.js";
import { registerChannel, onChannelEvent } from "../channels/dock.js";

export interface ReplOpts {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
}

// ── Multimodal helpers ───────────────────────────────────────────

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

interface ImagePart {
  mimeType: string;
  data: string;
}

/**
 * Extract image file paths from user input and load them as base64.
 * Returns the cleaned text (without paths) and loaded images.
 */
function extractImages(input: string): { text: string; images: ImagePart[] } {
  const images: ImagePart[] = [];
  // Match file paths (Windows and Unix) that end with image extensions
  const pathRegex = /(?:[A-Za-z]:[\\\/]|[~.\/\\])[\w\-. \\\/]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)/gi;
  const matches = input.match(pathRegex) || [];

  let text = input;
  for (const match of matches) {
    const resolved = match.replace(/\\/g, "/");
    const ext = extname(resolved).toLowerCase();
    if (IMAGE_EXTS.has(ext) && existsSync(match)) {
      try {
        const data = readFileSync(match).toString("base64");
        images.push({ mimeType: MIME_MAP[ext] || "image/png", data });
        text = text.replace(match, "").trim();
      } catch {
        // Ignore unreadable files
      }
    }
  }

  if (!text) text = "Describe this image.";
  return { text, images };
}

export async function startRepl(opts: ReplOpts) {
  const { rootDir, runtimeDir, soulDir } = opts;

  loadEnv(rootDir);

  const configPath = join(runtimeDir, "config.yaml");
  if (!existsSync(configPath)) {
    const { runSetupWizard } = await import("./setup/wizard.js");
    await runSetupWizard({ rootDir, runtimeDir, soulDir });
  }

  logger.level = "silent";

  const bootOk = await runBoot({ rootDir, runtimeDir, soulDir });
  if (!bootOk) {
    console.error("Boot failed. Run 'wispy onboard' first.");
    process.exit(1);
  }

  const config = loadConfig(runtimeDir);

  if (config.theme) {
    const { setTheme } = await import("./ui/theme.js");
    setTheme(config.theme as any);
  }

  const identity = loadOrCreateIdentity(runtimeDir);

  // Initialize Gemini with Vertex AI or API key
  const vertexConfig = config.gemini.vertexai;
  let apiKeyInstance: string;
  let vertexEnabled = false;

  if (vertexConfig?.enabled) {
    const project = vertexConfig.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    const location = vertexConfig.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!project) {
      console.error("Vertex AI enabled but project not set. Add vertexai.project to config or set GOOGLE_CLOUD_PROJECT env var.");
      process.exit(1);
    }

    initGemini({ vertexai: true, project, location });
    apiKeyInstance = `vertex:${project}`;
    vertexEnabled = true;
    console.log(chalk.dim(`  Using Vertex AI (project: ${project}, location: ${location})`));
  } else {
    const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY not set. Add it to .env or config, or enable Vertex AI.");
      process.exit(1);
    }
    initGemini(apiKey);
    apiKeyInstance = apiKey;
  }

  logger.level = "silent";

  // Wire permission approval handler
  setApprovalHandler(showApprovalDialog);

  const agent = new Agent({ config, runtimeDir, soulDir });

  // Wire context event notifications
  agent.onContextEvent((event, info) => {
    if (event === "compacting") {
      process.stdout.write(chalk.dim("\n  ⟳ Auto-compacting context..."));
    } else if (event === "compacted") {
      process.stdout.write(chalk.dim(` done (${info})\n`));
    }
  });

  // Wire skills
  const skills = loadSkills(soulDir);
  if (skills.length > 0) agent.setSkills(skills);

  // Wire MCP servers
  const mcpRegistry = new McpRegistry(runtimeDir);
  await mcpRegistry.startAll();
  const mcpStatus = mcpRegistry.getStatus();
  if (mcpStatus.length > 0) agent.setMcpRegistry(mcpRegistry);

  // Wallet init — must happen BEFORE integrations so AGENT_PRIVATE_KEY is set
  try {
    const { initWallet, exportWalletPrivateKey } = await import("../wallet/x402.js");
    initWallet(runtimeDir, identity);
    if (!process.env.AGENT_PRIVATE_KEY) {
      try {
        const pk = exportWalletPrivateKey(runtimeDir, identity);
        process.env.AGENT_PRIVATE_KEY = pk;
      } catch { /* first run, no wallet yet */ }
    }
  } catch { /* wallet optional */ }

  // Load integrations (agentic-commerce, etc.)
  try {
    const { loadIntegrations } = await import("../integrations/loader.js");
    const { CredentialManager } = await import("../integrations/credential-manager.js");
    const credMgr = new CredentialManager(runtimeDir, Buffer.from(identity.deviceId, "hex"));
    const integrationRegistry = await loadIntegrations(
      { config, runtimeDir, soulDir, credentialManager: credMgr, logger },
      config.integrations ?? [],
    );
    agent.setIntegrationRegistry(integrationRegistry);
    logger.info("Integrations loaded: %d total, %d enabled", integrationRegistry.size, integrationRegistry.enabledCount);
  } catch (err) {
    logger.warn("Integration loading failed: %s", err);
  }

  // Wire Cron and Reminder services
  const cronService = new CronService(runtimeDir, agent);
  cronService.start();
  agent.setCronService(cronService);

  const reminderService = new ReminderService(runtimeDir);
  reminderService.setNotificationCallback(async (reminder: Reminder) => {
    console.log();
    console.log(chalk.yellow.bold("⏰ REMINDER"));
    console.log(chalk.white(`   ${reminder.message}`));
    console.log();
    process.stdout.write("\x07");
    return true;
  });
  reminderService.start();
  agent.setReminderService(reminderService);

  // Marathon CLI renderer
  const marathonRenderer = new MarathonRenderer();

  // Wire Marathon service for NLP-based control
  const { MarathonService } = await import("../marathon/service.js");
  const marathonService = new MarathonService(runtimeDir);
  agent.setMarathonService(marathonService, apiKeyInstance);

  marathonService.onEvent((event) => {
    marathonRenderer.handleEvent(event);
  });

  // Register CLI as a channel
  registerChannel({
    name: "cli",
    type: "cli",
    capabilities: { text: true, media: false, voice: false, buttons: false, reactions: false, groups: false, threads: false },
    status: "connected",
  });

  // Listen for events from other channels
  onChannelEvent("cli", (event) => {
    if (event.type === "marathon_update") {
      marathonRenderer.handleEvent(event.data as any);
    } else if (event.type === "notification") {
      console.log(chalk.dim(`\n  [${event.source}] ${event.data.message || ""}`));
    }
  });

  const history = new CliHistory(runtimeDir);
  const tokenManager = new TokenManager();
  let currentSession = "cli-repl";

  const cmdCtx: CommandContext = {
    agent,
    runtimeDir,
    soulDir,
    currentSession,
    setSession: (key: string) => { currentSession = key; cmdCtx.currentSession = key; },
    tokenManager,
  };

  // ── Output Renderer & Status Bar ──
  const renderer = new OutputRenderer();
  const layout = calculateLayout();
  const statusBar = new StatusBar(layout);

  onResize((newLayout) => {
    statusBar.updateLayout(newLayout);
  });

  // ── Launch layout ──
  showBanner({
    modelName: config.gemini.models.pro,
    vertexai: vertexEnabled,
    project: config.gemini.vertexai?.project,
    location: config.gemini.vertexai?.location,
  });

  // Check for updates (non-blocking)
  printUpdateNotification(WISPY_VERSION).catch(() => {});

  // Tips are now integrated into the banner
  renderer.renderSeparator();

  // ── Command completer for Tab autocomplete ──
  const completer = (line: string): [string[], string] => {
    if (line.startsWith("/")) {
      const partial = line.slice(1).toLowerCase();
      const cmds = getCommands();
      const matches = cmds
        .filter((c) => c.name.startsWith(partial))
        .map((c) => "/" + c.name);
      return [matches.length ? matches : cmds.map((c) => "/" + c.name), line];
    }
    return [[], line];
  };

  // ── Readline ──
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: t.prompt,
    historySize: 200,
    completer,
  });

  const pastEntries = history.getAll();
  for (const entry of pastEntries) {
    (rl as any).history?.unshift(entry);
  }

  process.on("uncaughtException", (err) => {
    stopSpinner();
    const msg = err?.message || String(err);
    if (msg.includes("EPIPE") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
      return;
    }
    console.error(chalk.red(`\n  Error: ${msg}`));
    try { rl.prompt(); } catch {}
  });
  process.on("unhandledRejection", (err) => {
    stopSpinner();
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EPIPE") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
      return;
    }
    console.error(chalk.red(`\n  Error: ${msg}`));
    try { rl.prompt(); } catch {}
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    rl.pause();
    history.add(input);

    // ? shortcut
    if (input === "?") {
      try { await handleSlashCommand("/help", cmdCtx); } catch {}
      rl.resume();
      rl.prompt();
      return;
    }

    // Show command menu when just "/" is entered
    if (input === "/") {
      const cmds = getCommands();
      console.log(chalk.bold("\n  Commands:\n"));
      for (const cmd of cmds) {
        console.log(`    ${chalk.cyan("/" + cmd.name.padEnd(14))} ${chalk.dim(cmd.description)}`);
      }
      console.log(chalk.dim("\n  Type /command or press Tab to autocomplete\n"));
      rl.resume();
      rl.prompt();
      return;
    }

    // Partial slash command - show matching commands
    if (input.startsWith("/") && !input.includes(" ")) {
      const partial = input.slice(1).toLowerCase();
      const cmds = getCommands();
      const matches = cmds.filter((c) => c.name.startsWith(partial));

      if (matches.length === 0) {
        console.log(chalk.red(`\n  No command matching "${input}"\n`));
        rl.resume();
        rl.prompt();
        return;
      }

      if (matches.length === 1) {
        try { await handleSlashCommand("/" + matches[0].name, cmdCtx); } catch (err) {
          console.error(chalk.red(`Command error: ${err instanceof Error ? err.message : String(err)}`));
        }
        rl.resume();
        rl.prompt();
        return;
      }

      console.log(chalk.bold(`\n  Matching commands for "${input}":\n`));
      for (const cmd of matches) {
        console.log(`    ${chalk.cyan("/" + cmd.name.padEnd(14))} ${chalk.dim(cmd.description)}`);
      }
      console.log();
      rl.resume();
      rl.prompt();
      return;
    }

    // Slash commands with args
    if (input.startsWith("/")) {
      try { await handleSlashCommand(input, cmdCtx); } catch (err) {
        console.error(chalk.red(`Command error: ${err instanceof Error ? err.message : String(err)}`));
      }
      rl.resume();
      rl.prompt();
      return;
    }

    // ── Chat ──
    const thinkStart = Date.now();
    startThinkingSpinner();

    // Track tool timing
    let currentToolStart = 0;
    let currentToolName = "";
    let accumulatedText = "";
    let firstText = true;
    let realInputTokens = 0;
    let realOutputTokens = 0;

    // Extract images from input (multimodal support)
    const { text: chatText, images: chatImages } = extractImages(input);
    if (chatImages.length > 0) {
      stopSpinner();
      console.log(chalk.dim(`  ◆ ${chatImages.length} image(s) attached`));
      startThinkingSpinner();
    }

    try {
      for await (const chunk of agent.chatStream(
        chatText, "cli-user", "cli", "main",
        chatImages.length > 0 ? { images: chatImages } : undefined
      )) {
        switch (chunk.type) {
          case "thinking":
            updateSpinner(`Thinking... (${((Date.now() - thinkStart) / 1000).toFixed(1)}s)`);
            break;

          case "tool_call": {
            stopSpinner();

            // Parse tool args if available
            let toolArgs: Record<string, unknown> = {};
            try {
              if (chunk.content.includes("{")) {
                const jsonStart = chunk.content.indexOf("{");
                toolArgs = JSON.parse(chunk.content.slice(jsonStart));
                currentToolName = chunk.content.slice(0, jsonStart).trim();
              } else {
                currentToolName = chunk.content;
              }
            } catch {
              currentToolName = chunk.content;
            }

            const tc: ToolCallDisplay = { name: currentToolName, args: toolArgs, status: "pending" };
            process.stdout.write(formatToolCall(tc) + "\n");
            currentToolStart = Date.now();
            startToolSpinner(currentToolName);
            break;
          }

          case "tool_result": {
            const elapsed = Date.now() - currentToolStart;
            const isError = chunk.content.toLowerCase().includes("error") ||
                           chunk.content.toLowerCase().includes("failed") ||
                           chunk.content.toLowerCase().includes("exception");

            if (isError) {
              failSpinner();
            } else {
              succeedSpinner();
            }

            const maxLen = verboseMode ? 2000 : 200;
            const tc: ToolCallDisplay = {
              name: currentToolName || "tool",
              args: {},
              status: isError ? "error" : "ok",
              result: chunk.content.slice(0, maxLen),
              durationMs: elapsed,
            };
            process.stdout.write(formatToolCall(tc) + "\n");
            break;
          }

          case "text":
            if (firstText) {
              stopSpinner();
              console.log(); // blank line before response text
              firstText = false;
            }
            accumulatedText += chunk.content;
            process.stdout.write(chunk.content);
            break;

          case "usage": {
            try {
              const usage = JSON.parse(chunk.content);
              realInputTokens = usage.inputTokens ?? 0;
              realOutputTokens = usage.outputTokens ?? 0;
            } catch {}
            break;
          }

          case "context_compacted":
            stopSpinner();
            console.log(chalk.dim("  ⟳ Context auto-compacted"));
            startThinkingSpinner();
            break;

          case "done":
            if (firstText) stopSpinner();
            // Ensure response text ends with a newline before stats
            if (accumulatedText && !accumulatedText.endsWith("\n")) {
              process.stdout.write("\n");
            }
            break;
        }
      }

      // ── Stats line ──
      // Use real Gemini API token counts when available, fall back to estimation
      const outputTokens = realOutputTokens || Math.ceil(accumulatedText.length / 4);
      const inputTokens = realInputTokens || (Math.ceil(input.length / 4) + 100);
      tokenManager.recordUsage(config.gemini.models.pro, inputTokens, outputTokens);

      const elapsed = ((Date.now() - thinkStart) / 1000).toFixed(1);
      const totalTk = inputTokens + outputTokens;
      const stats = tokenManager.getStats();
      const cost = stats.sessionCost;
      const contextWindow = tokenManager.getContextWindow(config.gemini.models.pro);
      const pct = Math.round((stats.sessionTokens / contextWindow) * 100);

      // Format model name
      const modelDisplay = config.gemini.models.pro
        .replace("gemini-", "")
        .replace("-preview", "")
        .split("-")
        .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");

      renderer.renderStats({
        model: modelDisplay,
        tokens: totalTk,
        cost,
        contextPercent: pct,
        elapsed,
        mode: agent.getMode() === "plan" ? "plan" : undefined,
        backend: vertexEnabled ? "Vertex" : undefined,
      });

      // ── Status bar (rendered between responses) ──
      statusBar.setState({
        tokens: stats.sessionTokens,
        cost: stats.sessionCost,
        memory: "active",
        session: currentSession,
        contextPercent: pct,
      });
      statusBar.render();

    } catch (err) {
      stopSpinner();
      console.error(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
    }

    rl.resume();
    rl.prompt();
  });

  const cleanup = () => {
    try { history.save(); } catch {}
    try { mcpRegistry.stopAll(); } catch {}
    try { cronService.stop(); } catch {}
    try { reminderService.stop(); } catch {}
  };

  rl.on("close", () => {
    cleanup();
    console.log(chalk.dim("\nGoodbye!\n"));
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    cleanup();
    console.log(chalk.dim("\nGoodbye!\n"));
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
