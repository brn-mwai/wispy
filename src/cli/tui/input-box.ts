/**
 * Visual input area rendered at the bottom of the terminal.
 *
 * ──────────────────────────────────  (dim border)
 * ❯ user types here|                 (prompt + text + cursor)
 */

import chalk from "chalk";
import { screen } from "./screen.js";
import type { LayoutRegions } from "./layout.js";
import { t } from "../ui/theme.js";

export class InputBox {
  buffer = "";
  cursorPos = 0;
  scrollOffset = 0;
  private layout: LayoutRegions;

  constructor(layout: LayoutRegions) {
    this.layout = layout;
  }

  // ── Text manipulation ─────────────────────────────────────────────

  insert(char: string): void {
    this.buffer =
      this.buffer.slice(0, this.cursorPos) + char + this.buffer.slice(this.cursorPos);
    this.cursorPos += char.length;
  }

  backspace(): void {
    if (this.cursorPos <= 0) return;
    this.buffer =
      this.buffer.slice(0, this.cursorPos - 1) + this.buffer.slice(this.cursorPos);
    this.cursorPos--;
  }

  deleteChar(): void {
    if (this.cursorPos >= this.buffer.length) return;
    this.buffer =
      this.buffer.slice(0, this.cursorPos) + this.buffer.slice(this.cursorPos + 1);
  }

  // ── Cursor movement ───────────────────────────────────────────────

  moveCursorLeft(): void {
    if (this.cursorPos > 0) this.cursorPos--;
  }

  moveCursorRight(): void {
    if (this.cursorPos < this.buffer.length) this.cursorPos++;
  }

  home(): void {
    this.cursorPos = 0;
  }

  end(): void {
    this.cursorPos = this.buffer.length;
  }

  // ── Submit / Clear ────────────────────────────────────────────────

  /** Return current text and reset buffer. Used on Enter. */
  submit(): string {
    const text = this.buffer;
    this.buffer = "";
    this.cursorPos = 0;
    this.scrollOffset = 0;
    return text;
  }

  /** Return current text and reset buffer. Used on double-ESC. */
  clear(): string {
    return this.submit();
  }

  getBuffer(): string {
    return this.buffer;
  }

  /** Replace buffer contents (e.g. history navigation). */
  setLine(text: string): void {
    this.buffer = text;
    this.cursorPos = text.length;
    this.scrollOffset = 0;
  }

  // ── Layout ────────────────────────────────────────────────────────

  updateLayout(layout: LayoutRegions): void {
    this.layout = layout;
  }

  // ── Rendering ─────────────────────────────────────────────────────

  render(): void {
    const { borderRow, inputRow, width } = this.layout;

    // Prompt prefix "❯ " takes 2 visible columns
    const promptStr = t.accent("❯") + " ";
    const promptLen = 2;
    const visibleWidth = Math.max(width - promptLen, 1);

    // Adjust scroll offset so cursor stays visible
    if (this.cursorPos < this.scrollOffset) {
      this.scrollOffset = this.cursorPos;
    } else if (this.cursorPos - this.scrollOffset >= visibleWidth) {
      this.scrollOffset = this.cursorPos - visibleWidth + 1;
    }

    const visibleText = this.buffer.slice(
      this.scrollOffset,
      this.scrollOffset + visibleWidth,
    );

    // ── Border line ───────────────────────────────────────────────
    screen.moveTo(borderRow, 1);
    screen.clearLine();
    screen.write(chalk.dim("─".repeat(width)));

    // ── Input line ────────────────────────────────────────────────
    screen.moveTo(inputRow, 1);
    screen.clearLine();
    screen.write(promptStr + visibleText);

    // Position the real terminal cursor at the correct column
    const cursorCol = promptLen + (this.cursorPos - this.scrollOffset) + 1;
    screen.moveTo(inputRow, cursorCol);
    screen.showCursor();
  }
}
