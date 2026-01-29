/**
 * Wispy REPL — Clean CLI modeled exactly after Claude Code.
 *
 * Layout:
 *   [cloud icon]  Wispy v0.4.6
 *                 Gemini 2.5 Flash
 *                 C:\Users\...
 *
 *   ─────────────────────────────────
 *   ❯ user input here
 *
 *   ● Agent response here.
 *
 *   ─────────────────────────────────
 *   ❯ _
 *     ? for shortcuts
 */

import * as readline from "readline";
import { existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { showBanner } from "./ui/banner.js";
import { t } from "./ui/theme.js";
import { startSpinner, startThinkingSpinner, stopSpinner, updateSpinner } from "./ui/spinner.js";
import { formatToolCall, type ToolCallDisplay } from "./ui/tool-display.js";
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

export interface ReplOpts {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
}

function printSeparator(): void {
  const width = process.stdout.columns || 80;
  console.log(chalk.dim("─".repeat(width)));
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
  const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set. Add it to .env or config.");
    process.exit(1);
  }
  initGemini(apiKey);
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

  // ── Launch layout ──
  showBanner(config.gemini.models.pro);
  printSeparator();

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
    console.error(chalk.red(`Fatal: ${err.message}`));
    rl.prompt();
  });
  process.on("unhandledRejection", (err) => {
    stopSpinner();
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    rl.prompt();
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
        // Exact or single match - execute it
        try { await handleSlashCommand("/" + matches[0].name, cmdCtx); } catch (err) {
          console.error(chalk.red(`Command error: ${err instanceof Error ? err.message : String(err)}`));
        }
        rl.resume();
        rl.prompt();
        return;
      }

      // Multiple matches - show options
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
    try {
      let firstText = true;
      let outputChars = 0;

      for await (const chunk of agent.chatStream(input, "cli-user", "cli", "main")) {
        switch (chunk.type) {
          case "thinking":
            updateSpinner(`Thinking... (${((Date.now() - thinkStart) / 1000).toFixed(1)}s)`);
            break;

          case "tool_call": {
            stopSpinner();
            const tc: ToolCallDisplay = { name: chunk.content, args: {}, status: "pending" };
            process.stdout.write(formatToolCall(tc) + "\n");
            break;
          }

          case "tool_result": {
            const maxLen = verboseMode ? 2000 : 200;
            const tr: ToolCallDisplay = { name: "tool", args: {}, status: "ok", result: chunk.content.slice(0, maxLen) };
            process.stdout.write(formatToolCall(tr) + "\n");
            break;
          }

          case "text":
            if (firstText) {
              stopSpinner();
              process.stdout.write("\n" + chalk.white.bold("● "));
              firstText = false;
            }
            process.stdout.write(chunk.content);
            outputChars += chunk.content.length;
            break;

          case "context_compacted":
            stopSpinner();
            console.log(chalk.dim("  ⟳ Context auto-compacted"));
            startThinkingSpinner();
            break;

          case "done":
            if (firstText) stopSpinner();
            break;
        }
      }

      const outputTokens = Math.ceil(outputChars / 4);
      const inputTokens = Math.ceil(input.length / 4) + 100;
      tokenManager.recordUsage("gemini-2.5-flash", inputTokens, outputTokens);

      const elapsed = ((Date.now() - thinkStart) / 1000).toFixed(1);
      const totalTk = (inputTokens + outputTokens).toLocaleString();
      const stats = tokenManager.getStats();
      const cost = stats.sessionCost.toFixed(4);

      const pct = Math.round((stats.sessionTokens / stats.budget.maxTokensPerSession) * 100);
      const modeTag = agent.getMode() === "plan" ? chalk.yellow(" [plan]") : "";

      console.log();
      console.log(chalk.dim(`  Gemini 2.5 Flash · ${totalTk} tokens · $${cost} · ${pct}% context · ${elapsed}s${modeTag}`));
      console.log();
      printSeparator();
      console.log(chalk.dim("  ? for shortcuts"));
    } catch (err) {
      stopSpinner();
      console.error(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
      printSeparator();
    }

    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    history.save();
    mcpRegistry.stopAll();
    console.log(chalk.dim("\nGoodbye!\n"));
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    history.save();
    mcpRegistry.stopAll();
    console.log(chalk.dim("\nGoodbye!\n"));
    process.exit(0);
  });
}
