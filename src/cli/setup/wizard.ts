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
import { writeYAML } from "../../utils/file.js";

// ── Brand color ──────────────────────────────────────────
const sky = chalk.rgb(49, 204, 255);
const skyBold = chalk.rgb(49, 204, 255).bold;
const dim = chalk.dim;
const bold = chalk.bold;
const green = chalk.green;
const yellowBright = chalk.yellowBright;

// ── ASCII Art ────────────────────────────────────────────
const WISPY_ASCII = `
  ${sky("██╗    ██╗ ██╗ ███████╗ ██████╗  ██╗   ██╗")}
  ${sky("██║    ██║ ██║ ██╔════╝ ██╔══██╗ ╚██╗ ██╔╝")}
  ${sky("██║ █╗ ██║ ██║ ███████╗ ██████╔╝  ╚████╔╝ ")}
  ${sky("██║███╗██║ ██║ ╚════██║ ██╔═══╝    ╚██╔╝  ")}
  ${sky("╚███╔███╔╝ ██║ ███████║ ██║         ██║   ")}
  ${sky(" ╚══╝╚══╝  ╚═╝ ╚══════╝ ╚═╝         ╚═╝   ")}
`;

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
    console.log(skyBold(`  ${chalk.yellow("▸")} Gemini API Key\n`));
    console.log(dim("  You need a Google Gemini API key to use Wispy."));
    console.log(dim(`  Get one free at: ${sky("https://aistudio.google.com/apikey")}\n`));

    const existingKey = process.env.GEMINI_API_KEY;
    let apiKey = "";

    if (existingKey) {
      const masked = existingKey.slice(0, 8) + "..." + existingKey.slice(-4);
      console.log(green(`  ✓ Found existing key: ${masked}\n`));
      apiKey = existingKey;
    } else {
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
        telegram: { enabled: false },
        whatsapp: { enabled: false },
      },
      memory: { embeddingDimensions: 768, heartbeatIntervalMinutes: 30 },
      security: { requireApprovalForExternal: true, allowedGroups: [] as string[] },
      theme: selectedTheme,
      agents: selectedAgents,
      integrations: selectedIntegrations,
    };

    const configPath = path.resolve(runtimeDir, "config.yaml");
    writeYAML(configPath, config);

    // Save API key to .env
    if (apiKey && !existingKey) {
      const envPath = path.resolve(rootDir, ".env");
      const envLine = `GEMINI_API_KEY=${apiKey}\n`;

      if (fs.existsSync(envPath)) {
        const existing = fs.readFileSync(envPath, "utf-8");
        if (!existing.includes("GEMINI_API_KEY=")) {
          fs.appendFileSync(envPath, `\n${envLine}`);
        }
      } else {
        fs.writeFileSync(envPath, envLine);
      }
    }

    // ── Step 6: Summary ──────────────────────────────────
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

    console.log(`  ${dim("Theme:")}        ${themeDisplay}`);
    console.log(`  ${dim("Agents:")}       ${agentsDisplay}`);
    console.log(`  ${dim("Integrations:")} ${intDisplay}`);
    console.log("");
    console.log(`  Run ${sky("'wispy chat'")} to start chatting!`);
    console.log(`  Type ${sky("/help")} for all commands.`);
    console.log(`  ${sky("?")} for shortcuts\n`);
  } catch (err: any) {
    rl.close();
    if (err?.message === "Setup cancelled.") {
      console.log(dim("\n  Setup cancelled.\n"));
      process.exit(0);
    }
    throw err;
  }
}
