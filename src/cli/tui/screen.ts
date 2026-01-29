/**
 * ANSI escape code helpers for terminal rendering.
 * Provides low-level cursor, screen, and scroll manipulation.
 */

const ESC = "\x1b[";

export const screen = {
  /** Clear the entire screen and move cursor to origin (1,1). */
  clear(): void {
    process.stdout.write(`${ESC}2J${ESC}H`);
  },

  /** Move cursor to a specific row and column (1-based). */
  moveTo(row: number, col: number): void {
    process.stdout.write(`${ESC}${row};${col}H`);
  },

  /** Clear the current line. */
  clearLine(): void {
    process.stdout.write(`${ESC}2K`);
  },

  /** Clear from cursor position to the end of the screen. */
  clearDown(): void {
    process.stdout.write(`${ESC}J`);
  },

  /** Save the current cursor position. */
  saveCursor(): void {
    process.stdout.write(`${ESC}s`);
  },

  /** Restore a previously saved cursor position. */
  restoreCursor(): void {
    process.stdout.write(`${ESC}u`);
  },

  /** Hide the cursor. */
  hideCursor(): void {
    process.stdout.write(`${ESC}?25l`);
  },

  /** Show the cursor. */
  showCursor(): void {
    process.stdout.write(`${ESC}?25h`);
  },

  /** Set the scrollable region to rows [top, bottom] (1-based, inclusive). */
  scrollRegion(top: number, bottom: number): void {
    process.stdout.write(`${ESC}${top};${bottom}r`);
  },

  /** Reset the scroll region to the full screen. */
  resetScrollRegion(): void {
    process.stdout.write(`${ESC}r`);
  },

  /** Get the current terminal dimensions. */
  getSize(): { rows: number; cols: number } {
    return {
      rows: process.stdout.rows ?? 24,
      cols: process.stdout.columns ?? 80,
    };
  },

  /** Write raw text to stdout. */
  write(text: string): void {
    process.stdout.write(text);
  },
};
