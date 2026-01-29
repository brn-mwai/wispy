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
};

export const themes = { dawn, day, dusk, night } as const;
export type ThemeName = keyof typeof themes;

// ── State ─────────────────────────────────────────────────────────

let current: Theme = day;

export function getTheme(): Theme {
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
