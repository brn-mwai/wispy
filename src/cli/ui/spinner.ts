import ora, { type Ora } from "ora";
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
