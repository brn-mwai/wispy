/**
 * Connected REPL — thin CLI client that connects to a running Wispy gateway
 * via WebSocket instead of running its own agent.
 *
 * Produces identical output to the standalone REPL using the same
 * OutputRenderer and StatusBar components.
 */

import * as readline from "readline";
import chalk from "chalk";
import WebSocket from "ws";
import { nanoid } from "nanoid";
import { t } from "./ui/theme.js";
import { OutputRenderer } from "./tui/output-renderer.js";
import { StatusBar } from "./tui/status-bar.js";
import { calculateLayout, onResize } from "./tui/layout.js";
import { formatToolCall, type ToolCallDisplay } from "./ui/tool-display.js";
import type { Frame } from "../gateway/protocol/index.js";

export interface ConnectedReplOpts {
  gatewayUrl: string;
}

export class ConnectedRepl {
  private ws: WebSocket | null = null;
  private rl: readline.Interface | null = null;
  private renderer = new OutputRenderer();
  private statusBar: StatusBar;
  private clientId: string;
  private peerId: string;
  private gatewayUrl: string;
  private firstText = true;
  private currentToolName = "";

  constructor(opts: ConnectedReplOpts) {
    this.gatewayUrl = opts.gatewayUrl;
    this.clientId = nanoid(8);
    this.peerId = `cli:${this.clientId}`;

    const layout = calculateLayout();
    this.statusBar = new StatusBar(layout);

    onResize((newLayout) => {
      this.statusBar.updateLayout(newLayout);
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(chalk.dim(`\n  Connecting to gateway at ${this.gatewayUrl}...`));

      this.ws = new WebSocket(this.gatewayUrl);

      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${this.gatewayUrl}`));
      }, 10000);

      this.ws.on("open", () => {
        // Send cli_connect frame to identify as CLI client
        this.sendFrame("cli_connect", {
          clientName: `cli-${this.clientId}`,
          peerId: this.peerId,
        });
      });

      this.ws.on("message", (data) => {
        try {
          const frame = JSON.parse(data.toString()) as Frame;
          this.handleFrame(frame);

          // Resolve on first "connected" frame
          if (frame.type === "connected") {
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // Ignore parse errors
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on("close", () => {
        console.log(chalk.dim("\n  Disconnected from gateway.\n"));
        this.cleanup();
        process.exit(0);
      });
    });
  }

  startInterface(): void {
    console.log(chalk.green(`  ✓ Connected`) + chalk.dim(` (${this.peerId})`));
    console.log(chalk.dim(`  Gateway: ${this.gatewayUrl}`));
    console.log();
    this.renderer.renderSeparator();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: t.prompt,
      historySize: 200,
    });

    this.rl.prompt();

    this.rl.on("line", (line: string) => {
      const input = line.trim();
      if (!input) {
        this.rl?.prompt();
        return;
      }

      if (input === "/disconnect" || input === "/quit") {
        this.disconnect();
        return;
      }

      this.sendMessage(input);
      this.firstText = true;
      this.currentToolName = "";
    });

    this.rl.on("close", () => {
      this.disconnect();
    });

    this.rl.on("SIGINT", () => {
      this.disconnect();
    });
  }

  private sendMessage(text: string): void {
    this.sendFrame("chat", {
      message: text,
      peerId: this.peerId,
      channel: "cli",
    });
  }

  private sendFrame(type: string, payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  private handleFrame(frame: Frame): void {
    switch (frame.type) {
      case "connected":
        // Handled in connect() promise
        break;

      case "stream":
        this.handleStreamFrame(frame);
        break;

      case "error": {
        const err = frame.payload as { code: string; message: string };
        console.error(chalk.red(`\n  Error [${err.code}]: ${err.message}`));
        this.rl?.prompt();
        break;
      }

      case "session_update": {
        const update = frame.payload as {
          tokens: number;
          cost: number;
          context: number;
          session: string;
        };
        this.statusBar.setState({
          tokens: update.tokens,
          cost: update.cost,
          memory: "active",
          session: update.session,
          contextPercent: update.context,
        });
        this.statusBar.render();
        break;
      }

      case "cli_broadcast": {
        const broadcast = frame.payload as { source: string; message: string };
        if (broadcast.source !== this.peerId) {
          console.log(chalk.dim(`\n  [${broadcast.source}] ${broadcast.message}`));
        }
        break;
      }

      default:
        break;
    }
  }

  private handleStreamFrame(frame: Frame): void {
    const payload = frame.payload as { chunk: string; chunkType: string };

    switch (payload.chunkType) {
      case "thinking":
        // Show thinking indicator
        if (this.firstText) {
          process.stdout.write(chalk.dim(`\r  ◆ Thinking...`));
        }
        break;

      case "tool_call": {
        // Clear thinking line
        process.stdout.write("\r" + " ".repeat(40) + "\r");

        let toolArgs: Record<string, unknown> = {};
        try {
          if (payload.chunk.includes("{")) {
            const jsonStart = payload.chunk.indexOf("{");
            toolArgs = JSON.parse(payload.chunk.slice(jsonStart));
            this.currentToolName = payload.chunk.slice(0, jsonStart).trim();
          } else {
            this.currentToolName = payload.chunk;
          }
        } catch {
          this.currentToolName = payload.chunk;
        }

        const tc: ToolCallDisplay = { name: this.currentToolName, args: toolArgs, status: "pending" };
        process.stdout.write(formatToolCall(tc) + "\n");
        break;
      }

      case "tool_result": {
        const isError = payload.chunk.toLowerCase().includes("error") ||
                       payload.chunk.toLowerCase().includes("failed");

        const tc: ToolCallDisplay = {
          name: this.currentToolName || "tool",
          args: {},
          status: isError ? "error" : "ok",
          result: payload.chunk.slice(0, 200),
        };
        process.stdout.write(formatToolCall(tc) + "\n");
        break;
      }

      case "text":
        if (this.firstText) {
          // Clear thinking line and add blank line
          process.stdout.write("\r" + " ".repeat(40) + "\r");
          console.log();
          this.firstText = false;
        }
        process.stdout.write(payload.chunk);
        break;

      case "done":
        console.log();
        this.rl?.prompt();
        break;
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
    console.log(chalk.dim("\nDisconnected.\n"));
    process.exit(0);
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

/**
 * Start the connected REPL — connects to a running gateway.
 */
export async function startConnectedRepl(gatewayUrl: string): Promise<void> {
  const repl = new ConnectedRepl({ gatewayUrl });

  try {
    await repl.connect();
    repl.startInterface();
  } catch (err) {
    console.error(chalk.red(`\n  Failed to connect: ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.dim("  Make sure the gateway is running: wispy gateway\n"));
    process.exit(1);
  }
}
