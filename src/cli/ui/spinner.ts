import ora, { type Ora } from "ora";
import chalk from "chalk";
import { getTheme, t } from "./theme.js";

let active: Ora | null = null;
let phraseInterval: ReturnType<typeof setInterval> | null = null;

const THINKING_PHRASES = [
  "Thinking",
  "Reasoning",
  "Analyzing",
  "Processing",
  "Evaluating",
  "Crafting",
  "Composing",
  "Reflecting",
  "Computing",
  "Synthesizing",
];

const TOOL_PHRASES = [
  "Executing",
  "Running",
  "Working",
  "Building",
  "Creating",
  "Generating",
];

let phraseIndex = 0;

export function startSpinner(text: string): Ora {
  stopSpinner();
  const theme = getTheme();
  active = ora({
    text: theme.thinking(text),
    spinner: {
      interval: 120,
      frames: theme.spinnerFrames,
    },
  }).start();
  return active;
}

/**
 * Start a thinking spinner that cycles through one-word phrases
 * and shows elapsed time, e.g. "Reasoning... (3.2s)"
 */
export function startThinkingSpinner(): Ora {
  stopSpinner();
  const theme = getTheme();
  phraseIndex = Math.floor(Math.random() * THINKING_PHRASES.length);
  const startTime = Date.now();

  active = ora({
    text: theme.thinking(`${THINKING_PHRASES[phraseIndex]}...`),
    spinner: {
      interval: 120,
      frames: theme.spinnerFrames,
    },
  }).start();

  phraseInterval = setInterval(() => {
    if (!active) return;
    phraseIndex = (phraseIndex + 1) % THINKING_PHRASES.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    active.text = theme.thinking(`${THINKING_PHRASES[phraseIndex]}... (${elapsed}s)`);
  }, 2000);

  return active;
}

export function updateSpinner(text: string): void {
  if (active) active.text = getTheme().thinking(text);
}

export function succeedSpinner(text?: string): void {
  if (active) {
    active.succeed(text);
    active = null;
  }
  clearPhraseInterval();
}

export function failSpinner(text?: string): void {
  if (active) {
    active.fail(text);
    active = null;
  }
  clearPhraseInterval();
}

export function stopSpinner(): void {
  if (active) {
    active.stop();
    active = null;
  }
  clearPhraseInterval();
}

function clearPhraseInterval(): void {
  if (phraseInterval) {
    clearInterval(phraseInterval);
    phraseInterval = null;
  }
}

/**
 * Start a tool execution spinner with the tool name
 */
export function startToolSpinner(toolName: string): Ora {
  stopSpinner();
  const theme = getTheme();
  phraseIndex = Math.floor(Math.random() * TOOL_PHRASES.length);
  const startTime = Date.now();

  const displayName = toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());

  active = ora({
    text: chalk.yellow(`${TOOL_PHRASES[phraseIndex]} ${displayName}...`),
    spinner: {
      interval: 100,
      frames: ["▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰", "▱▰▰▰▰", "▱▱▰▰▰", "▱▱▱▰▰", "▱▱▱▱▰", "▱▱▱▱▱"],
    },
  }).start();

  phraseInterval = setInterval(() => {
    if (!active) return;
    phraseIndex = (phraseIndex + 1) % TOOL_PHRASES.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    active.text = chalk.yellow(`${TOOL_PHRASES[phraseIndex]} ${displayName}... (${elapsed}s)`);
  }, 1500);

  return active;
}

/**
 * Start a marathon progress spinner
 */
export function startMarathonSpinner(milestone: string, progress: number): Ora {
  stopSpinner();
  const progressBar = renderProgressBar(progress, 20);

  active = ora({
    text: chalk.cyan(`${milestone} ${progressBar}`),
    spinner: {
      interval: 150,
      frames: ["◐", "◓", "◑", "◒"],
    },
  }).start();

  return active;
}

/**
 * Render a progress bar
 */
function renderProgressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty)) + ` ${percent}%`;
}

/**
 * Update the spinner with progress info
 */
export function updateSpinnerProgress(text: string, progress: number): void {
  if (active) {
    const progressBar = renderProgressBar(progress, 15);
    active.text = getTheme().thinking(`${text} ${progressBar}`);
  }
}
