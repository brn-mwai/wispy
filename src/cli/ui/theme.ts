import chalk, { type ChalkInstance } from "chalk";

// ── Sky Blue Brand Color ──────────────────────────────────────────
const SKY = [49, 204, 255] as const;

export interface Theme {
  name: string;
  primary: ChalkInstance;
  accent: ChalkInstance;
  dim: ChalkInstance;
  bold: ChalkInstance;
  err: ChalkInstance;
  warn: ChalkInstance;
  ok: ChalkInstance;
  info: ChalkInstance;
  prompt: string;
  cloud: string;
  // Role colors
  user: ChalkInstance;
  agent: ChalkInstance;
  system: ChalkInstance;
  // Code
  code: ChalkInstance;
  // Tool
  tool: ChalkInstance;
  toolOk: string;
  toolFail: string;
  toolPending: string;
  // Brand (alias for primary)
  brand: ChalkInstance;
  brandBold: ChalkInstance;
  // Thinking
  thinking: ChalkInstance;
  // Spinner frames
  spinnerFrames: string[];
  thinkingFrames: string[];
  // TUI chrome
  statusBarBg: ChalkInstance;
  statusBarFg: ChalkInstance;
  inputBorder: ChalkInstance;
  panelBorder: ChalkInstance;
  panelTitle: ChalkInstance;
  highlight: ChalkInstance;
  // Gradient color stops (hex strings for gradient-string)
  gradient: string[];
  gradientAccent: string[];
  tipIcon: string;
  boxBorder: string;
  // Hex colors for Ink components (Ink uses hex strings, not chalk)
  primaryHex: string;
  accentHex: string;
  dimHex: string;
  // Thinking level colors (hex for Ink)
  thinkingLevelHex: Record<string, string>;
  // Phase colors for marathon/background tasks
  phaseHex: Record<string, string>;
}

const skyBlue = chalk.rgb(...SKY);
const skyBlueBold = chalk.rgb(...SKY).bold;

// Shared across all themes
const shared = {
  primary: skyBlue,
  dim: chalk.dim,
  bold: chalk.bold,
  err: chalk.red,
  warn: chalk.yellow,
  ok: chalk.green,
  info: chalk.cyan,
  system: chalk.gray,
  code: chalk.bgGray.white,
  toolOk: chalk.green("\u2714"),
  toolFail: chalk.red("\u2718"),
  toolPending: chalk.yellow("\u25CB"),
  brand: skyBlue,
  brandBold: skyBlueBold,
  panelBorder: skyBlue,
  panelTitle: skyBlueBold,
};

// ── Theme Definitions ─────────────────────────────────────────────

const dawn: Theme = {
  ...shared,
  name: "Dawn",
  accent: chalk.rgb(255, 127, 80),        // coral
  user: chalk.rgb(255, 183, 77).bold,      // gold
  agent: skyBlueBold,
  tool: chalk.rgb(255, 167, 38),           // orange
  thinking: chalk.rgb(255, 127, 80),
  prompt: chalk.rgb(255, 127, 80).bold("\u276F "),
  cloud: chalk.rgb(255, 127, 80)("●") + " ",
  spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  thinkingFrames: ["\u2591\u2591\u2591", "\u2592\u2591\u2591", "\u2593\u2592\u2591", "\u2588\u2593\u2592", "\u2593\u2588\u2593", "\u2592\u2593\u2588", "\u2591\u2592\u2593", "\u2591\u2591\u2592"],
  statusBarBg: chalk.bgRgb(40, 30, 35),
  statusBarFg: chalk.rgb(200, 180, 170),
  inputBorder: chalk.rgb(255, 127, 80).dim,
  highlight: chalk.bgRgb(60, 40, 45),
  gradient: ["#FF7F50", "#FFB74D", "#31CCFF"],
  gradientAccent: ["#FF7F50", "#FFD54F"],
  tipIcon: chalk.rgb(255, 127, 80)("\u2726"),
  boxBorder: "#FF7F50",
  primaryHex: "#FF7F50",
  accentHex: "#FFB74D",
  dimHex: "#8B6050",
  thinkingLevelHex: {
    none: "#555555", minimal: "#6B7280", low: "#60A5FA",
    medium: "#FBBF24", high: "#F97316", ultra: "#EF4444",
  },
  phaseHex: {
    planning: "#A78BFA", executing: "#34D399", verifying: "#60A5FA",
    recovering: "#FBBF24", idle: "#6B7280",
  },
};

const day: Theme = {
  ...shared,
  name: "Day",
  accent: chalk.white,
  user: chalk.blueBright.bold,
  agent: skyBlueBold,
  tool: chalk.yellowBright,
  thinking: skyBlue,
  prompt: skyBlueBold("\u276F "),
  cloud: chalk.rgb(49, 204, 255)("●") + " ",
  spinnerFrames: ["░", "▒", "▓", "█", "▓", "▒"],
  thinkingFrames: ["\u2591\u2591\u2591", "\u2592\u2591\u2591", "\u2593\u2592\u2591", "\u2588\u2593\u2592", "\u2593\u2588\u2593", "\u2592\u2593\u2588", "\u2591\u2592\u2593", "\u2591\u2591\u2592"],
  statusBarBg: chalk.bgRgb(30, 35, 50),
  statusBarFg: chalk.rgb(180, 190, 210),
  inputBorder: chalk.rgb(49, 204, 255).dim,
  highlight: chalk.bgRgb(40, 50, 70),
  gradient: ["#31CCFF", "#7B61FF", "#31CCFF"],
  gradientAccent: ["#31CCFF", "#5E9FFF"],
  tipIcon: chalk.rgb(49, 204, 255)("\u2726"),
  boxBorder: "#31CCFF",
  primaryHex: "#31CCFF",
  accentHex: "#5E9FFF",
  dimHex: "#4A7A99",
  thinkingLevelHex: {
    none: "#555555", minimal: "#6B7280", low: "#60A5FA",
    medium: "#FBBF24", high: "#F97316", ultra: "#EF4444",
  },
  phaseHex: {
    planning: "#A78BFA", executing: "#34D399", verifying: "#60A5FA",
    recovering: "#FBBF24", idle: "#6B7280",
  },
};

const dusk: Theme = {
  ...shared,
  name: "Dusk",
  accent: chalk.rgb(200, 100, 255),        // purple-magenta
  user: chalk.rgb(255, 150, 200).bold,      // pink
  agent: skyBlueBold,
  tool: chalk.rgb(200, 100, 255),
  thinking: chalk.rgb(200, 100, 255),
  prompt: chalk.rgb(200, 100, 255).bold("\u276F "),
  cloud: chalk.magenta("◉") + " ",
  spinnerFrames: ["░", "▒", "▓", "█", "▓", "▒"],
  thinkingFrames: ["\u2591\u2591\u2591", "\u2592\u2591\u2591", "\u2593\u2592\u2591", "\u2588\u2593\u2592", "\u2593\u2588\u2593", "\u2592\u2593\u2588", "\u2591\u2592\u2593", "\u2591\u2591\u2592"],
  statusBarBg: chalk.bgRgb(35, 25, 50),
  statusBarFg: chalk.rgb(190, 170, 210),
  inputBorder: chalk.rgb(200, 100, 255).dim,
  highlight: chalk.bgRgb(50, 35, 65),
  gradient: ["#C864FF", "#7B61FF", "#31CCFF"],
  gradientAccent: ["#C864FF", "#FF96C8"],
  tipIcon: chalk.rgb(200, 100, 255)("\u2726"),
  boxBorder: "#C864FF",
  primaryHex: "#C864FF",
  accentHex: "#FF96C8",
  dimHex: "#7B4D99",
  thinkingLevelHex: {
    none: "#555555", minimal: "#6B7280", low: "#A78BFA",
    medium: "#FBBF24", high: "#F97316", ultra: "#EF4444",
  },
  phaseHex: {
    planning: "#C084FC", executing: "#34D399", verifying: "#A78BFA",
    recovering: "#FBBF24", idle: "#6B7280",
  },
};

const night: Theme = {
  ...shared,
  name: "Night",
  accent: chalk.rgb(100, 120, 200),        // indigo
  user: chalk.rgb(130, 150, 220).bold,
  agent: skyBlueBold,
  tool: chalk.rgb(100, 120, 200),
  thinking: chalk.rgb(100, 120, 200),
  prompt: chalk.rgb(100, 120, 200).bold("\u276F "),
  cloud: chalk.blue("◉") + " ",
  spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  thinkingFrames: ["\u2591\u2591\u2591", "\u2592\u2591\u2591", "\u2593\u2592\u2591", "\u2588\u2593\u2592", "\u2593\u2588\u2593", "\u2592\u2593\u2588", "\u2591\u2592\u2593", "\u2591\u2591\u2592"],
  statusBarBg: chalk.bgRgb(20, 25, 40),
  statusBarFg: chalk.rgb(150, 160, 200),
  inputBorder: chalk.rgb(100, 120, 200).dim,
  highlight: chalk.bgRgb(30, 35, 55),
  gradient: ["#6478C8", "#7B61FF", "#31CCFF"],
  gradientAccent: ["#6478C8", "#4A5A9F"],
  tipIcon: chalk.rgb(100, 120, 200)("\u2726"),
  boxBorder: "#6478C8",
  primaryHex: "#6478C8",
  accentHex: "#4A5A9F",
  dimHex: "#3D4A7A",
  thinkingLevelHex: {
    none: "#555555", minimal: "#6B7280", low: "#818CF8",
    medium: "#FBBF24", high: "#F97316", ultra: "#EF4444",
  },
  phaseHex: {
    planning: "#A78BFA", executing: "#34D399", verifying: "#818CF8",
    recovering: "#FBBF24", idle: "#6B7280",
  },
};

export const themes = { dawn, day, dusk, night } as const;
export type ThemeName = keyof typeof themes;

// ── State ─────────────────────────────────────────────────────────

let current: Theme = day;

export function getTheme(): Theme {
  return current;
}

/** Alias for getTheme - for backward compatibility */
export function getCurrentTheme(): Theme {
  return current;
}

export function setTheme(name: ThemeName): void {
  current = themes[name];
}

/** Alias — shorthand for current theme */
export const t: Theme = new Proxy({} as Theme, {
  get(_target, prop: string) {
    return (current as unknown as Record<string, unknown>)[prop];
  },
});
