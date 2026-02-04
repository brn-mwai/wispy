#!/usr/bin/env node
/**
 * Automated Setup Wizard
 *
 * One-time setup that configures everything:
 * - AI Provider (Gemini API or Vertex AI)
 * - Wallet (auto-generated)
 * - Channels (Telegram, WhatsApp, Discord)
 * - Integrations (Google Calendar, etc.)
 *
 * User only provides API keys - everything else is automatic.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import chalk from "chalk";
import { writeYAML } from "../../utils/file.js";

// Colors
const sky = chalk.rgb(49, 204, 255);
const green = chalk.green;
const yellow = chalk.yellow;
const red = chalk.red;
const dim = chalk.dim;
const bold = chalk.bold;

const LOGO = `
  ${sky("██╗    ██╗ ██╗ ███████╗ ██████╗  ██╗   ██╗")}
  ${sky("██║    ██║ ██║ ██╔════╝ ██╔══██╗ ╚██╗ ██╔╝")}
  ${sky("██║ █╗ ██║ ██║ ███████╗ ██████╔╝  ╚████╔╝ ")}
  ${sky("██║███╗██║ ██║ ╚════██║ ██╔═══╝    ╚██╔╝  ")}
  ${sky("╚███╔███╔╝ ██║ ███████║ ██║         ██║   ")}
  ${sky(" ╚══╝╚══╝  ╚═╝ ╚══════╝ ╚═╝         ╚═╝   ")}
`;

interface SetupConfig {
  // AI
  geminiApiKey?: string;
  vertexProject?: string;
  vertexCredentialsPath?: string;

  // Channels
  telegramToken?: string;
  discordToken?: string;

  // Payments
  cdpKeyId?: string;
  cdpKeySecret?: string;

  // Wallet (auto-generated)
  wallet?: {
    address: string;
    privateKey: string;
    mnemonic: string;
  };
}

function ask(rl: readline.Interface, question: string, isSecret = false): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printStep(num: number, title: string) {
  console.log(`\n  ${sky(`[${num}/6]`)} ${bold(title)}\n`);
}

function printSuccess(msg: string) {
  console.log(`  ${green("✓")} ${msg}`);
}

function printSkipped(msg: string) {
  console.log(`  ${dim("○")} ${msg} ${dim("(skipped)")}`);
}

function printError(msg: string) {
  console.log(`  ${red("✗")} ${msg}`);
}

function printInfo(msg: string) {
  console.log(`  ${dim("→")} ${msg}`);
}

export async function runAutomatedSetup(opts: {
  rootDir: string;
  runtimeDir: string;
}): Promise<void> {
  const { rootDir, runtimeDir } = opts;
  const config: SetupConfig = {};

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle Ctrl+C
  rl.on("SIGINT", () => {
    console.log(dim("\n\n  Setup cancelled.\n"));
    rl.close();
    process.exit(0);
  });

  try {
    // ═══════════════════════════════════════════════════════════
    // WELCOME
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    console.log(bold("  Welcome to Wispy Setup!\n"));
    console.log(dim("  This wizard will configure everything automatically."));
    console.log(dim("  You just need to provide your API keys.\n"));
    console.log(dim("  ─────────────────────────────────────────────────────\n"));
    console.log(`  ${bold("What you'll set up:")}`);
    console.log(`  ${sky("1.")} AI Provider (Gemini or Vertex AI)`);
    console.log(`  ${sky("2.")} Blockchain Wallet (auto-generated)`);
    console.log(`  ${sky("3.")} Telegram Bot (optional)`);
    console.log(`  ${sky("4.")} Discord Bot (optional)`);
    console.log(`  ${sky("5.")} Payment System (optional)`);
    console.log(`  ${sky("6.")} Everything else (automatic)\n`);

    await ask(rl, dim("  Press Enter to start..."));

    // ═══════════════════════════════════════════════════════════
    // STEP 1: AI PROVIDER
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    printStep(1, "AI Provider Configuration");

    console.log(`  Choose your AI provider:\n`);
    console.log(`  ${sky("1)")} Gemini API ${dim("(Free tier available)")}`);
    console.log(`      Get key: ${sky("https://aistudio.google.com/apikey")}\n`);
    console.log(`  ${sky("2)")} Vertex AI ${dim("(Enterprise, requires GCP)")}`);
    console.log(`      Requires: Service account JSON file\n`);

    const aiChoice = await ask(rl, sky("  Select [1 or 2]: "));

    if (aiChoice === "2") {
      // Vertex AI
      console.log(`\n  ${bold("Vertex AI Setup")}\n`);

      const credPath = await ask(rl, sky("  Path to service account JSON: "));
      if (credPath && fs.existsSync(credPath)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
          config.vertexProject = creds.project_id;
          config.vertexCredentialsPath = path.resolve(credPath);
          printSuccess(`Project: ${creds.project_id}`);
          printSuccess("Vertex AI configured");
        } catch {
          printError("Invalid JSON file");
          config.geminiApiKey = await ask(rl, sky("  Fallback - Enter Gemini API key: "));
        }
      } else {
        printError("File not found");
        config.geminiApiKey = await ask(rl, sky("  Fallback - Enter Gemini API key: "));
      }
    } else {
      // Gemini API
      const existingKey = process.env.GEMINI_API_KEY;
      if (existingKey) {
        printSuccess(`Found existing key: ${existingKey.slice(0, 8)}...`);
        config.geminiApiKey = existingKey;
      } else {
        config.geminiApiKey = await ask(rl, sky("  Enter Gemini API key: "));
        if (config.geminiApiKey) {
          printSuccess("API key saved");
        } else {
          printSkipped("No API key provided");
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 2: WALLET (Auto-generated)
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    printStep(2, "Blockchain Wallet");

    console.log(dim("  Wispy needs a wallet for x402 payments and ERC-8004 identity."));
    console.log(dim("  A new wallet will be generated automatically.\n"));

    const wallet = ethers.Wallet.createRandom();
    config.wallet = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase || "",
    };

    printSuccess(`Wallet created: ${wallet.address.slice(0, 10)}...${wallet.address.slice(-6)}`);
    printInfo("Network: Base Sepolia (testnet)");
    printInfo(`Fund wallet: ${sky("https://faucet.quicknode.com/base/sepolia")}`);

    console.log(`\n  ${yellow("⚠")} ${bold("Save your recovery phrase:")}`);
    console.log(dim(`  "${config.wallet.mnemonic}"\n`));

    await ask(rl, dim("  Press Enter to continue..."));

    // ═══════════════════════════════════════════════════════════
    // STEP 3: TELEGRAM (Optional)
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    printStep(3, "Telegram Bot (Optional)");

    console.log(dim("  Control Wispy from your phone via Telegram.\n"));
    console.log(`  ${bold("To create a bot:")}`);
    console.log(`  1. Open Telegram and search ${sky("@BotFather")}`);
    console.log(`  2. Send ${sky("/newbot")} and follow instructions`);
    console.log(`  3. Copy the token (looks like: 123456:ABC-DEF...)\n`);

    const telegramToken = await ask(rl, sky("  Enter Telegram bot token (or press Enter to skip): "));
    if (telegramToken) {
      config.telegramToken = telegramToken;
      printSuccess("Telegram bot configured");
    } else {
      printSkipped("Telegram");
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: DISCORD (Optional)
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    printStep(4, "Discord Bot (Optional)");

    console.log(dim("  Add Wispy to your Discord server.\n"));
    console.log(`  ${bold("To create a bot:")}`);
    console.log(`  1. Go to ${sky("https://discord.com/developers/applications")}`);
    console.log(`  2. Create New Application → Bot → Copy Token\n`);

    const discordToken = await ask(rl, sky("  Enter Discord bot token (or press Enter to skip): "));
    if (discordToken) {
      config.discordToken = discordToken;
      printSuccess("Discord bot configured");
    } else {
      printSkipped("Discord");
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 5: PAYMENTS (Optional)
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    printStep(5, "x402 Payments (Optional)");

    console.log(dim("  Enable automatic crypto payments for premium APIs.\n"));
    console.log(`  ${bold("To get CDP credentials:")}`);
    console.log(`  1. Go to ${sky("https://portal.cdp.coinbase.com/")}`);
    console.log(`  2. Create API Key for Base network\n`);

    const cdpSetup = await ask(rl, sky("  Set up x402 payments? [y/N]: "));
    if (cdpSetup.toLowerCase() === "y") {
      config.cdpKeyId = await ask(rl, sky("  CDP API Key ID: "));
      config.cdpKeySecret = await ask(rl, sky("  CDP API Key Secret: "));
      if (config.cdpKeyId && config.cdpKeySecret) {
        printSuccess("x402 payments configured");
      }
    } else {
      printSkipped("x402 payments");
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 6: SAVE CONFIGURATION
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    printStep(6, "Saving Configuration");

    // Ensure directories exist
    fs.mkdirSync(runtimeDir, { recursive: true });

    // Save config.yaml
    const yamlConfig = {
      agent: {
        name: "wispy",
        id: "main",
      },
      gemini: {
        apiKey: config.geminiApiKey ? "${GEMINI_API_KEY}" : undefined,
        vertexai: config.vertexProject ? {
          project: config.vertexProject,
          location: "us-central1",
        } : undefined,
        models: {
          pro: "gemini-2.5-pro",
          flash: "gemini-2.5-flash",
          image: "imagen-3.0-generate-001",
          embedding: "text-embedding-004",
        },
      },
      channels: {
        web: { enabled: true, port: 4000 },
        rest: { enabled: true, port: 4001 },
        a2a: { enabled: true, port: 4002 },
        telegram: {
          enabled: !!config.telegramToken,
          token: config.telegramToken ? "${TELEGRAM_BOT_TOKEN}" : undefined,
        },
        discord: {
          enabled: !!config.discordToken,
          token: config.discordToken ? "${DISCORD_BOT_TOKEN}" : undefined,
        },
        whatsapp: { enabled: false },
      },
      marathon: {
        thinkingLevel: "ultra",
        maxMilestones: 20,
        checkpointInterval: 5,
      },
      x402: {
        enabled: !!(config.cdpKeyId && config.cdpKeySecret),
        network: "base-sepolia",
        maxSpendPerTask: 10.0,
      },
      erc8004: {
        enabled: true,
        network: "base-sepolia",
        contracts: {
          identityRegistry: "0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7",
        },
      },
      memory: {
        embeddingDimensions: 768,
        heartbeatIntervalMinutes: 30,
      },
      security: {
        requireApprovalForExternal: true,
      },
    };

    writeYAML(path.join(runtimeDir, "config.yaml"), yamlConfig);
    printSuccess("config.yaml saved");

    // Save integrations.json
    const integrations = {
      wallet: config.wallet,
      x402: {
        configured: !!(config.cdpKeyId && config.cdpKeySecret),
        cdpKeyId: config.cdpKeyId,
      },
      erc8004: {
        network: "base-sepolia",
        chainId: 84532,
        rpcUrl: "https://sepolia.base.org",
        contracts: {
          identityRegistry: "0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7",
        },
        deployed: true,
      },
      vertexai: config.vertexProject ? {
        configured: true,
        project: config.vertexProject,
        credentialsPath: config.vertexCredentialsPath,
      } : undefined,
      telegram: config.telegramToken ? {
        enabled: true,
        configured: true,
      } : undefined,
      discord: config.discordToken ? {
        enabled: true,
        configured: true,
      } : undefined,
    };

    fs.writeFileSync(
      path.join(runtimeDir, "integrations.json"),
      JSON.stringify(integrations, null, 2)
    );
    printSuccess("integrations.json saved");

    // Save .env file
    const envLines: string[] = [];
    if (config.geminiApiKey) envLines.push(`GEMINI_API_KEY=${config.geminiApiKey}`);
    if (config.vertexCredentialsPath) {
      envLines.push(`GOOGLE_APPLICATION_CREDENTIALS=${config.vertexCredentialsPath}`);
      envLines.push(`GOOGLE_CLOUD_PROJECT=${config.vertexProject}`);
    }
    if (config.telegramToken) envLines.push(`TELEGRAM_BOT_TOKEN=${config.telegramToken}`);
    if (config.discordToken) envLines.push(`DISCORD_BOT_TOKEN=${config.discordToken}`);
    if (config.cdpKeyId) envLines.push(`CDP_API_KEY_ID=${config.cdpKeyId}`);
    if (config.cdpKeySecret) envLines.push(`CDP_API_KEY_SECRET=${config.cdpKeySecret}`);
    if (config.wallet) envLines.push(`WALLET_PRIVATE_KEY=${config.wallet.privateKey}`);

    const envPath = path.join(rootDir, ".env.local");
    fs.writeFileSync(envPath, envLines.join("\n") + "\n");
    printSuccess(".env.local saved");

    rl.close();

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.clear();
    console.log(LOGO);
    console.log(bold(green("  ✓ Setup Complete!\n")));

    console.log(dim("  ─────────────────────────────────────────────────────"));
    console.log(`  ${bold("Configuration Summary:")}\n`);

    // AI
    if (config.vertexProject) {
      console.log(`  ${green("✓")} AI Provider:    Vertex AI (${config.vertexProject})`);
    } else if (config.geminiApiKey) {
      console.log(`  ${green("✓")} AI Provider:    Gemini API`);
    } else {
      console.log(`  ${yellow("○")} AI Provider:    Not configured`);
    }

    // Wallet
    console.log(`  ${green("✓")} Wallet:         ${config.wallet?.address.slice(0, 10)}...`);

    // Channels
    if (config.telegramToken) {
      console.log(`  ${green("✓")} Telegram:       Enabled`);
    } else {
      console.log(`  ${dim("○")} Telegram:       Not configured`);
    }

    if (config.discordToken) {
      console.log(`  ${green("✓")} Discord:        Enabled`);
    } else {
      console.log(`  ${dim("○")} Discord:        Not configured`);
    }

    // Payments
    if (config.cdpKeyId) {
      console.log(`  ${green("✓")} x402 Payments:  Enabled`);
    } else {
      console.log(`  ${dim("○")} x402 Payments:  Not configured`);
    }

    console.log(`  ${green("✓")} ERC-8004:       Enabled (Base Sepolia)`);

    console.log(dim("\n  ─────────────────────────────────────────────────────"));
    console.log(`\n  ${bold("Next Steps:")}\n`);
    console.log(`  ${sky("1.")} Fund your wallet with testnet ETH:`);
    console.log(`     ${dim("https://faucet.quicknode.com/base/sepolia")}\n`);
    console.log(`  ${sky("2.")} Start chatting:`);
    console.log(`     ${sky("wispy chat")}\n`);
    console.log(`  ${sky("3.")} Or start the full gateway:`);
    console.log(`     ${sky("wispy gateway")}\n`);

    if (config.telegramToken) {
      console.log(`  ${sky("4.")} Message your Telegram bot and send ${sky("/start")}\n`);
    }

    console.log(dim("  ─────────────────────────────────────────────────────"));
    console.log(`\n  ${bold("Commands:")}`);
    console.log(`  ${dim("wispy chat")}       Interactive terminal chat`);
    console.log(`  ${dim("wispy gateway")}    Start full server (Telegram, Discord, API)`);
    console.log(`  ${dim("wispy doctor")}     Check your configuration`);
    console.log(`  ${dim("wispy generate")}   Generate images with AI`);
    console.log(`  ${dim("wispy --help")}     See all commands\n`);

  } catch (err: any) {
    rl.close();
    if (err?.message === "Setup cancelled.") {
      console.log(dim("\n  Setup cancelled.\n"));
      process.exit(0);
    }
    throw err;
  }
}

// Run if called directly
if (process.argv[1]?.includes("automated-setup")) {
  const runtimeDir = process.env.WISPY_RUNTIME_DIR ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".wispy");
  const rootDir = process.cwd();

  runAutomatedSetup({ rootDir, runtimeDir }).catch(console.error);
}
