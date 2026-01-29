/**
 * Interactive skill creation wizard.
 *
 * Walks the user through creating a new SKILL.md file
 * with model, integrations, capabilities, and instructions.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

// ── Brand color ──────────────────────────────────────────
const sky = chalk.rgb(49, 204, 255);
const skyBold = chalk.rgb(49, 204, 255).bold;
const dim = chalk.dim;
const bold = chalk.bold;
const green = chalk.green;

// ── Data ─────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { key: "pro", label: "Gemini 2.5 Pro    -- Best for reasoning/analysis" },
  { key: "flash", label: "Gemini 2.5 Flash  -- Fast, good for quick tasks" },
  { key: "both", label: "Both              -- Pro for main task, Flash for subtasks" },
] as const;

const INTEGRATION_OPTIONS = [
  "YouTube",
  "Obsidian",
  "Google Calendar",
  "Gmail",
  "Google Drive",
  "GitHub",
  "Notion",
  "Slack",
  "Discord",
  "Spotify",
  "Telegram",
  "WhatsApp",
];

const CAPABILITY_OPTIONS = [
  { key: "web-search", label: "Web search" },
  { key: "file-io", label: "File read/write" },
  { key: "code-exec", label: "Code execution" },
  { key: "image-gen", label: "Image generation" },
  { key: "memory", label: "Memory (remember across sessions)" },
  { key: "cron", label: "Scheduled execution (cron)" },
];

// ── Helpers ──────────────────────────────────────────────

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => resolve(answer));
    rl.once("close", () => reject(new Error("Wizard cancelled.")));
  });
}

function parseNumberList(input: string, max: number): number[] {
  return input
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= max)
    .map((n) => n - 1);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Public API ───────────────────────────────────────────

export async function runSkillWizard(soulDir: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    console.log(dim("\n\n  Wizard cancelled.\n"));
    rl.close();
    process.exit(0);
  });

  try {
    // ── Step 1: Description ──────────────────────────────
    console.log("");
    console.log(skyBold("  Skill Creation Wizard\n"));
    console.log(dim("  Create a new skill for Wispy in a few steps.\n"));

    const description = await ask(
      rl,
      sky("  Describe what you want Wispy to be able to do:\n  ") + sky("> "),
    );

    if (!description.trim()) {
      console.log(dim("\n  No description provided. Aborting.\n"));
      rl.close();
      return;
    }

    // ── Step 2: Name ─────────────────────────────────────
    console.log("");
    const rawName = await ask(rl, sky("  Give this skill a short name: "));
    const slug = slugify(rawName.trim() || "custom-skill");
    const displayName = titleCase(slug);

    // ── Step 3: Model ────────────────────────────────────
    console.log("");
    console.log(skyBold("  Which Gemini model should it use?\n"));

    for (let i = 0; i < MODEL_OPTIONS.length; i++) {
      console.log(`  ${sky(`${i + 1})`)} ${MODEL_OPTIONS[i].label}`);
    }

    const modelInput = await ask(rl, sky("\n  Select [1-3] (default: 1): "));
    const modelIdx = parseInt(modelInput.trim(), 10);
    const selectedModel =
      modelIdx >= 1 && modelIdx <= 3
        ? MODEL_OPTIONS[modelIdx - 1]
        : MODEL_OPTIONS[0];

    // ── Step 4: Integrations ─────────────────────────────
    console.log("");
    console.log(skyBold("  What integrations does it need?\n"));

    for (let i = 0; i < INTEGRATION_OPTIONS.length; i++) {
      console.log(`  ${sky(`${i + 1})`)} ${INTEGRATION_OPTIONS[i]}`);
    }

    const intInput = await ask(
      rl,
      sky("\n  Enter numbers separated by commas (or press Enter to skip): "),
    );
    const selectedIntegrations =
      intInput.trim()
        ? parseNumberList(intInput, INTEGRATION_OPTIONS.length).map(
            (i) => INTEGRATION_OPTIONS[i],
          )
        : [];

    // ── Step 5: Capabilities ─────────────────────────────
    console.log("");
    console.log(skyBold("  Does it need any of these capabilities?\n"));

    for (let i = 0; i < CAPABILITY_OPTIONS.length; i++) {
      console.log(`  ${sky(`${i + 1})`)} ${CAPABILITY_OPTIONS[i].label}`);
    }

    const capInput = await ask(
      rl,
      sky("\n  Enter numbers separated by commas (or press Enter to skip): "),
    );
    const selectedCapabilities =
      capInput.trim()
        ? parseNumberList(capInput, CAPABILITY_OPTIONS.length).map(
            (i) => CAPABILITY_OPTIONS[i].label,
          )
        : [];

    // ── Step 6: Instructions ─────────────────────────────
    console.log("");
    const instructions = await ask(
      rl,
      sky("  Add any special instructions (or press Enter to skip):\n  ") +
        sky("> "),
    );

    rl.close();

    // ── Generate SKILL.md ────────────────────────────────
    const modelText =
      selectedModel.key === "both"
        ? "Gemini 2.5 Pro for main task, Gemini 2.5 Flash for subtasks"
        : selectedModel.key === "pro"
          ? "Gemini 2.5 Pro"
          : "Gemini 2.5 Flash";

    const lines: string[] = [];
    lines.push(`# ${displayName}`);
    lines.push("");
    lines.push(description.trim());
    lines.push("");
    lines.push("## Model");
    lines.push("");
    lines.push(modelText);
    lines.push("");

    if (selectedIntegrations.length > 0) {
      lines.push("## Integrations");
      lines.push("");
      for (const int of selectedIntegrations) {
        lines.push(`- ${int}`);
      }
      lines.push("");
    }

    if (selectedCapabilities.length > 0) {
      lines.push("## Capabilities");
      lines.push("");
      for (const cap of selectedCapabilities) {
        lines.push(`- ${cap}`);
      }
      lines.push("");
    }

    if (instructions.trim()) {
      lines.push("## Instructions");
      lines.push("");
      lines.push(instructions.trim());
      lines.push("");
    }

    lines.push("## Trigger");
    lines.push("");
    lines.push(`Activate when the user asks to ${description.trim().toLowerCase().replace(/\.$/, "")}.`);
    lines.push("");

    const skillDir = path.resolve(soulDir, "skills", slug);
    fs.mkdirSync(skillDir, { recursive: true });

    const skillPath = path.resolve(skillDir, "SKILL.md");
    fs.writeFileSync(skillPath, lines.join("\n"), "utf-8");

    // ── Done ─────────────────────────────────────────────
    console.log("");
    console.log(
      `  ${green("✓")} Skill created: ${sky(`wispy/skills/${slug}/SKILL.md`)}`,
    );
    console.log(`  Run ${sky("'/skills'")} to see all skills`);
    console.log("");
  } catch (err: any) {
    rl.close();
    if (err?.message === "Wizard cancelled.") {
      console.log(dim("\n  Wizard cancelled.\n"));
      return;
    }
    throw err;
  }
}
