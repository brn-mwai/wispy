/**
 * Raw stdin keypress parser with double-ESC detection.
 * Emits named key events via EventEmitter.
 */

import { EventEmitter } from "events";

export interface KeyEvent {
  name: string;
  raw: Buffer;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

/** Timeout (ms) to distinguish a bare ESC from an escape sequence prefix. */
const BARE_ESC_DELAY = 50;

/** Maximum gap (ms) between two bare ESCs to count as double-ESC. */
const DOUBLE_ESC_WINDOW = 300;

export class KeyHandler extends EventEmitter {
  private lastEscTime = 0;
  private escTimeout: NodeJS.Timeout | null = null;
  private dataHandler: ((data: Buffer) => void) | null = null;

  /** Enable raw mode and begin listening for keypresses. */
  start(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    this.dataHandler = (data: Buffer) => this.handleData(data);
    process.stdin.on("data", this.dataHandler);
  }

  /** Restore cooked mode and stop listening. */
  stop(): void {
    if (this.escTimeout) {
      clearTimeout(this.escTimeout);
      this.escTimeout = null;
    }
    if (this.dataHandler) {
      process.stdin.removeListener("data", this.dataHandler);
      this.dataHandler = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  // ── Internal parsing ────────────────────────────────────────────────

  private handleData(data: Buffer): void {
    const seq = data.toString("utf-8");

    // --- Bare ESC (single 0x1b byte) ---
    if (data.length === 1 && data[0] === 0x1b) {
      this.handleBareEsc(data);
      return;
    }

    // If we were waiting on a bare-ESC timeout and more data arrived,
    // that means the ESC was actually a sequence prefix — cancel the timer.
    if (this.escTimeout) {
      clearTimeout(this.escTimeout);
      this.escTimeout = null;
    }

    // --- Escape sequences ---
    if (seq.startsWith("\x1b[")) {
      this.handleEscapeSequence(seq, data);
      return;
    }

    // --- Control characters ---
    if (data.length === 1) {
      const byte = data[0]!;

      if (byte === 0x0d || byte === 0x0a) {
        this.emitKey("enter", data, seq);
        return;
      }
      if (byte === 0x7f || byte === 0x08) {
        this.emitKey("backspace", data, seq);
        return;
      }
      if (byte === 0x03) {
        this.emitKey("sigint", data, seq, { ctrl: true });
        return;
      }
      if (byte === 0x12) {
        this.emitKey("ctrl-r", data, seq, { ctrl: true });
        return;
      }
      if (byte === 0x09) {
        this.emitKey("tab", data, seq);
        return;
      }

      // Printable ASCII (space through tilde)
      if (byte >= 0x20 && byte <= 0x7e) {
        this.emitKey("char", data, seq);
        return;
      }
    }

    // Multi-byte UTF-8 printable characters
    if (data.length > 1 && data[0]! >= 0xc0) {
      this.emitKey("char", data, seq);
      return;
    }
  }

  /** Handle a bare ESC byte — implements double-ESC detection. */
  private handleBareEsc(data: Buffer): void {
    // If there's already a pending ESC timeout, cancel it — we now know
    // the previous ESC was a real bare ESC. Check for double-ESC window.
    if (this.escTimeout) {
      clearTimeout(this.escTimeout);
      this.escTimeout = null;
    }

    const now = Date.now();

    if (now - this.lastEscTime <= DOUBLE_ESC_WINDOW) {
      // Second bare ESC within the window → double-ESC.
      this.lastEscTime = 0;
      this.emitKey("double-esc", data, "\x1b");
      return;
    }

    // First bare ESC — wait briefly to see if more bytes follow
    // (which would make it an escape sequence prefix).
    this.lastEscTime = now;
    this.escTimeout = setTimeout(() => {
      this.escTimeout = null;
      // No follow-up bytes arrived → treat as a single bare ESC.
      // (We don't emit a specific event for single bare ESC; it simply
      // records the timestamp for potential double-ESC detection.)
    }, BARE_ESC_DELAY);
  }

  /** Parse CSI-style escape sequences (\x1b[...). */
  private handleEscapeSequence(seq: string, data: Buffer): void {
    switch (seq) {
      case "\x1b[A":
        this.emitKey("up", data, seq);
        break;
      case "\x1b[B":
        this.emitKey("down", data, seq);
        break;
      case "\x1b[C":
        this.emitKey("right", data, seq);
        break;
      case "\x1b[D":
        this.emitKey("left", data, seq);
        break;
      case "\x1b[H":
      case "\x1b[1~":
        this.emitKey("home", data, seq);
        break;
      case "\x1b[F":
      case "\x1b[4~":
        this.emitKey("end", data, seq);
        break;
      case "\x1b[3~":
        this.emitKey("delete", data, seq);
        break;
      default:
        // Unrecognised sequence — silently ignore.
        break;
    }
  }

  /** Build and emit a KeyEvent. */
  private emitKey(
    name: string,
    raw: Buffer,
    sequence: string,
    flags: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {},
  ): void {
    const event: KeyEvent = {
      name,
      raw,
      ctrl: flags.ctrl ?? false,
      meta: flags.meta ?? false,
      shift: flags.shift ?? false,
      sequence,
    };
    this.emit(name, event);
  }
}
