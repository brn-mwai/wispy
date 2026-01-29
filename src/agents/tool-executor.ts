import { exec, spawn } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { ensureDir, readJSON, writeJSON } from "../utils/file.js";
import { downloadMedia, saveMedia } from "../utils/media.js";
import { requestApproval, categorizeAction } from "../security/action-guard.js";
import { sanitizeOutput } from "../security/api-key-guard.js";
import { appendToMemory, appendDailyNote } from "../core/memory.js";
import type { WispyConfig } from "../config/schema.js";
import type { MemoryManager } from "../memory/manager.js";
import type { IntegrationRegistry } from "../integrations/registry.js";
import type { McpRegistry } from "../mcp/client.js";
import { createCheckpoint } from "../cli/checkpoints.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("tool-executor");
const execAsync = promisify(exec);

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// Dangerous command patterns to block entirely
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs\./,
  /dd\s+if=/,
  /:(){ :|:& };:/,
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777\s+\//,
  /curl.*\|\s*bash/,
  /wget.*\|\s*bash/,
];

// Commands that are safe to auto-approve
const SAFE_COMMANDS = new Set([
  "ls", "pwd", "echo", "cat", "head", "tail", "wc", "grep", "find",
  "which", "whoami", "hostname", "date", "uname", "env",
  "git status", "git log", "git diff", "git branch",
  "node --version", "npm --version", "python --version",
]);

export class ToolExecutor {
  private config: WispyConfig;
  private runtimeDir: string;
  private soulDir: string;
  private memoryManager?: MemoryManager;
  private integrationRegistry?: IntegrationRegistry;
  private mcpRegistry?: McpRegistry;

  constructor(
    config: WispyConfig,
    runtimeDir: string,
    soulDir: string,
    memoryManager?: MemoryManager,
    integrationRegistry?: IntegrationRegistry,
    mcpRegistry?: McpRegistry
  ) {
    this.config = config;
    this.runtimeDir = runtimeDir;
    this.soulDir = soulDir;
    this.memoryManager = memoryManager;
    this.integrationRegistry = integrationRegistry;
    this.mcpRegistry = mcpRegistry;
  }

  async execute(tool: ToolCall): Promise<ToolResult> {
    log.info("Executing tool: %s", tool.name);

    try {
      switch (tool.name) {
        case "bash":
          return this.executeBash(tool.args);
        case "file_read":
          return this.executeFileRead(tool.args);
        case "file_write":
          return this.executeFileWrite(tool.args);
        case "file_search":
          return this.executeFileSearch(tool.args);
        case "memory_search":
          return this.executeMemorySearch(tool.args);
        case "memory_save":
          return this.executeMemorySave(tool.args);
        case "web_fetch":
          return this.executeWebFetch(tool.args);
        case "web_search":
          return this.executeWebSearch(tool.args);
        case "image_generate":
          return this.executeImageGenerate(tool.args);
        case "send_message":
          return this.executeSendMessage(tool.args);
        case "schedule_task":
          return this.executeScheduleTask(tool.args);
        case "wallet_balance":
          return this.executeWalletBalance(tool.args);
        case "wallet_pay":
          return this.executeWalletPay(tool.args);
        case "list_directory":
          return this.executeListDirectory(tool.args);
        default:
          // Try MCP servers first
          if (this.mcpRegistry) {
            const mcpTools = this.mcpRegistry.getAllTools();
            const mcpTool = mcpTools.find((t) => t.name === tool.name);
            if (mcpTool) {
              try {
                const result = await this.mcpRegistry.callTool(mcpTool.serverId, tool.name, tool.args);
                const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
                return { success: true, output: sanitizeOutput(output) };
              } catch (err: any) {
                return { success: false, output: "", error: `MCP tool error: ${err.message}` };
              }
            }
          }

          // Fallback to integration registry
          if (this.integrationRegistry) {
            const integrationResult = await this.integrationRegistry.executeTool(tool.name, tool.args);
            if (integrationResult) {
              return {
                success: integrationResult.success,
                output: integrationResult.output,
                error: integrationResult.error,
              };
            }
          }
          return { success: false, output: "", error: `Unknown tool: ${tool.name}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err }, "Tool execution failed: %s", tool.name);
      return { success: false, output: "", error: msg };
    }
  }

  private async executeBash(args: Record<string, unknown>): Promise<ToolResult> {
    const command = String(args.command || "");
    if (!command) return { success: false, output: "", error: "No command provided" };

    // Block dangerous commands
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { success: false, output: "", error: "Command blocked for safety: " + command.slice(0, 50) };
      }
    }

    // Check if approval needed
    const category = categorizeAction("bash");
    const isSafe = SAFE_COMMANDS.has(command.split(" ")[0]) ||
      SAFE_COMMANDS.has(command.trim());

    if (!isSafe && this.config.security.requireApprovalForExternal) {
      const approved = await requestApproval("bash", `Execute: ${command}`, { command });
      if (!approved) {
        return { success: false, output: "", error: "Command not approved by user" };
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024, // 1MB
        cwd: process.cwd(),
        env: { ...process.env },
      });

      const output = sanitizeOutput(stdout + (stderr ? `\nSTDERR: ${stderr}` : ""));
      return { success: true, output };
    } catch (err: any) {
      const output = sanitizeOutput(err.stdout || "");
      const error = sanitizeOutput(err.stderr || err.message || "Command failed");
      return { success: false, output, error };
    }
  }

  private executeFileRead(args: Record<string, unknown>): ToolResult {
    const path = String(args.path || "");
    if (!path) return { success: false, output: "", error: "No path provided" };
    if (!existsSync(path)) return { success: false, output: "", error: `File not found: ${path}` };

    try {
      const content = readFileSync(path, "utf-8");
      // Limit output size
      const truncated = content.length > 50000
        ? content.slice(0, 50000) + "\n... (truncated)"
        : content;
      return { success: true, output: sanitizeOutput(truncated) };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeFileWrite(args: Record<string, unknown>): Promise<ToolResult> {
    const path = String(args.path || "");
    const content = String(args.content || "");
    if (!path) return { success: false, output: "", error: "No path provided" };

    // Create checkpoint before overwrite
    if (existsSync(path)) {
      try { createCheckpoint(this.runtimeDir, path); } catch { /* non-fatal */ }
    }

    // Approval for overwrite
    if (existsSync(path) && this.config.security.requireApprovalForExternal) {
      const approved = await requestApproval("file_write", `Overwrite: ${path}`, { path });
      if (!approved) return { success: false, output: "", error: "Write not approved" };
    }

    try {
      ensureDir(dirname(path));
      writeFileSync(path, content, "utf-8");
      return { success: true, output: `Written ${content.length} bytes to ${path}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private executeFileSearch(args: Record<string, unknown>): ToolResult {
    const pattern = String(args.pattern || args.query || "");
    const dir = String(args.directory || args.path || process.cwd());
    if (!pattern) return { success: false, output: "", error: "No pattern provided" };

    try {
      const results: string[] = [];
      const search = (d: string, depth: number) => {
        if (depth > 5 || results.length > 50) return;
        try {
          const entries = readdirSync(d, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = resolve(d, entry.name);
            if (entry.isDirectory()) {
              search(full, depth + 1);
            } else if (entry.name.includes(pattern) || entry.name.match(pattern)) {
              results.push(full);
            }
          }
        } catch { /* skip inaccessible dirs */ }
      };
      search(dir, 0);
      return { success: true, output: results.join("\n") || "No files found" };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeMemorySearch(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query || "");
    if (!query) return { success: false, output: "", error: "No query provided" };

    if (!this.memoryManager) {
      return { success: false, output: "", error: "Memory system not initialized" };
    }

    const results = await this.memoryManager.search(query, 5);
    if (results.length === 0) return { success: true, output: "No memories found for: " + query };

    const output = results
      .map((r, i) => `[${i + 1}] (score: ${r.score.toFixed(2)}) ${r.text}`)
      .join("\n\n");
    return { success: true, output };
  }

  private executeMemorySave(args: Record<string, unknown>): ToolResult {
    const fact = String(args.fact || "");
    const category = String(args.category || "User Facts");
    if (!fact) return { success: false, output: "", error: "No fact provided" };

    appendToMemory(this.soulDir, category, fact);
    appendDailyNote(this.soulDir, `Saved memory: ${fact.slice(0, 80)}`);
    return { success: true, output: `Saved to memory [${category}]: ${fact}` };
  }

  private async executeWebFetch(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    if (!url) return { success: false, output: "", error: "No URL provided" };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Wispy/0.1.0" },
      });
      clearTimeout(timeout);

      if (!res.ok) return { success: false, output: "", error: `HTTP ${res.status}` };

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text") || contentType.includes("json")) {
        let text = await res.text();
        // Strip HTML tags for readability
        if (contentType.includes("html")) {
          text = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        const truncated = text.length > 30000 ? text.slice(0, 30000) + "\n...(truncated)" : text;
        return { success: true, output: sanitizeOutput(truncated) };
      }

      // Binary content — save to media
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = url.split("/").pop() || "download";
      const path = saveMedia(this.runtimeDir, "incoming", filename, buf);
      return { success: true, output: `Downloaded to: ${path} (${buf.length} bytes)` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query || "");
    if (!query) return { success: false, output: "", error: "No query provided" };

    // Use Gemini with grounding for web search
    try {
      const { generate } = await import("../ai/gemini.js");
      const result = await generate({
        model: this.config.gemini.models.flash,
        messages: [{ role: "user", content: `Search the web for: ${query}\n\nProvide a summary of the top results with sources.` }],
        thinkingLevel: "minimal",
      });
      return { success: true, output: result.text };
    } catch (err: any) {
      return { success: false, output: "", error: "Web search failed: " + err.message };
    }
  }

  private async executeImageGenerate(args: Record<string, unknown>): Promise<ToolResult> {
    const prompt = String(args.prompt || "");
    if (!prompt) return { success: false, output: "", error: "No prompt provided" };

    try {
      const { generateImage } = await import("../ai/gemini.js");
      const result = await generateImage(prompt, {
        model: this.config.gemini.models.image,
        aspectRatio: String(args.aspectRatio || "1:1"),
        numberOfImages: 1,
      });

      if (result.images.length === 0) {
        return { success: false, output: "", error: "No images generated" };
      }

      // Save image to media folder
      const { saveMedia } = await import("../utils/media.js");
      const timestamp = Date.now();
      const filename = `generated-${timestamp}.png`;
      const imageBuffer = Buffer.from(result.images[0].base64, "base64");
      const savedPath = saveMedia(this.runtimeDir, "outgoing", filename, imageBuffer);

      return {
        success: true,
        output: `Image generated and saved to: ${savedPath}\nSize: ${imageBuffer.length} bytes`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: "Image generation failed: " + err.message };
    }
  }

  private async executeSendMessage(args: Record<string, unknown>): Promise<ToolResult> {
    const channel = String(args.channel || "");
    const peerId = String(args.peerId || args.to || "");
    const text = String(args.text || args.message || "");
    if (!text) return { success: false, output: "", error: "No message text" };

    // Requires approval
    const approved = await requestApproval("send_message", `Send to ${channel}:${peerId}: ${text.slice(0, 50)}`, args);
    if (!approved) return { success: false, output: "", error: "Send not approved" };

    // Delegate to channel manager (will be wired in gateway)
    return { success: true, output: `Message queued for ${channel}:${peerId}` };
  }

  private executeScheduleTask(args: Record<string, unknown>): ToolResult {
    const name = String(args.name || "");
    const cron = String(args.cron || "");
    const instruction = String(args.instruction || "");
    if (!name || !cron || !instruction) {
      return { success: false, output: "", error: "name, cron, and instruction are required" };
    }

    // Will be wired to CronService
    return { success: true, output: `Task "${name}" scheduled: ${cron}` };
  }

  private async executeWalletBalance(_args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { getBalance, getWalletAddress } = await import("../wallet/x402.js");
      const address = getWalletAddress(this.runtimeDir);
      if (!address) return { success: false, output: "", error: "Wallet not initialized" };
      const balance = await getBalance(this.runtimeDir);
      return { success: true, output: `Address: ${address}\nUSDC Balance: ${balance}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeWalletPay(args: Record<string, unknown>): Promise<ToolResult> {
    const to = String(args.to || args.address || "");
    const amount = String(args.amount || "");
    if (!to || !amount) return { success: false, output: "", error: "to and amount required" };

    const approved = await requestApproval("wallet_pay", `Send ${amount} USDC to ${to}`, args);
    if (!approved) return { success: false, output: "", error: "Payment not approved" };

    return { success: true, output: `Payment of ${amount} USDC to ${to} initiated` };
  }

  private executeListDirectory(args: Record<string, unknown>): ToolResult {
    const dir = String(args.path || args.directory || process.cwd());
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      const output = entries
        .map((e) => `${e.isDirectory() ? "[DIR] " : "      "}${e.name}`)
        .join("\n");
      return { success: true, output };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }
}
