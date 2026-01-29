/**
 * Screen region calculator for the TUI layout.
 *
 * Layout (bottom-anchored, 1-based rows):
 *
 *   Row 1              ← chatTop
 *   ...
 *   Row height - 3     ← chatBottom
 *   Row height - 2     ← statusRow  (status bar)
 *   Row height - 1     ← borderRow  (input border)
 *   Row height         ← inputRow   (input text)
 */

import { screen } from "./screen.js";

export interface LayoutRegions {
  /** First row of the chat area (1-based). */
  chatTop: number;
  /** Last row of the scrollable chat area. */
  chatBottom: number;
  /** Status bar row. */
  statusRow: number;
  /** Input border row (visual separator). */
  borderRow: number;
  /** Input text row (where the user types). */
  inputRow: number;
  /** Terminal width in columns. */
  width: number;
  /** Terminal height in rows. */
  height: number;
}

/** Compute layout regions based on current terminal size. */
export function calculateLayout(): LayoutRegions {
  const { rows: height, cols: width } = screen.getSize();

  return {
    chatTop: 1,
    chatBottom: height - 3,
    statusRow: height - 2,
    borderRow: height - 1,
    inputRow: height,
    width,
    height,
  };
}

/**
 * Register a callback that fires whenever the terminal is resized.
 * The callback receives the freshly calculated layout.
 */
export function onResize(callback: (layout: LayoutRegions) => void): void {
  process.stdout.on("resize", () => {
    callback(calculateLayout());
  });
}
