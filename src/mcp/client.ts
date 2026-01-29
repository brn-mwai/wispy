import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("mcp");

export interface McpServerConfig {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

interface McpServerStore {
  servers: McpServerConfig[];
}

export interface McpConnection {
  config: McpServerConfig;
  process: ChildProcess;
  tools: McpTool[];
  status: "starting" | "running" | "stopped" | "error";
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class McpRegistry {
  private runtimeDir: string;
  private connections = new Map<string, McpConnection>();

  constructor(runtimeDir: string) {
    this.runtimeDir = runtimeDir;
  }

  private getStorePath(): string {
    return resolve(this.runtimeDir, "mcp", "servers.json");
  }

  loadServers(): McpServerConfig[] {
    const store = readJSON<McpServerStore>(this.getStorePath());
    return store?.servers || [];
  }

  saveServers(servers: McpServerConfig[]) {
    ensureDir(resolve(this.runtimeDir, "mcp"));
    writeJSON(this.getStorePath(), { servers });
  }

  async startServer(config: McpServerConfig): Promise<McpConnection> {
    log.info("Starting MCP server: %s (%s)", config.id, config.command);

    const proc = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const conn: McpConnection = {
      config,
      process: proc,
      tools: [],
      status: "starting",
    };

    // Read stdout for MCP protocol messages (JSON-RPC over stdio)
    let buffer = "";
    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      // Process complete JSON-RPC messages
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleMessage(config.id, msg);
        } catch {
          log.debug("MCP %s stdout: %s", config.id, line.slice(0, 200));
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      log.warn("MCP %s stderr: %s", config.id, data.toString().slice(0, 200));
    });

    proc.on("exit", (code) => {
      log.info("MCP server %s exited with code %d", config.id, code ?? -1);
      conn.status = "stopped";
    });

    proc.on("error", (err) => {
      log.error({ err }, "MCP server %s error", config.id);
      conn.status = "error";
    });

    this.connections.set(config.id, conn);

    // Send initialize request
    this.sendMessage(config.id, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "wispy", version: "0.1.0" },
      },
    });

    conn.status = "running";
    return conn;
  }

  private sendMessage(serverId: string, message: unknown) {
    const conn = this.connections.get(serverId);
    if (conn?.process.stdin?.writable) {
      conn.process.stdin.write(JSON.stringify(message) + "\n");
    }
  }

  private handleMessage(serverId: string, msg: any) {
    if (msg.result?.tools) {
      const conn = this.connections.get(serverId);
      if (conn) {
        conn.tools = msg.result.tools;
        log.info("MCP %s registered %d tools", serverId, conn.tools.length);
      }
    }
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const conn = this.connections.get(serverId);
    if (!conn || conn.status !== "running") {
      throw new Error(`MCP server ${serverId} not running`);
    }

    return new Promise((resolve, reject) => {
      const id = Date.now();
      const timeout = setTimeout(() => reject(new Error("MCP call timeout")), 30000);

      // Listen for response
      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            clearTimeout(timeout);
            conn.process.stdout?.off("data", handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        } catch { /* not our message */ }
      };
      conn.process.stdout?.on("data", handler);

      this.sendMessage(serverId, {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      });
    });
  }

  getAllTools(): Array<McpTool & { serverId: string }> {
    const tools: Array<McpTool & { serverId: string }> = [];
    for (const [id, conn] of this.connections) {
      for (const tool of conn.tools) {
        tools.push({ ...tool, serverId: id });
      }
    }
    return tools;
  }

  async startAll() {
    const servers = this.loadServers();
    for (const s of servers) {
      if (s.enabled) {
        try {
          await this.startServer(s);
        } catch (err) {
          log.error({ err }, "Failed to start MCP server: %s", s.id);
        }
      }
    }
  }

  stopAll() {
    for (const [id, conn] of this.connections) {
      conn.process.kill();
      log.info("Stopped MCP server: %s", id);
    }
    this.connections.clear();
  }

  getStatus(): Array<{ id: string; status: string; tools: number }> {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      id,
      status: conn.status,
      tools: conn.tools.length,
    }));
  }
}
