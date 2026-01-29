/**
 * Interactive prompt history browser.
 * Renders a bordered overlay panel in the chat area,
 * allowing the user to navigate and select past prompts.
 */

import chalk from "chalk";
import { screen } from "./screen.js";
import type { LayoutRegions } from "./layout.js";
import { KeyHandler } from "./key-handler.js";
import type { CliHistory } from "../history.js";

const MAX_VISIBLE = 10;
const BORDER_COLOR = chalk.rgb(77, 209, 249);
const SELECTED_BG = chalk.bgRgb(50, 60, 80);
const FOOTER_TEXT = "  \u2191\u2193 navigate \u00B7 Enter select \u00B7 Esc cancel";

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}

function renderPanel(
  entries: string[],
  selectedIndex: number,
  scrollOffset: number,
  layout: LayoutRegions,
): void {
  const { width } = layout;
  const chatHeight = layout.chatBottom - layout.chatTop + 1;
  const panelWidth = Math.min(width - 4, 60);
  const innerWidth = panelWidth - 2;

  const panelHeight = Math.min(MAX_VISIBLE + 4, chatHeight);
  const startRow = layout.chatTop + Math.max(0, Math.floor((chatHeight - panelHeight) / 2));
  const startCol = Math.max(1, Math.floor((width - panelWidth) / 2));

  const hBar = "\u2500".repeat(panelWidth - 2);
  const title = " Prompt History ";
  const titleStart = Math.floor((panelWidth - 2 - title.length) / 2);
  const topBorder =
    "\u250C" +
    hBar.slice(0, titleStart) +
    title +
    hBar.slice(titleStart + title.length) +
    "\u2510";
  const bottomBorder = "\u2514" + hBar + "\u2518";

  screen.moveTo(startRow, startCol);
  screen.write(BORDER_COLOR(topBorder));

  screen.moveTo(startRow + 1, startCol);
  screen.write(BORDER_COLOR("\u2502") + " ".repeat(innerWidth) + BORDER_COLOR("\u2502"));

  const visibleCount = Math.min(entries.length, MAX_VISIBLE, panelHeight - 4);
  for (let i = 0; i < visibleCount; i++) {
    const entryIdx = scrollOffset + i;
    if (entryIdx >= entries.length) break;
    const row = startRow + 2 + i;
    const prefix = entryIdx === selectedIndex ? " > " : "   ";
    const text = truncate(entries[entryIdx]!, innerWidth - 3);
    const padded = (prefix + text).padEnd(innerWidth);

    screen.moveTo(row, startCol);
    if (entryIdx === selectedIndex) {
      screen.write(
        BORDER_COLOR("\u2502") +
        SELECTED_BG(chalk.bold(padded)) +
        BORDER_COLOR("\u2502"),
      );
    } else {
      screen.write(
        BORDER_COLOR("\u2502") + padded + BORDER_COLOR("\u2502"),
      );
    }
  }

  for (let i = visibleCount; i < panelHeight - 4; i++) {
    const row = startRow + 2 + i;
    screen.moveTo(row, startCol);
    screen.write(BORDER_COLOR("\u2502") + " ".repeat(innerWidth) + BORDER_COLOR("\u2502"));
  }

  const footerRow = startRow + panelHeight - 2;
  const footerPadded = chalk.dim(FOOTER_TEXT).padEnd(innerWidth);
  screen.moveTo(footerRow, startCol);
  screen.write(BORDER_COLOR("\u2502") + footerPadded + BORDER_COLOR("\u2502"));

  screen.moveTo(footerRow + 1, startCol);
  screen.write(BORDER_COLOR(bottomBorder));
}

function clearOverlay(layout: LayoutRegions): void {
  const chatHeight = layout.chatBottom - layout.chatTop + 1;
  for (let row = layout.chatTop; row < layout.chatTop + chatHeight; row++) {
    screen.moveTo(row, 1);
    screen.clearLine();
  }
}

/**
 * Open the history browser overlay and wait for user selection.
 * Returns the selected history entry, or null if cancelled.
 */
export async function browseHistory(
  history: CliHistory,
  layout: LayoutRegions,
): Promise<string | null> {
  const allEntries = history.getAll().reverse();
  if (allEntries.length === 0) return null;

  let selectedIndex = 0;
  let scrollOffset = 0;

  screen.hideCursor();
  renderPanel(allEntries, selectedIndex, scrollOffset, layout);

  return new Promise<string | null>((resolve) => {
    const keys = new KeyHandler();

    function updateScroll(): void {
      const visibleCount = Math.min(allEntries.length, MAX_VISIBLE);
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex;
      } else if (selectedIndex >= scrollOffset + visibleCount) {
        scrollOffset = selectedIndex - visibleCount + 1;
      }
    }

    function cleanup(): void {
      keys.stop();
      clearOverlay(layout);
      screen.showCursor();
    }

    keys.on("up", () => {
      if (selectedIndex > 0) {
        selectedIndex--;
        updateScroll();
        renderPanel(allEntries, selectedIndex, scrollOffset, layout);
      }
    });

    keys.on("down", () => {
      if (selectedIndex < allEntries.length - 1) {
        selectedIndex++;
        updateScroll();
        renderPanel(allEntries, selectedIndex, scrollOffset, layout);
      }
    });

    keys.on("enter", () => {
      cleanup();
      resolve(allEntries[selectedIndex]);
    });

    keys.on("double-esc", () => {
      cleanup();
      resolve(null);
    });

    // Single ESC after timeout also cancels
    keys.on("sigint", () => {
      cleanup();
      resolve(null);
    });

    keys.start();
  });
}
