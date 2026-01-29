import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createLogger } from "../infra/logger.js";

const log = createLogger("doctor");

interface DoctorOpts {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
  fix?: boolean;
  verbose?: boolean;
}

interface CheckResult {
  label: string;
  pass: boolean;
  fixable: boolean;
  fixAction?: () => Promise<void> | void;
  detail?: string;
}

export async function runDoctor(opts: DoctorOpts) {
  const chalk = (await import("chalk")).default;
  const os = await import("os");

  console.log(chalk.bold.cyan("\n┌─────────────────────────────────────────────────────────────┐"));
  console.log(chalk.bold.cyan("│") + chalk.bold("                     WISPY DOCTOR                            ") + chalk.bold.cyan("│"));
  console.log(chalk.bold.cyan("└─────────────────────────────────────────────────────────────┘\n"));

  const results: CheckResult[] = [];
  let fixedCount = 0;

  const check = async (result: CheckResult): Promise<boolean> => {
    results.push(result);

    if (!result.pass && opts.fix && result.fixable && result.fixAction) {
      try {
        await result.fixAction();
        console.log(`  ${chalk.yellow("⚡")} ${result.label} ${chalk.yellow("(fixed)")}`);
        fixedCount++;
        return true;
      } catch (err) {
        console.log(`  ${chalk.red("✗")} ${result.label} ${chalk.red("(fix failed)")}`);
        if (result.detail) console.log(chalk.dim(`    → ${result.detail}`));
        return false;
      }
    }

    const icon = result.pass ? chalk.green("✓") : chalk.red("✗");
    const fixNote = !result.pass && result.fixable ? chalk.yellow(" (fixable)") : "";
    console.log(`  ${icon} ${result.label}${fixNote}`);

    if (!result.pass && result.detail && opts.verbose) {
      console.log(chalk.dim(`    → ${result.detail}`));
    }

    return result.pass;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // System Checks
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  System\n"));

  // Node.js version
  const nodeVer = parseInt(process.versions.node.split(".")[0]);
  await check({
    label: `Node.js >= 20 (found ${process.versions.node})`,
    pass: nodeVer >= 20,
    fixable: false,
    detail: "Upgrade Node.js to version 20 or later",
  });

  // System info
  if (opts.verbose) {
    console.log(chalk.dim(`    OS: ${os.type()} ${os.release()} (${os.arch()})`));
    console.log(chalk.dim(`    Platform: ${process.platform}`));
    console.log(chalk.dim(`    Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total`));
    console.log(chalk.dim(`    Free: ${Math.round(os.freemem() / 1024 / 1024)}MB available`));
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Environment Checks
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Environment\n"));

  // GEMINI_API_KEY
  await check({
    label: "GEMINI_API_KEY environment variable",
    pass: !!process.env.GEMINI_API_KEY,
    fixable: false,
    detail: "Set GEMINI_API_KEY in your environment or .env file",
  });

  // Optional provider keys
  if (opts.verbose) {
    const optionalKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY"];
    for (const key of optionalKeys) {
      if (process.env[key]) {
        console.log(chalk.dim(`    ${key}: configured`));
      }
    }
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Directory Structure
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Directory Structure\n"));

  // Runtime directory
  await check({
    label: "Runtime directory exists",
    pass: existsSync(opts.runtimeDir),
    fixable: true,
    fixAction: () => { mkdirSync(opts.runtimeDir, { recursive: true }); },
    detail: `Create ${opts.runtimeDir}`,
  });

  // Config file
  const configPath = resolve(opts.runtimeDir, "config.yaml");
  await check({
    label: "Config file exists",
    pass: existsSync(configPath),
    fixable: true,
    fixAction: async () => {
      const { loadConfig } = await import("../config/config.js");
      loadConfig(opts.runtimeDir); // Creates default config
    },
    detail: "Run setup wizard or create config.yaml",
  });

  // Soul files
  const soulFiles = ["SOUL.md", "IDENTITY.md", "AGENTS.md", "BOOT.md"];
  for (const f of soulFiles) {
    const filePath = resolve(opts.soulDir, f);
    await check({
      label: `Soul file: ${f}`,
      pass: existsSync(filePath),
      fixable: f === "BOOT.md",
      fixAction: f === "BOOT.md" ? () => {
        writeFileSync(filePath, "# Boot Configuration\n\nDefault boot sequence.\n");
      } : undefined as (() => void | Promise<void>) | undefined,
      detail: `Create ${filePath}`,
    });
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // API Connectivity
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  API Connectivity\n"));

  // Gemini API
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      await check({
        label: "Gemini API reachable",
        pass: res.ok,
        fixable: false,
        detail: res.ok ? undefined : `HTTP ${res.status}: Check API key validity`,
      });

      if (res.ok && opts.verbose) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        const modelCount = data.models?.length || 0;
        console.log(chalk.dim(`    ${modelCount} models available`));
      }
    } catch (err) {
      await check({
        label: "Gemini API reachable",
        pass: false,
        fixable: false,
        detail: "Network error - check internet connection",
      });
    }
  } else {
    await check({
      label: "Gemini API reachable",
      pass: false,
      fixable: false,
      detail: "GEMINI_API_KEY not set",
    });
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Memory Database
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Memory Database\n"));

  const memoryDir = resolve(opts.runtimeDir, "memory");
  const dbPath = resolve(memoryDir, "embeddings.db");

  await check({
    label: "Memory directory exists",
    pass: existsSync(memoryDir),
    fixable: true,
    fixAction: () => { mkdirSync(memoryDir, { recursive: true }); },
  });

  await check({
    label: "Memory database exists",
    pass: existsSync(dbPath),
    fixable: true,
    fixAction: async () => {
      const { VectorStore } = await import("../memory/vector-store.js");
      const store = new VectorStore(opts.runtimeDir);
      store.close();
    },
    detail: "Will be created on first use",
  });

  if (existsSync(dbPath)) {
    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare("SELECT COUNT(*) as count FROM embeddings").get() as { count: number };
      console.log(chalk.dim(`    ${row.count} memories stored`));
      db.close();
    } catch (err) {
      console.log(chalk.dim(`    Could not read database`));
    }
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP Servers
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  MCP Servers\n"));

  try {
    const { McpRegistry } = await import("../mcp/client.js");
    const mcpReg = new McpRegistry(opts.runtimeDir);
    const status = mcpReg.getStatus();

    await check({
      label: `MCP servers configured: ${status.length}`,
      pass: true,
      fixable: false,
    });

    if (opts.verbose && status.length > 0) {
      for (const s of status) {
        const statusIcon = s.status === "running" ? chalk.green("●") : chalk.yellow("○");
        console.log(chalk.dim(`    ${statusIcon} ${s.id}: ${s.tools || 0} tools`));
      }
    }
  } catch (err) {
    await check({
      label: "MCP servers",
      pass: true,
      fixable: false,
      detail: "MCP not configured (optional)",
    });
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Channels
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Channels\n"));

  try {
    const { loadConfig } = await import("../config/config.js");
    const config = loadConfig(opts.runtimeDir);

    const channels = [
      { name: "Telegram", enabled: config.channels.telegram?.enabled, hasToken: !!config.channels.telegram?.token },
      { name: "WhatsApp", enabled: config.channels.whatsapp?.enabled, hasToken: true },
      { name: "Discord", enabled: config.channels.discord?.enabled, hasToken: !!config.channels.discord?.token },
      { name: "Slack", enabled: config.channels.slack?.enabled, hasToken: !!config.channels.slack?.token },
      { name: "Web", enabled: config.channels.web?.enabled, hasToken: true },
      { name: "REST", enabled: config.channels.rest?.enabled, hasToken: true },
    ];

    const enabledChannels = channels.filter(c => c.enabled);
    const configuredChannels = enabledChannels.filter(c => c.hasToken);

    await check({
      label: `Channels enabled: ${enabledChannels.length}`,
      pass: enabledChannels.length > 0,
      fixable: false,
    });

    if (enabledChannels.length > 0) {
      const needsSetup = enabledChannels.filter(c => !c.hasToken);
      if (needsSetup.length > 0) {
        console.log(chalk.yellow(`    Needs setup: ${needsSetup.map(c => c.name).join(", ")}`));
      }
    }

    if (opts.verbose) {
      for (const c of channels) {
        const status = c.enabled
          ? (c.hasToken ? chalk.green("ready") : chalk.yellow("needs token"))
          : chalk.dim("disabled");
        console.log(chalk.dim(`    ${c.name}: ${status}`));
      }
    }
  } catch {
    console.log(chalk.dim("    Could not check channels"));
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Wallet
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Wallet\n"));

  try {
    const { getWalletAddress } = await import("../wallet/x402.js");
    const walletAddr = getWalletAddress(opts.runtimeDir);

    await check({
      label: "Wallet initialized",
      pass: !!walletAddr,
      fixable: false,
      detail: walletAddr ? `Address: ${walletAddr.slice(0, 10)}...` : "Run wallet setup",
    });

    if (walletAddr && opts.verbose) {
      console.log(chalk.dim(`    Address: ${walletAddr}`));
    }
  } catch {
    await check({
      label: "Wallet",
      pass: true,
      fixable: false,
      detail: "Wallet not configured (optional)",
    });
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Skills
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Skills\n"));

  try {
    const { loadSkills } = await import("../skills/loader.js");
    const skills = loadSkills(opts.soulDir);

    await check({
      label: `Skills loaded: ${skills.length}`,
      pass: true,
      fixable: false,
    });

    if (opts.verbose && skills.length > 0) {
      for (const s of skills) {
        console.log(chalk.dim(`    ${s.name}: ${s.tools.length} tools`));
      }
    }
  } catch {
    await check({
      label: "Skills",
      pass: true,
      fixable: false,
      detail: "No skills loaded (optional)",
    });
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Cron Jobs
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold("  Cron Jobs\n"));

  const cronPath = resolve(opts.runtimeDir, "cron", "jobs.json");
  if (existsSync(cronPath)) {
    try {
      const { readJSON } = await import("../utils/file.js");
      const cronStore = readJSON<{ jobs: Array<{ name: string; enabled: boolean }> }>(cronPath);
      const jobs = cronStore?.jobs || [];
      const enabledJobs = jobs.filter(j => j.enabled);

      await check({
        label: `Cron jobs: ${jobs.length} total, ${enabledJobs.length} enabled`,
        pass: true,
        fixable: false,
      });

      if (opts.verbose && jobs.length > 0) {
        for (const j of jobs) {
          const status = j.enabled ? chalk.green("●") : chalk.dim("○");
          console.log(chalk.dim(`    ${status} ${j.name}`));
        }
      }
    } catch {
      console.log(chalk.dim("    Could not read cron configuration"));
    }
  } else {
    console.log(chalk.dim("    No cron jobs configured"));
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const fixable = results.filter(r => !r.pass && r.fixable).length;

  console.log(chalk.dim("  ─────────────────────────────────────────────────────────────\n"));

  if (failed === 0) {
    console.log(chalk.green.bold("  ✓ All checks passed!\n"));
  } else {
    console.log(chalk.yellow(`  ${passed} passed, ${failed} failed`));
    if (fixedCount > 0) {
      console.log(chalk.green(`  ${fixedCount} issues auto-fixed`));
    }
    if (fixable > fixedCount) {
      console.log(chalk.dim(`  Run with --fix to auto-fix ${fixable - fixedCount} issue(s)`));
    }
    console.log();
  }

  if (opts.verbose) {
    console.log(chalk.dim("  Verbose mode: showing all details\n"));
  } else {
    console.log(chalk.dim("  Run with --verbose for more details\n"));
  }

  return failed === 0;
}
