import chalk from "chalk";
import gradient from "gradient-string";
import boxen from "boxen";
import stripAnsi from "strip-ansi";
import { getTheme } from "./theme.js";

export const WISPY_VERSION = "1.4.0-x402";

// ── Ghost ASCII art (3 responsive sizes) ─────────────────

const LARGE_GHOST = [
  "    \u2584\u2588\u2588\u2588\u2588\u2584    ",
  "  \u2584\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2584  ",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "  \u2580\u2588\u2588\u2580\u2588\u2588\u2580\u2588\u2588\u2580  ",
];

const MEDIUM_GHOST = [
  "  \u2584\u2588\u2588\u2588\u2588\u2584  ",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588 \u2588\u2588 \u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  " \u2580\u2588\u2588\u2580\u2580\u2588\u2588\u2580 ",
];

// ── Helpers ──────────────────────────────────────────────

function mergeColumns(left: string[], right: string[], gap = 4): string[] {
  const leftWidth = Math.max(...left.map((l) => stripAnsi(l).length));
  const maxLen = Math.max(left.length, right.length);
  const result: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const l = left[i] || "";
    const r = right[i] || "";
    const visLen = stripAnsi(l).length;
    const pad = " ".repeat(leftWidth - visLen + gap);
    result.push(l + pad + r);
  }
  return result;
}

function truncateCwd(cwd: string, max: number): string {
  return cwd.length > max ? "..." + cwd.slice(-max) : cwd;
}

function formatProvider(
  displayModel: string,
  vertexai: boolean,
  project?: string,
  location?: string,
): string {
  if (vertexai) {
    return (
      chalk.green("Vertex AI") +
      chalk.dim(` (${project || "default"}${location ? ", " + location : ""})`)
    );
  }
  return chalk.dim(displayModel);
}

function formatModelName(model: string): string {
  return model
    .replace("gemini-", "Gemini ")
    .replace("gemma-", "Gemma ")
    .replace("-preview-05-06", "")
    .replace("-preview-05-20", "")
    .replace("-pro", " Pro")
    .replace("-flash", " Flash")
    .replace("-it", "");
}

// ── Banner Options ───────────────────────────────────────

export interface BannerOptions {
  modelName?: string;
  vertexai?: boolean;
  project?: string;
  location?: string;
}

// ── Large Banner (>= 100 cols) ───────────────────────────
// Gradient ghost side-by-side with info panel

function renderLargeBanner(
  version: string,
  time: string,
  provider: string,
  cwd: string,
): void {
  const theme = getTheme();
  const g = gradient(theme.gradient);

  const ghostLines = g.multiline(LARGE_GHOST.join("\n")).split("\n");

  const info = [
    `${theme.brandBold("Wispy")} ${chalk.dim(version)} ${chalk.dim("\u00b7")} ${chalk.dim(time)}`,
    provider,
    chalk.dim(cwd),
    "",
    `${theme.tipIcon} ${chalk.dim('Type naturally: "build me a REST API"')}`,
    `${theme.tipIcon} ${chalk.dim("/marathon <goal> for autonomous execution")}`,
    `${theme.tipIcon} ${chalk.dim("/help for commands, /quick for shortcuts")}`,
  ];

  const merged = mergeColumns(ghostLines, info);

  console.log();
  for (const line of merged) {
    console.log(`  ${line}`);
  }
  console.log();
}

// ── Medium Banner (60-99 cols) ───────────────────────────
// Gradient ghost above a boxen info box

function renderMediumBanner(
  version: string,
  time: string,
  provider: string,
  cwd: string,
): void {
  const theme = getTheme();
  const g = gradient(theme.gradient);

  const ghostStr = g.multiline(MEDIUM_GHOST.join("\n"));
  console.log();
  for (const line of ghostStr.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log();

  const cols = process.stdout.columns || 80;
  const boxWidth = Math.min(cols - 4, 72);

  const content = [
    `${theme.brandBold("Wispy")} ${chalk.dim(version)} ${chalk.dim("\u00b7")} ${chalk.dim(time)}`,
    `${provider}  ${chalk.dim("\u00b7")}  ${chalk.dim(cwd)}`,
    "",
    `${theme.tipIcon} ${chalk.dim("/help for commands")}  ${theme.tipIcon} ${chalk.dim("/marathon for autonomous tasks")}`,
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      borderColor: theme.boxBorder,
      borderStyle: "round",
      dimBorder: true,
      width: boxWidth,
    }),
  );
  console.log();
}

// ── Small Banner (< 60 cols) ─────────────────────────────
// Compact text-only

function renderSmallBanner(version: string, provider: string): void {
  const theme = getTheme();
  console.log();
  console.log(`  ${theme.brandBold("\u2601 Wispy")} ${chalk.dim(version)}`);
  console.log(`  ${provider}`);
  console.log();
}

// ── Public API ───────────────────────────────────────────

export function showBanner(modelNameOrOptions?: string | BannerOptions): void {
  const cols = process.stdout.columns || 80;

  let modelName: string | undefined;
  let vertexai = false;
  let project: string | undefined;
  let location: string | undefined;

  if (typeof modelNameOrOptions === "string") {
    modelName = modelNameOrOptions;
  } else if (modelNameOrOptions) {
    modelName = modelNameOrOptions.modelName;
    vertexai = modelNameOrOptions.vertexai || false;
    project = modelNameOrOptions.project;
    location = modelNameOrOptions.location;
  }

  const displayModel = formatModelName(modelName || "Gemini");
  const version = `v${WISPY_VERSION}`;
  const timeStr = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const shortCwd = truncateCwd(process.cwd(), 45);
  const provider = formatProvider(displayModel, vertexai, project, location);

  if (cols >= 100) {
    renderLargeBanner(version, timeStr, provider, shortCwd);
  } else if (cols >= 60) {
    renderMediumBanner(version, timeStr, provider, shortCwd);
  } else {
    renderSmallBanner(version, provider);
  }
}

export function showOnboardBanner(): void {
  const cols = process.stdout.columns || 80;
  const theme = getTheme();
  const g = gradient(theme.gradient);

  if (cols >= 80) {
    const ghostStr = g.multiline(LARGE_GHOST.join("\n"));
    console.log();
    for (const line of ghostStr.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log();
    console.log(`  ${theme.brandBold("Welcome to Wispy")}`);
    console.log(
      `  ${chalk.dim("Your autonomous AI agent \u00b7 Powered by Gemini")}`,
    );
    console.log();
  } else {
    console.log();
    console.log(`  ${theme.brandBold("\u2601 Welcome to Wispy")}`);
    console.log(`  ${chalk.dim("Powered by Gemini")}`);
    console.log();
  }
}

export function getScaledLogo(): string[] {
  const cols = process.stdout.columns || 80;
  const theme = getTheme();
  const g = gradient(theme.gradient);
  const raw = cols >= 80 ? LARGE_GHOST : cols >= 60 ? MEDIUM_GHOST : [];
  if (raw.length === 0) return [];
  return g.multiline(raw.join("\n")).split("\n");
}
