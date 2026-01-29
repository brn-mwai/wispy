#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "path";
import { loadEnv } from "../infra/dotenv.js";
import { logger, createLogger } from "../infra/logger.js";

// Silence logs for all CLI commands (clean output)
logger.level = "silent";

const log = createLogger("cli");

const ROOT_DIR = process.cwd();
const RUNTIME_DIR = resolve(ROOT_DIR, ".wispy");
const SOUL_DIR = resolve(ROOT_DIR, "wispy");

loadEnv(ROOT_DIR);

const program = new Command();

program
  .name("wispy")
  .description("Wispy — Autonomous AI Agent powered by Gemini 3")
  .version("0.1.0");

// === GATEWAY ===
program
  .command("gateway")
  .description("Start the Wispy gateway (main entry point)")
  .option("-p, --port <port>", "WebSocket port", "4000")
  .action(async (opts) => {
    log.info("Starting Wispy gateway...");
    const { startGateway } = await import("../gateway/server.js");
    await startGateway({
      rootDir: ROOT_DIR,
      runtimeDir: RUNTIME_DIR,
      soulDir: SOUL_DIR,
      port: parseInt(opts.port),
    });
  });

// === ONBOARD ===
program
  .command("onboard")
  .description("Run first-time setup and onboarding")
  .action(async () => {
    log.info("Starting onboarding...");
    const { runOnboarding } = await import("../gateway/boot.js");
    await runOnboarding({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
  });

// === DOCTOR ===
program
  .command("doctor")
  .description("Check system health and dependencies")
  .action(async () => {
    const { runDoctor } = await import("./doctor.js");
    await runDoctor({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
  });

// === AGENT (direct chat) ===
program
  .command("agent")
  .description("Send a message directly to the agent")
  .argument("<message>", "Message to send")
  .option("-s, --session <key>", "Session key", "main")
  .option("-t, --thinking <level>", "Thinking level: minimal, low, medium, high")
  .action(async (message, opts) => {
    const { loadConfig } = await import("../config/config.js");
    const { initGemini } = await import("../ai/gemini.js");
    const { Agent } = await import("../core/agent.js");
    const { runBoot } = await import("../gateway/boot.js");

    await runBoot({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
    const config = loadConfig(RUNTIME_DIR);
    const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error("GEMINI_API_KEY not set"); process.exit(1); }
    initGemini(apiKey);

    const agent = new Agent({ config, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
    const result = await agent.chat(message, "cli-user", "cli", "main");

    if (result.thinking) {
      console.log("\n> Thinking:", result.thinking.slice(0, 200));
    }
    console.log("\n" + result.text);

    if (result.toolResults && result.toolResults.length > 0) {
      console.log(`\n${result.toolResults.length} tool(s) executed`);
    }
    process.exit(0);
  });

// === CHANNELS ===
const channels = program
  .command("channels")
  .description("Manage messaging channels");

channels
  .command("list")
  .description("List configured channels and their status")
  .action(async () => {
    const { loadConfig } = await import("../config/config.js");
    const config = loadConfig(RUNTIME_DIR);
    console.log("\nConfigured Channels:");
    const ch = config.channels;
    if (ch.telegram) console.log(`  Telegram: ${ch.telegram.enabled ? "\x1b[32m✓\x1b[0m enabled" : "\x1b[31m✗\x1b[0m disabled"}`);
    if (ch.whatsapp) console.log(`  WhatsApp: ${ch.whatsapp.enabled ? "\x1b[32m✓\x1b[0m enabled" : "\x1b[31m✗\x1b[0m disabled"}`);
    if (ch.web) console.log(`  Web:      ${ch.web.enabled ? `\x1b[32m✓\x1b[0m port ${ch.web.port}` : "\x1b[31m✗\x1b[0m disabled"}`);
    if (ch.rest) console.log(`  REST:     ${ch.rest.enabled ? `\x1b[32m✓\x1b[0m port ${ch.rest.port}` : "\x1b[31m✗\x1b[0m disabled"}`);
    console.log();
  });

channels
  .command("status")
  .description("Show live channel connection status")
  .action(async () => {
    const { getAllChannels } = await import("../channels/dock.js");
    const all = getAllChannels();
    if (all.length === 0) {
      console.log("No channels running. Start the gateway first.");
      return;
    }
    console.log("\nChannel Status:");
    for (const ch of all) {
      const icon = ch.status === "connected" ? "\x1b[32m✓\x1b[0m" : ch.status === "error" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m○\x1b[0m";
      console.log(`  ${icon} ${ch.name} (${ch.type}) — ${ch.status}`);
    }
    console.log();
  });

// === SESSIONS ===
const sessions = program
  .command("sessions")
  .description("Manage agent sessions");

sessions
  .command("list")
  .description("List all sessions")
  .action(async () => {
    const { loadConfig } = await import("../config/config.js");
    const { loadRegistry } = await import("../core/session.js");
    const config = loadConfig(RUNTIME_DIR);
    const reg = loadRegistry(RUNTIME_DIR, config.agent.id);
    const entries = Object.values(reg.sessions);
    if (entries.length === 0) {
      console.log("No sessions found.");
      return;
    }
    console.log(`\n${entries.length} session(s):\n`);
    for (const s of entries) {
      console.log(`  ${s.sessionKey}`);
      console.log(`    Type: ${s.sessionType} | Channel: ${s.channel} | Messages: ${s.messageCount}`);
      console.log(`    Last active: ${s.lastActiveAt}`);
    }
    console.log();
  });

sessions
  .command("history")
  .description("View session transcript")
  .argument("<sessionKey>", "Session key")
  .option("-n, --limit <n>", "Number of messages", "20")
  .action(async (sessionKey, opts) => {
    const { loadConfig } = await import("../config/config.js");
    const { loadHistory } = await import("../core/session.js");
    const config = loadConfig(RUNTIME_DIR);
    const history = loadHistory(RUNTIME_DIR, config.agent.id, sessionKey);
    const limit = parseInt(opts.limit);
    const msgs = history.slice(-limit);
    console.log(`\nSession: ${sessionKey} (showing last ${msgs.length} of ${history.length}):\n`);
    for (const m of msgs) {
      const prefix = m.role === "user" ? ">" : m.role === "model" ? "\x1b[36m~\x1b[0m" : "\x1b[33m*\x1b[0m";
      console.log(`${prefix} [${m.timestamp}]`);
      console.log(`   ${m.content.slice(0, 300)}`);
      console.log();
    }
  });

// === MEMORY ===
const memory = program
  .command("memory")
  .description("Manage agent memory system");

memory
  .command("search")
  .description("Search agent memory")
  .argument("<query>", "Search query")
  .action(async (query) => {
    const { loadConfig } = await import("../config/config.js");
    const { initGemini } = await import("../ai/gemini.js");
    const { MemoryManager } = await import("../memory/manager.js");
    const { runBoot } = await import("../gateway/boot.js");

    await runBoot({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
    const config = loadConfig(RUNTIME_DIR);
    const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
    if (apiKey) initGemini(apiKey);

    const mm = new MemoryManager(RUNTIME_DIR, config);
    const results = await mm.search(query);
    if (results.length === 0) {
      console.log("No memories found for: " + query);
      return;
    }
    console.log(`\nMemory search: "${query}"\n`);
    for (const r of results) {
      console.log(`  [${r.score.toFixed(2)}] ${r.text.slice(0, 200)}`);
      console.log(`    Source: ${r.source}\n`);
    }
    mm.close();
  });

memory
  .command("status")
  .description("Show memory index statistics")
  .action(async () => {
    const { existsSync, statSync } = await import("fs");
    const dbPath = resolve(RUNTIME_DIR, "memory", "embeddings.db");
    if (!existsSync(dbPath)) {
      console.log("Memory database not initialized.");
      return;
    }
    const stats = statSync(dbPath);
    console.log(`\nMemory Database:`);
    console.log(`  Path: ${dbPath}`);
    console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log();
  });

// === CRON ===
const cron = program
  .command("cron")
  .description("Manage scheduled tasks");

cron
  .command("list")
  .description("List all cron jobs")
  .action(async () => {
    const { readJSON } = await import("../utils/file.js");
    const store = readJSON<{ jobs: any[] }>(resolve(RUNTIME_DIR, "cron", "jobs.json"));
    if (!store || store.jobs.length === 0) {
      console.log("No cron jobs scheduled.");
      return;
    }
    console.log(`\n${store.jobs.length} cron job(s):\n`);
    for (const job of store.jobs) {
      const icon = job.enabled ? "\x1b[32m✓\x1b[0m" : "\x1b[33m○\x1b[0m";
      console.log(`  ${icon} ${job.name} (${job.cron})`);
      console.log(`    ${job.instruction.slice(0, 80)}`);
      if (job.lastRunAt) console.log(`    Last run: ${job.lastRunAt}`);
      console.log();
    }
  });

cron
  .command("create")
  .description("Create a new cron job")
  .requiredOption("--name <name>", "Job name")
  .requiredOption("--cron <expression>", "Cron expression")
  .requiredOption("--instruction <text>", "What to do")
  .action(async (opts) => {
    const { loadConfig } = await import("../config/config.js");
    const { initGemini } = await import("../ai/gemini.js");
    const { Agent } = await import("../core/agent.js");
    const { CronService } = await import("../cron/service.js");
    const { runBoot } = await import("../gateway/boot.js");

    await runBoot({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
    const config = loadConfig(RUNTIME_DIR);
    const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
    if (apiKey) initGemini(apiKey);

    const agent = new Agent({ config, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
    const cronSvc = new CronService(RUNTIME_DIR, agent);
    const job = cronSvc.addJob(opts.name, opts.cron, opts.instruction);
    console.log(`\x1b[32m✓\x1b[0m Created cron job: ${job.name} (${job.cron})`);
  });

// === SKILLS ===
const skills = program
  .command("skills")
  .description("Manage agent skills");

skills
  .command("list")
  .description("List installed skills")
  .action(async () => {
    const { loadSkills } = await import("../skills/loader.js");
    const loaded = loadSkills(SOUL_DIR);
    if (loaded.length === 0) {
      console.log("No skills installed.");
      return;
    }
    console.log(`\n${loaded.length} skill(s):\n`);
    for (const s of loaded) {
      console.log(`  ${s.name} — ${s.description}`);
      if (s.tools.length > 0) {
        console.log(`    Tools: ${s.tools.map((t) => t.name).join(", ")}`);
      }
    }
    console.log();
  });

skills
  .command("create")
  .description("Interactive skill creation wizard")
  .action(async () => {
    const { runSkillWizard } = await import("./skill-wizard.js");
    await runSkillWizard(SOUL_DIR);
  });

// === PAIRING ===
const pairing = program
  .command("pairing")
  .description("Manage user pairing for channels");

pairing
  .command("list")
  .description("List paired users")
  .argument("<channel>", "Channel name (telegram, whatsapp)")
  .action(async (channel) => {
    const { loadPairing } = await import("../security/auth.js");
    const state = loadPairing(RUNTIME_DIR, channel);
    const pairs = Object.values(state.paired);
    if (pairs.length === 0) {
      console.log(`No paired users on ${channel}.`);
      return;
    }
    console.log(`\nPaired users on ${channel}:\n`);
    for (const p of pairs) {
      console.log(`  ${p.peerId} — paired at ${p.pairedAt}`);
    }
    console.log();
  });

// === WALLET ===
const wallet = program
  .command("wallet")
  .description("Manage x402 crypto wallet");

wallet
  .command("status")
  .description("Show wallet address and balance")
  .action(async () => {
    const { getWalletAddress, getBalance } = await import("../wallet/x402.js");
    const address = getWalletAddress(RUNTIME_DIR);
    if (!address) {
      console.log("Wallet not initialized. Run 'wispy gateway' first.");
      return;
    }
    console.log(`\nWallet:`);
    console.log(`  Address: ${address}`);
    try {
      const balance = await getBalance(RUNTIME_DIR);
      console.log(`  USDC Balance: ${balance}`);
    } catch {
      console.log(`  Balance: (could not fetch — check network)`);
    }
    console.log();
  });

wallet
  .command("init")
  .description("Initialize a new wallet")
  .action(async () => {
    const { loadOrCreateIdentity } = await import("../security/device-identity.js");
    const { initWallet } = await import("../wallet/x402.js");
    const { runBoot } = await import("../gateway/boot.js");

    await runBoot({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
    const identity = loadOrCreateIdentity(RUNTIME_DIR);
    const info = initWallet(RUNTIME_DIR, identity);
    console.log(`\n\x1b[32m✓\x1b[0m Wallet initialized:`);
    console.log(`  Address: ${info.address}`);
    console.log(`  Chain: ${info.chain}`);
    console.log();
  });

// === CONFIG ===
const configCmd = program
  .command("config")
  .description("Manage configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    const { loadConfig } = await import("../config/config.js");
    const config = loadConfig(RUNTIME_DIR);
    console.log("\nCurrent Configuration:\n");
    console.log(JSON.stringify(config, null, 2));
    console.log();
  });

configCmd
  .command("path")
  .description("Show config file path")
  .action(() => {
    console.log(resolve(RUNTIME_DIR, "config.yaml"));
  });

// === PEERS (A2A) ===
const peers = program
  .command("peers")
  .description("Manage agent-to-agent peers");

peers
  .command("list")
  .description("List known peers")
  .action(async () => {
    const { listPeers } = await import("../a2a/peer.js");
    const all = listPeers(RUNTIME_DIR);
    if (all.length === 0) {
      console.log("No peers discovered.");
      return;
    }
    console.log(`\n${all.length} peer(s):\n`);
    for (const p of all) {
      console.log(`  ${p.name} (${p.deviceId.slice(0, 12)}...)`);
      console.log(`    Endpoint: ${p.endpoint}`);
      console.log(`    Last seen: ${p.lastSeenAt}`);
    }
    console.log();
  });

// === STATUS ===
program
  .command("status")
  .description("Show overall system status")
  .action(async () => {
    const { existsSync } = await import("fs");
    const { loadConfig } = await import("../config/config.js");
    const { loadRegistry } = await import("../core/session.js");
    const { loadSkills } = await import("../skills/loader.js");
    const { getWalletAddress } = await import("../wallet/x402.js");
    const { listPeers } = await import("../a2a/peer.js");
    const { readJSON } = await import("../utils/file.js");

    const hasRuntime = existsSync(RUNTIME_DIR);
    const hasIdentity = existsSync(resolve(RUNTIME_DIR, "identity", "device.json"));

    console.log("\nWispy Status\n");
    console.log(`  Runtime:    ${hasRuntime ? "\x1b[32m✓\x1b[0m initialized" : "\x1b[31m✗\x1b[0m not initialized"}`);
    console.log(`  Identity:   ${hasIdentity ? "\x1b[32m✓\x1b[0m created" : "\x1b[31m✗\x1b[0m missing"}`);

    if (hasRuntime) {
      const config = loadConfig(RUNTIME_DIR);
      const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
      console.log(`  Gemini API: ${apiKey && apiKey !== "your_gemini_api_key_here" ? "\x1b[32m✓\x1b[0m configured" : "\x1b[31m✗\x1b[0m missing"}`);

      const reg = loadRegistry(RUNTIME_DIR, config.agent.id);
      const sessionCount = Object.keys(reg.sessions).length;
      console.log(`  Sessions:   ${sessionCount}`);

      const skills = loadSkills(SOUL_DIR);
      console.log(`  Skills:     ${skills.length}`);

      const walletAddr = getWalletAddress(RUNTIME_DIR);
      console.log(`  Wallet:     ${walletAddr ? walletAddr.slice(0, 10) + "..." : "not initialized"}`);

      const peersList = listPeers(RUNTIME_DIR);
      console.log(`  Peers:      ${peersList.length}`);

      const cronStore = readJSON<{ jobs: any[] }>(resolve(RUNTIME_DIR, "cron", "jobs.json"));
      console.log(`  Cron jobs:  ${cronStore?.jobs?.length || 0}`);

      const dbPath = resolve(RUNTIME_DIR, "memory", "embeddings.db");
      console.log(`  Memory DB:  ${existsSync(dbPath) ? "\x1b[32m✓\x1b[0m" : "not created"}`);
    }
    console.log();
  });

// === SETUP WIZARD ===
program
  .command("setup")
  .description("Run the interactive setup wizard")
  .action(async () => {
    const { runSetupWizard } = await import("./setup/wizard.js");
    await runSetupWizard({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
  });

// === AUTO-START ===
const autostart = program
  .command("autostart")
  .description("Manage auto-start on boot");

autostart
  .command("install")
  .description("Install auto-start service for the current platform")
  .action(async () => {
    const { installAutoStart } = await import("../autostart/service.js");
    try {
      const result = installAutoStart(ROOT_DIR, RUNTIME_DIR, SOUL_DIR);
      console.log(`\n\x1b[32m✓\x1b[0m Auto-start installed (${result.platform})`);
      console.log(`   ${result.instructions}\n`);
    } catch (err) {
      console.error(`\n\x1b[31m✗\x1b[0m Failed: ${err instanceof Error ? err.message : err}\n`);
    }
  });

autostart
  .command("remove")
  .description("Remove auto-start service")
  .action(async () => {
    const { removeAutoStart } = await import("../autostart/service.js");
    removeAutoStart();
    console.log("\n\x1b[32m✓\x1b[0m Auto-start removed.\n");
  });

// === INTEGRATIONS ===
const integrations = program
  .command("integrations")
  .description("Manage integrations");

async function getIntegrationRegistry() {
    const { loadIntegrations } = await import("../integrations/loader.js");
    const { CredentialManager } = await import("../integrations/credential-manager.js");
    const { loadConfig } = await import("../config/config.js");
    const { createLogger: cl } = await import("../infra/logger.js");
    const config = loadConfig(RUNTIME_DIR);
    const { loadOrCreateIdentity } = await import("../security/device-identity.js");
    const identity = loadOrCreateIdentity(RUNTIME_DIR);
    const credMgr = new CredentialManager(RUNTIME_DIR, Buffer.from(identity.deviceId, "hex"));
    return loadIntegrations({
      config,
      runtimeDir: RUNTIME_DIR,
      soulDir: SOUL_DIR,
      credentialManager: credMgr,
      logger: cl("integrations"),
    });
  }

integrations
  .command("list")
  .description("List all available integrations by category")
  .action(async () => {
    const registry = await getIntegrationRegistry();
    const status = registry.getStatus();
    console.log(`\nIntegrations (${status.length}):\n`);
    const byCategory = new Map<string, typeof status>();
    for (const s of status) {
      const list = byCategory.get(s.category) || [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    for (const [cat, items] of byCategory) {
      console.log(`  ${cat.toUpperCase()}`);
      for (const item of items) {
        const icon = item.status === "active" ? "\x1b[32m✓\x1b[0m" : "\x1b[2m○\x1b[0m";
        console.log(`    ${icon} ${item.id} — ${item.name}`);
      }
      console.log();
    }
  });

integrations
  .command("enable")
  .description("Enable an integration")
  .argument("<id>", "Integration ID")
  .action(async (id) => {
    const registry = await getIntegrationRegistry();
    try {
      await registry.enable(id);
      console.log(`\n\x1b[32m✓\x1b[0m Enabled: ${id}\n`);
    } catch (err) {
      console.error(`\n\x1b[31m✗\x1b[0m ${err instanceof Error ? err.message : err}\n`);
    }
  });

integrations
  .command("disable")
  .description("Disable an integration")
  .argument("<id>", "Integration ID")
  .action(async (id) => {
    const registry = await getIntegrationRegistry();
    await registry.disable(id);
    console.log(`\n\x1b[2m○\x1b[0m Disabled: ${id}\n`);
  });

// === MARATHON AGENT ===
program
  .command("marathon")
  .description("Autonomous multi-day task execution with Gemini 3")
  .argument("[goal]", "The goal for the marathon agent")
  .option("--status", "Show status of active marathon")
  .option("--list", "List all marathons")
  .option("--pause", "Pause active marathon")
  .option("--resume [id]", "Resume a paused marathon")
  .option("--abort", "Abort active marathon")
  .option("--logs [id]", "View marathon logs")
  .action(async (goal, opts) => {
    const { MarathonService, displayMarathonStatus, formatDuration } = await import("../marathon/service.js");
    const { loadConfig } = await import("../config/config.js");
    const { Agent } = await import("../core/agent.js");
    const chalk = (await import("chalk")).default;

    const config = loadConfig(RUNTIME_DIR);
    const marathonService = new MarathonService(RUNTIME_DIR);

    if (opts.status) {
      const state = marathonService.getStatus();
      if (!state) {
        console.log(chalk.dim("\n  No active marathons.\n"));
        return;
      }
      displayMarathonStatus(state);
      return;
    }

    if (opts.list) {
      const marathons = marathonService.listMarathons();
      if (marathons.length === 0) {
        console.log(chalk.dim("\n  No marathons found.\n"));
        return;
      }
      console.log(chalk.bold.cyan("\n  Marathons:\n"));
      for (const m of marathons.slice(0, 10)) {
        const statusColors: Record<string, (s: string) => string> = {
          planning: chalk.blue,
          executing: chalk.yellow,
          paused: chalk.gray,
          completed: chalk.green,
          failed: chalk.red,
        };
        const color = statusColors[m.status] || chalk.white;
        console.log(`  ${color(m.status.padEnd(10))} ${chalk.dim(m.id)} ${m.plan.goal.slice(0, 50)}...`);
      }
      console.log();
      return;
    }

    if (opts.pause) {
      marathonService.pause();
      return;
    }

    if (opts.abort) {
      marathonService.abort();
      return;
    }

    if (opts.resume !== undefined) {
      const marathonId = typeof opts.resume === "string" ? opts.resume : undefined;
      const state = marathonService.getStatus(marathonId);
      if (!state || state.status !== "paused") {
        console.log(chalk.red("  No paused marathon found to resume."));
        return;
      }
      const apiKey = config.gemini.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.log(chalk.red("  Error: Gemini API key not configured."));
        return;
      }
      const agent = new Agent({
        config,
        runtimeDir: RUNTIME_DIR,
        soulDir: SOUL_DIR,
              });
      await marathonService.resume(state.id, agent, apiKey);
      return;
    }

    if (opts.logs !== undefined) {
      const marathonId = typeof opts.logs === "string" ? opts.logs : undefined;
      const state = marathonService.getStatus(marathonId);
      if (!state) {
        console.log(chalk.dim("\n  No marathon found.\n"));
        return;
      }
      console.log(chalk.bold.cyan(`\n  Marathon Logs: ${state.plan.goal.slice(0, 40)}...\n`));
      for (const log of state.logs.slice(-30)) {
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(`  ${chalk.dim(time)} ${log.message}`);
      }
      console.log();
      return;
    }

    // Start new marathon
    if (!goal) {
      console.log(chalk.bold.cyan("\n  🏃 Marathon Agent - Autonomous Multi-Day Execution\n"));
      console.log("  Usage:");
      console.log(chalk.green("    wispy marathon \"<goal>\"") + chalk.dim(" - Start autonomous execution"));
      console.log(chalk.dim("    wispy marathon --status") + " - View status");
      console.log(chalk.dim("    wispy marathon --list") + " - List all marathons");
      console.log(chalk.dim("    wispy marathon --pause") + " - Pause execution");
      console.log(chalk.dim("    wispy marathon --resume") + " - Resume execution");
      console.log(chalk.dim("    wispy marathon --logs") + " - View logs");
      console.log();
      console.log("  Example:");
      console.log(chalk.green('    wispy marathon "Build a todo app with React, Express, and MongoDB"'));
      console.log(chalk.green('    wispy marathon "Create a CLI tool that converts images to ASCII art"'));
      console.log();
      return;
    }

    const apiKey = config.gemini.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log(chalk.red("\n  Error: Gemini API key not configured."));
      console.log(chalk.dim("  Run: wispy onboard\n"));
      return;
    }

    const agent = new Agent({
      config,
      runtimeDir: RUNTIME_DIR,
      soulDir: SOUL_DIR,
          });

    await marathonService.start(goal, agent, apiKey, {
      workingDirectory: process.cwd(),
    });
  });

// === INTERACTIVE REPL (default) ===
program
  .command("chat", { isDefault: true })
  .description("Start interactive REPL (default)")
  .action(async () => {
    const { startRepl } = await import("./repl.js");
    await startRepl({ rootDir: ROOT_DIR, runtimeDir: RUNTIME_DIR, soulDir: SOUL_DIR });
  });

// === MCP SERVER (for Antigravity) ===
program
  .command("mcp-server")
  .description("Start Wispy as an MCP server (stdio) for Antigravity / VS Code")
  .action(async () => {
    const { startMcpServer } = await import("../mcp/server.js");
    await startMcpServer(ROOT_DIR);
  });

program.parse();
