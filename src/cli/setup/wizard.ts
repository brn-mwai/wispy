/**
 * Interactive setup wizard — first-run onboarding experience.
 *
 * Steps:
 * 1. Welcome screen with ASCII art
 * 2. API key configuration
 * 3. Theme selection
 * 4. Agent selection
 * 5. Integration selection
 * 6. Summary
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import gradient from "gradient-string";
import { writeYAML } from "../../utils/file.js";

// ── Brand color ──────────────────────────────────────────
const sky = chalk.rgb(49, 204, 255);
const skyBold = chalk.rgb(49, 204, 255).bold;
const dim = chalk.dim;
const bold = chalk.bold;
const green = chalk.green;
const yellowBright = chalk.yellowBright;

// ── ASCII Art (gradient block letters) ───────────────────
const WISPY_ASCII_RAW = [
  "\u2588\u2588\u2557    \u2588\u2588\u2557 \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2557   \u2588\u2588\u2557",
  "\u2588\u2588\u2551    \u2588\u2588\u2551 \u2588\u2588\u2551 \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 \u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D",
  "\u2588\u2588\u2551 \u2588\u2557 \u2588\u2588\u2551 \u2588\u2588\u2551 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D  \u255A\u2588\u2588\u2588\u2588\u2554\u255D ",
  "\u2588\u2588\u2551\u2588\u2588\u2588\u2557\u2588\u2588\u2551 \u2588\u2588\u2551 \u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551 \u2588\u2588\u2554\u2550\u2550\u2550\u255D    \u255A\u2588\u2588\u2554\u255D  ",
  "\u255A\u2588\u2588\u2588\u2554\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2551 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551 \u2588\u2588\u2551         \u2588\u2588\u2551   ",
  " \u255A\u2550\u2550\u255D\u255A\u2550\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D         \u255A\u2550\u255D   ",
];
const wizardGradient = gradient(["#31CCFF", "#7B61FF", "#31CCFF"]);
const WISPY_ASCII = "\n" + WISPY_ASCII_RAW.map(line => `  ${wizardGradient(line)}`).join("\n") + "\n";

// ── Theme definitions ────────────────────────────────────
const THEMES = [
  { key: "dawn", label: `${chalk.yellow("◉")}  Dawn   — Warm sunrise tones` },
  { key: "day", label: `${chalk.rgb(49,204,255)("◉")}  Day    — Clean sky blue (default)` },
  { key: "dusk", label: `${chalk.magenta("◉")} Dusk   — Twilight purple` },
  { key: "night", label: `${chalk.blue("◉")} Night  — Deep dark mode` },
] as const;

const THEME_ICON: Record<string, string> = {
  dawn: chalk.yellow("◉"),
  day: chalk.rgb(49,204,255)("◉"),
  dusk: chalk.magenta("◉"),
  night: chalk.blue("◉"),
};

// ── Agent definitions ────────────────────────────────────
const AGENTS = [
  { id: "coder", label: "Coder      — Code generation, debugging, refactoring", defaultOn: true },
  { id: "researcher", label: "Researcher — Web search, analysis, summarization", defaultOn: true },
  { id: "writer", label: "Writer     — Content creation, copywriting, docs", defaultOn: false },
  { id: "devops", label: "DevOps     — CI/CD, deployment, infrastructure", defaultOn: false },
  { id: "designer", label: "Designer   — UI/UX design, accessibility", defaultOn: false },
  { id: "data", label: "Data       — SQL, data analysis, visualization", defaultOn: false },
  { id: "security", label: "Security   — Audit, vulnerability scanning", defaultOn: false },
  { id: "planner", label: "Planner    — Task breakdown, project planning", defaultOn: false },
];

// ── Integration definitions ──────────────────────────────
const INTEGRATIONS = [
  { id: "google-calendar", label: "Google Calendar" },
  { id: "gmail", label: "Gmail" },
  { id: "google-drive", label: "Google Drive" },
  { id: "discord", label: "Discord" },
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "slack", label: "Slack" },
  { id: "spotify", label: "Spotify" },
];

// ── Helpers ──────────────────────────────────────────────

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => resolve(answer));
    rl.once("close", () => reject(new Error("Setup cancelled.")));
  });
}

function parseNumberList(input: string, max: number): number[] {
  return input
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= max)
    .map((n) => n - 1);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Public API ───────────────────────────────────────────

/**
 * Check whether this is the first run (no config.yaml exists).
 */
export function isFirstRun(runtimeDir: string): boolean {
  const configPath = path.resolve(runtimeDir, "config.yaml");
  return !fs.existsSync(configPath);
}

/**
 * Run the interactive setup wizard.
 */
export async function runSetupWizard(opts: {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
}): Promise<void> {
  const { rootDir, runtimeDir } = opts;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Graceful Ctrl+C
  rl.on("SIGINT", () => {
    console.log(dim("\n\n  Setup cancelled.\n"));
    rl.close();
    process.exit(0);
  });

  try {
    // ── Step 1: Welcome ──────────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.rgb(49,204,255)("*")} Welcome to Wispy!\n`));
    console.log(dim("  Wispy is your autonomous AI agent powered by Google Gemini."));
    console.log(dim("  Let's get you set up in a few steps.\n"));
    await ask(rl, dim("  Press Enter to continue..."));

    // ── Step 2: API Key ──────────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.yellow("▸")} AI Configuration\n`));
    console.log(dim("  Choose how to connect to Google's AI:"));
    console.log("");
    console.log(`  ${sky("1)")} ${bold("Gemini API Key")} ${dim("(Free tier: 20 req/day)")}`);
    console.log(dim(`     Get one free: ${sky("https://aistudio.google.com/apikey")}`));
    console.log("");
    console.log(`  ${sky("2)")} ${bold("Vertex AI")} ${dim("(Higher quotas: 300+ req/min)")}`);
    console.log(dim(`     Requires Google Cloud project with billing enabled`));
    console.log(dim(`     Setup: ${sky("https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal")}`));
    console.log("");

    const existingKey = process.env.GEMINI_API_KEY;
    const existingVertexProject = process.env.GOOGLE_CLOUD_PROJECT;
    let apiKey = "";
    let useVertexAI = false;

    if (existingVertexProject) {
      console.log(green(`  ✓ Found Vertex AI project: ${existingVertexProject}`));
      console.log(dim("  Using Vertex AI for higher quotas.\n"));
      useVertexAI = true;
    } else if (existingKey) {
      const masked = existingKey.slice(0, 8) + "..." + existingKey.slice(-4);
      console.log(green(`  ✓ Found existing API key: ${masked}\n`));
      apiKey = existingKey;
    } else {
      const choice = await ask(rl, sky("  Select [1/2] (default: 1): "));

      if (choice.trim() === "2") {
        console.log("");
        console.log(dim("  To use Vertex AI, you need:"));
        console.log(dim("  1. A Google Cloud project with Vertex AI API enabled"));
        console.log(dim("  2. A service account key JSON file"));
        console.log(dim("  3. Set these environment variables in .env:"));
        console.log("");
        console.log(sky("     GOOGLE_CLOUD_PROJECT=your-project-id"));
        console.log(sky("     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json"));
        console.log("");
        console.log(dim("  Quick setup guide:"));
        console.log(dim(`  ${sky("https://cloud.google.com/vertex-ai/docs/authentication")}`));
        console.log("");
        const vertexProject = await ask(rl, sky("  Enter your project ID (or press Enter to skip): "));
        if (vertexProject.trim()) {
          useVertexAI = true;
          // Will save to .env later
        } else {
          console.log(dim("  Skipping Vertex AI. You can set it up later in .env\n"));
        }
      } else {
        console.log("");
        console.log(dim("  Get your free API key:"));
        console.log(`  ${sky("→ https://aistudio.google.com/apikey")}`);
        console.log("");
        apiKey = await ask(rl, sky("  Enter your Gemini API key: "));
        apiKey = apiKey.trim();

        if (apiKey && !apiKey.startsWith("AIza")) {
          console.log(yellowBright("\n  ⚠ Key doesn't start with 'AIza'. Double-check it's correct."));
          const proceed = await ask(rl, dim("  Continue anyway? [y/N]: "));
          if (!proceed.trim().toLowerCase().startsWith("y")) {
            apiKey = "";
            console.log(dim("  Skipped. Set GEMINI_API_KEY in .env later.\n"));
          }
        } else if (!apiKey) {
          console.log(dim("  Skipped. Set GEMINI_API_KEY in .env later.\n"));
        }
      }
    }

    // ── Step 2b: Telegram Bot Token (optional) ──────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.blue("▸")} Telegram Bot Setup\n`));
    console.log(dim("  Connect a Telegram bot to chat with Wispy from your phone!"));
    console.log(dim("  Create code, monitor projects, and control your agent remotely.\n"));
    console.log(dim("  How to create a Telegram bot:"));
    console.log(`  ${sky("1)")} Message ${bold("@BotFather")} on Telegram`);
    console.log(`  ${sky("2)")} Send ${sky("/newbot")} and follow the prompts`);
    console.log(`  ${sky("3)")} Copy the bot token (looks like: 123456:ABC-DEF1234...)`);
    console.log("");

    const existingTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
    let telegramToken = "";

    if (existingTelegramToken) {
      const masked = existingTelegramToken.slice(0, 10) + "...";
      console.log(green(`  ✓ Found existing token: ${masked}\n`));
      telegramToken = existingTelegramToken;
    } else {
      telegramToken = await ask(rl, sky("  Enter Telegram bot token (or press Enter to skip): "));
      telegramToken = telegramToken.trim();

      if (!telegramToken) {
        console.log(dim("  Skipped. You can add TELEGRAM_BOT_TOKEN to .env later.\n"));
      }
    }

    // ── Step 2c: Autonomous Mode ──────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.yellow("▸")} Autonomous Mode\n`));
    console.log(dim("  Wispy can run in two modes:\n"));
    console.log(`  ${sky("1)")} ${bold("Standard Mode")} ${dim("(Safe)")}`);
    console.log(dim("     Requires approval for file writes, code execution, etc."));
    console.log(dim("     Best for: Production, shared environments, safety-first\n"));
    console.log(`  ${sky("2)")} ${bold("Autonomous Mode")} ${dim("(Recommended for Development)")}`);
    console.log(dim("     Auto-approves file operations, bash, browser automation"));
    console.log(dim("     Best for: Local development, coding assistance, hackathons"));
    console.log(dim("     ⚡ Like OpenClaw - create code and projects via Telegram\n"));

    const modeChoice = await ask(rl, sky("  Select [1/2] (default: 2 for Autonomous): "));
    const autonomousMode = modeChoice.trim() !== "1";

    // ── Step 3: Theme ────────────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.magenta("▸")} Choose your theme\n`));

    for (let i = 0; i < THEMES.length; i++) {
      const num = sky(`${i + 1})`);
      console.log(`  ${num} ${THEMES[i].label}`);
    }

    const themeInput = await ask(rl, sky("\n  Select [1-4] (default: 2): "));
    const themeIdx = parseInt(themeInput.trim(), 10);
    const selectedTheme =
      themeIdx >= 1 && themeIdx <= 4
        ? THEMES[themeIdx - 1].key
        : "day";

    // ── Step 4: Agents ───────────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.cyan("▸")} Select your agents\n`));
    console.log(dim("  Choose which AI agents you want active:\n"));

    for (let i = 0; i < AGENTS.length; i++) {
      const mark = AGENTS[i].defaultOn ? green("[x]") : dim("[ ]");
      const num = sky(`${i + 1})`);
      console.log(`  ${mark} ${num} ${AGENTS[i].label}`);
    }

    const agentInput = await ask(rl, sky("\n  Enter numbers separated by commas (default: 1,2): "));
    let selectedAgents: string[];

    if (!agentInput.trim()) {
      selectedAgents = AGENTS.filter((a) => a.defaultOn).map((a) => a.id);
    } else {
      const indices = parseNumberList(agentInput, AGENTS.length);
      selectedAgents = indices.length > 0
        ? indices.map((i) => AGENTS[i].id)
        : AGENTS.filter((a) => a.defaultOn).map((a) => a.id);
    }

    // ── Step 5: Integrations ─────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.blue("▸")} Connect integrations (optional)\n`));
    console.log(dim("  You can enable these later with 'wispy integrations enable <id>'\n"));

    // Display in two columns
    const half = Math.ceil(INTEGRATIONS.length / 2);
    for (let i = 0; i < half; i++) {
      const left = `${dim("[ ]")} ${sky(`${i + 1})`)} ${INTEGRATIONS[i].label}`;
      const rightIdx = i + half;
      const right =
        rightIdx < INTEGRATIONS.length
          ? `${dim("[ ]")} ${sky(`${rightIdx + 1})`)} ${INTEGRATIONS[rightIdx].label}`
          : "";
      console.log(`  ${left.padEnd(38)}${right}`);
    }

    const intInput = await ask(rl, sky("\n  Enter numbers to enable (or press Enter to skip): "));
    let selectedIntegrations: string[];

    if (!intInput.trim()) {
      selectedIntegrations = [];
    } else {
      const indices = parseNumberList(intInput, INTEGRATIONS.length);
      selectedIntegrations = indices.map((i) => INTEGRATIONS[i].id);
    }

    // ── Step 6: MCP Servers ─────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.green("▸")} MCP Servers (Model Context Protocol)\n`));
    console.log(dim("  MCP servers extend Wispy's capabilities with external tools."));
    console.log(dim("  These let Wispy interact with your file system, web, and more.\n"));

    const MCP_SERVERS = [
      {
        id: "filesystem",
        label: "File System — Read/write files anywhere (Recommended)",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-filesystem", "--allow-write", "/"],
        default: true,
      },
      {
        id: "fetch",
        label: "Web Fetch   — Make HTTP requests with headers & auth",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-fetch"],
        default: true,
      },
      {
        id: "memory",
        label: "Memory      — Persistent key-value storage",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-memory"],
        default: false,
      },
      {
        id: "brave",
        label: "Brave Search— Web search via Brave API",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-brave-search"],
        default: false,
        envRequired: "BRAVE_API_KEY",
      },
      {
        id: "github",
        label: "GitHub      — Access repos, issues, PRs",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        default: false,
        envRequired: "GITHUB_TOKEN",
      },
      {
        id: "postgres",
        label: "PostgreSQL  — Query databases directly",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        default: false,
        envRequired: "DATABASE_URL",
      },
    ];

    for (let i = 0; i < MCP_SERVERS.length; i++) {
      const mark = MCP_SERVERS[i].default ? green("[x]") : dim("[ ]");
      const num = sky(`${i + 1})`);
      const envNote = MCP_SERVERS[i].envRequired ? dim(` (needs ${MCP_SERVERS[i].envRequired})`) : "";
      console.log(`  ${mark} ${num} ${MCP_SERVERS[i].label}${envNote}`);
    }

    console.log("");
    console.log(dim("  MCP servers run alongside the gateway and provide additional tools."));
    console.log(dim(`  Learn more: ${sky("https://modelcontextprotocol.io")}\n`));

    const mcpInput = await ask(rl, sky("  Enter numbers to enable (default: 1,2): "));
    let selectedMCPs: typeof MCP_SERVERS;

    if (!mcpInput.trim()) {
      selectedMCPs = MCP_SERVERS.filter((m) => m.default);
    } else {
      const indices = parseNumberList(mcpInput, MCP_SERVERS.length);
      selectedMCPs = indices.length > 0
        ? indices.map((i) => MCP_SERVERS[i])
        : MCP_SERVERS.filter((m) => m.default);
    }

    // ── Step 7: Voice/TTS Setup (Edge TTS) ─────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.hex('#FF6B6B')("▸")} Voice Setup (Natural TTS)\n`));
    console.log(dim("  Enable natural text-to-speech for voice messages in Telegram."));
    console.log(dim("  Using Microsoft Edge TTS - free, fast, and sounds very natural.\n"));
    console.log(`  ${chalk.hex('#FF6B6B')("Features:")}`);
    console.log(`  ${sky("•")} Multiple natural voices (male/female, various accents)`);
    console.log(`  ${sky("•")} Fast generation (2-3 seconds)`);
    console.log(`  ${sky("•")} No API key required`);
    console.log(`  ${sky("•")} Works on any system (no GPU needed)`);
    console.log("");

    // Check if Edge TTS is installed
    let voiceInstalled = false;
    try {
      const { execSync } = await import("child_process");
      execSync("python -m edge_tts --version", { stdio: "pipe", timeout: 5000 });
      voiceInstalled = true;
    } catch {
      voiceInstalled = false;
    }

    if (voiceInstalled) {
      console.log(green("  ✓ Edge TTS is already installed!\n"));
    } else {
      console.log(yellowBright("  ⚠ Edge TTS not installed"));
      console.log(dim("  Required for natural voice messages in Telegram.\n"));

      const installChoice = await ask(rl, sky("  Install Edge TTS now? [Y/n]: "));

      if (!installChoice.trim() || installChoice.trim().toLowerCase().startsWith("y")) {
        console.log("");
        console.log(dim("  Installing Edge TTS..."));

        try {
          const { execSync } = await import("child_process");
          execSync("pip install edge-tts", {
            stdio: "inherit",
            timeout: 120000,
          });
          voiceInstalled = true;
          console.log("");
          console.log(green("  ✓ Edge TTS installed successfully!"));
        } catch (installErr: any) {
          console.log("");
          console.log(yellowBright("  ⚠ Installation failed. You can install manually later:"));
          console.log(sky("     pip install edge-tts"));
        }
      } else {
        console.log(dim("\n  Skipped. Install later with: pip install edge-tts\n"));
      }
    }

    // Keep variable name for backward compatibility
    const chatterboxInstalled = voiceInstalled;

    // Qwen3-TTS via HuggingFace Spaces (cloud-based, no local GPU needed)
    let qwen3Installed = false;
    try {
      const { execSync } = await import("child_process");
      execSync('python -c "from gradio_client import Client"', { stdio: "pipe", timeout: 10000 });
      qwen3Installed = true;
    } catch {
      qwen3Installed = false;
    }

    console.log("");
    console.log(chalk.hex('#FF6B6B')("  Optional: Qwen3-TTS (Premium Voice)"));
    console.log(dim("  Best quality TTS via HuggingFace Spaces (cloud-based)."));
    console.log(dim("  No local GPU needed - runs on HuggingFace servers!\n"));
    console.log(`  ${sky("•")} 10 languages: English, Chinese, Japanese, Korean, etc.`);
    console.log(`  ${sky("•")} 9 voices: Serena, Ryan, Vivian, Dylan, Aiden, etc.`);
    console.log(`  ${sky("•")} Emotion & style control via natural language`);
    console.log(`  ${sky("•")} Free to use (HuggingFace Spaces)`);
    console.log("");

    if (qwen3Installed) {
      console.log(green("  ✓ Qwen3-TTS client is ready!\n"));
    } else {
      console.log(yellowBright("  ⚠ gradio_client not installed"));
      console.log(dim("  Required for Qwen3-TTS cloud API.\n"));

      const installChoice = await ask(rl, sky("  Install gradio_client now? [Y/n]: "));

      if (!installChoice.trim() || installChoice.trim().toLowerCase().startsWith("y")) {
        console.log("");
        console.log(dim("  Installing gradio_client..."));

        try {
          const { execSync } = await import("child_process");
          execSync("pip install gradio_client -q", {
            stdio: "inherit",
            timeout: 120000,
          });
          qwen3Installed = true;
          console.log("");
          console.log(green("  ✓ Qwen3-TTS client installed successfully!"));
        } catch (installErr: any) {
          console.log("");
          console.log(yellowBright("  ⚠ Installation failed. You can install manually later:"));
          console.log(sky("     pip install gradio_client"));
        }
      } else {
        console.log(dim("\n  Skipped. Edge TTS will be used (still sounds great!).\n"));
      }
    }

    await ask(rl, dim("\n  Press Enter to continue..."));

    rl.close();

    // ── Save config ──────────────────────────────────────

    // Ensure runtime directory exists
    fs.mkdirSync(runtimeDir, { recursive: true });

    const config = {
      agent: { name: "wispy", id: "main" },
      gemini: {
        models: {
          pro: "gemini-2.5-flash",
          flash: "gemini-2.5-flash",
          image: "gemini-2.0-flash",
          embedding: "text-embedding-004",
        },
      },
      channels: {
        web: { enabled: true, port: 4000 },
        rest: { enabled: true, port: 4001 },
        telegram: { enabled: !!telegramToken, token: telegramToken || undefined },
        whatsapp: { enabled: false },
      },
      browser: { enabled: true },
      wallet: { enabled: false, chain: "base-sepolia" },
      memory: { embeddingDimensions: 768, heartbeatIntervalMinutes: 30, hybridSearch: true },
      security: { requireApprovalForExternal: !autonomousMode, allowedGroups: [] as string[], autonomousMode },
      thinking: { defaultLevel: "medium", costAware: true },
      theme: selectedTheme,
      agents: selectedAgents,
      integrations: selectedIntegrations,
    };

    const configPath = path.resolve(runtimeDir, "config.yaml");
    writeYAML(configPath, config);

    // ── Save MCP server configuration ───────────────────
    const mcpDir = path.resolve(runtimeDir, "mcp");
    fs.mkdirSync(mcpDir, { recursive: true });

    const mcpConfig = {
      servers: selectedMCPs.map((m) => ({
        id: m.id,
        command: m.command,
        args: m.args,
        enabled: true,
        env: {},
      })),
    };

    const mcpConfigPath = path.resolve(mcpDir, "servers.json");
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

    // Save credentials to .env
    const envPath = path.resolve(rootDir, ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

    // Add API key if new
    if (apiKey && !existingKey) {
      if (!envContent.includes("GEMINI_API_KEY=")) {
        envContent += `\nGEMINI_API_KEY=${apiKey}`;
      }
    }

    // Add Telegram token if new
    if (telegramToken && !existingTelegramToken) {
      if (!envContent.includes("TELEGRAM_BOT_TOKEN=")) {
        envContent += `\nTELEGRAM_BOT_TOKEN=${telegramToken}`;
      }
    }

    // Write .env if we have content
    if (envContent.trim()) {
      fs.writeFileSync(envPath, envContent.trim() + "\n");
    }

    // ── Step 7: Summary ──────────────────────────────────
    console.clear();
    console.log(WISPY_ASCII);
    console.log(skyBold(`  ${chalk.green("✓")} Setup complete!\n`));

    const themeDisplay = `${capitalize(selectedTheme)} ${THEME_ICON[selectedTheme] || ""}`;
    const agentsDisplay = selectedAgents.map(capitalize).join(", ");
    const intDisplay =
      selectedIntegrations.length > 0
        ? selectedIntegrations.map((id) => {
            const found = INTEGRATIONS.find((i) => i.id === id);
            return found ? found.label : id;
          }).join(", ")
        : "None (enable later with /integrations)";
    const mcpDisplay =
      selectedMCPs.length > 0
        ? selectedMCPs.map((m) => capitalize(m.id)).join(", ")
        : "None";

    const aiDisplay = useVertexAI ? "Vertex AI (high quota)" : apiKey ? "Gemini API" : "Not configured";
    const telegramDisplay = telegramToken ? green("Enabled") : dim("Not configured");
    const modeDisplay = autonomousMode
      ? chalk.yellow("⚡ Autonomous") + dim(" (auto-approve file/code ops)")
      : green("🛡️ Standard") + dim(" (requires approval)");
    const voiceDisplay = qwen3Installed
      ? green("✓ Qwen3-TTS") + dim(" (premium, multilingual)")
      : (chatterboxInstalled
          ? green("✓ Edge TTS") + dim(" (natural voice)")
          : dim("Not installed"));

    console.log(`  ${dim("AI Provider:")}  ${aiDisplay}`);
    console.log(`  ${dim("Mode:")}         ${modeDisplay}`);
    console.log(`  ${dim("Theme:")}        ${themeDisplay}`);
    console.log(`  ${dim("Agents:")}       ${agentsDisplay}`);
    console.log(`  ${dim("Telegram:")}     ${telegramDisplay}`);
    console.log(`  ${dim("Voice:")}        ${voiceDisplay}`);
    console.log(`  ${dim("MCP Servers:")}  ${mcpDisplay}`);
    console.log(`  ${dim("Integrations:")} ${intDisplay}`);
    console.log("");

    if (!apiKey && !useVertexAI) {
      console.log(yellowBright("  ⚠ No AI credentials configured!"));
      console.log(dim("  Add to .env: GEMINI_API_KEY=your-key-here"));
      console.log("");
    }

    console.log(`  Run ${sky("'wispy gateway'")} to start the server!`);
    console.log(`  Or  ${sky("'wispy chat'")} for interactive CLI mode.`);
    console.log("");
    console.log(dim("  Helpful links:"));
    console.log(dim(`  • Get API Key: ${sky("https://aistudio.google.com/apikey")}`));
    console.log(dim(`  • Vertex AI:   ${sky("https://cloud.google.com/vertex-ai")}`));
    console.log(dim(`  • Telegram:    ${sky("https://t.me/BotFather")}`));
    console.log(dim(`  • Qwen3-TTS:   ${sky("https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")}`));
    console.log("");
  } catch (err: any) {
    rl.close();
    if (err?.message === "Setup cancelled.") {
      console.log(dim("\n  Setup cancelled.\n"));
      process.exit(0);
    }
    throw err;
  }
}
