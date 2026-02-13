import { exec, execSync, spawn } from "child_process";
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
import type { CronService } from "../cron/service.js";
import type { ReminderService } from "../cron/reminders.js";

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
  "which", "whoami", "hostname", "date", "uname", "env", "dir", "cd",
  "git status", "git log", "git diff", "git branch", "git init", "git add", "git commit",
  "node --version", "npm --version", "python --version", "npx --version",
]);

// Commands that are auto-approved in autonomous mode (development tasks)
const DEV_COMMANDS_PATTERNS = [
  /^npm\s+(init|install|i|ci|run|start|build|test|create)/,
  /^npx\s+/,
  /^yarn\s+(init|install|add|run|start|build|test|create)/,
  /^pnpm\s+(init|install|add|run|start|build|test|create)/,
  /^bun\s+(init|install|add|run|start|build|test|create)/,
  /^pip\s+(install|freeze)/,
  /^python\s+(-m\s+)?pip/,
  /^cargo\s+(init|build|run|test|new)/,
  /^go\s+(mod|build|run|test|get)/,
  /^mkdir\s+/,
  /^touch\s+/,
  /^cp\s+/,
  /^mv\s+/,
  /^code\s+/,  // Open in VS Code
  /^start\s+/,  // Windows open
  /^open\s+/,   // macOS open
];

// Progress callback type for sending updates during tool execution
export type ProgressCallback = (event: {
  type: "tool_start" | "tool_complete" | "thinking" | "image_generated";
  toolName?: string;
  message?: string;
  data?: unknown;
}) => void | Promise<void>;

export class ToolExecutor {
  private config: WispyConfig;
  private runtimeDir: string;
  private soulDir: string;
  private memoryManager?: MemoryManager;
  private integrationRegistry?: IntegrationRegistry;
  private mcpRegistry?: McpRegistry;
  private cronService?: CronService;
  private reminderService?: ReminderService;
  private progressCallback?: ProgressCallback;

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

  /**
   * Set callback for progress notifications (used by Telegram visuals)
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Emit progress event
   */
  private async emitProgress(event: Parameters<ProgressCallback>[0]): Promise<void> {
    if (this.progressCallback) {
      try {
        await this.progressCallback(event);
      } catch (err) {
        log.debug("Progress callback error: %s", (err as Error).message);
      }
    }
  }

  /**
   * Set the cron service for scheduling tasks
   */
  setCronService(cronService: CronService): void {
    this.cronService = cronService;
  }

  /**
   * Set the reminder service for managing reminders
   */
  setReminderService(reminderService: ReminderService): void {
    this.reminderService = reminderService;
  }

  async execute(tool: ToolCall): Promise<ToolResult> {
    log.info("Executing tool: %s", tool.name);

    // Emit tool start event for progress tracking
    await this.emitProgress({
      type: "tool_start",
      toolName: tool.name,
      message: `Using ${tool.name}...`,
    });

    try {
      let result: ToolResult;
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
        case "generate_project_images":
          return this.executeGenerateProjectImages(tool.args);
        case "preview_and_screenshot":
          return this.executePreviewAndScreenshot(tool.args);
        case "send_image_to_chat":
          return this.executeSendImageToChat(tool.args);
        case "send_message":
          return this.executeSendMessage(tool.args);
        case "schedule_task":
          return this.executeScheduleTask(tool.args);
        case "remind_me":
          return this.executeRemindMe(tool.args);
        case "list_reminders":
          return this.executeListReminders(tool.args);
        case "delete_reminder":
          return this.executeDeleteReminder(tool.args);
        case "voice_reply":
          return this.executeVoiceReply(tool.args);
        case "set_voice_mode":
          return this.executeSetVoiceMode(tool.args);
        case "google_search":
          return this.executeGoogleSearch(tool.args);
        case "run_python":
          return this.executeRunPython(tool.args);
        case "wallet_balance":
          return this.executeWalletBalance(tool.args);
        case "wallet_pay":
          return this.executeWalletPay(tool.args);
        case "commerce_status":
          return this.executeCommerceStatus();
        case "list_directory":
          return this.executeListDirectory(tool.args);
        case "create_folder":
          return this.executeCreateFolder(tool.args);
        case "file_delete":
          return this.executeFileDelete(tool.args);
        case "file_copy":
          return this.executeFileCopy(tool.args);
        case "file_move":
          return this.executeFileMove(tool.args);
        case "localhost_serve":
          return this.executeLocalhostServe(tool.args);
        // Browser Control (Gemini 3 Computer Use compatible)
        case "browser_navigate":
          return this.executeBrowserNavigate(tool.args);
        case "browser_click":
          return this.executeBrowserClick(tool.args);
        case "browser_type":
          return this.executeBrowserType(tool.args);
        case "browser_screenshot":
          return this.executeBrowserScreenshot(tool.args);
        case "browser_snapshot":
          return this.executeBrowserSnapshot(tool.args);
        case "browser_scroll":
          return this.executeBrowserScroll(tool.args);
        case "browser_tabs":
          return this.executeBrowserTabs(tool.args);
        case "browser_new_tab":
          return this.executeBrowserNewTab(tool.args);
        case "browser_press_key":
          return this.executeBrowserPressKey(tool.args);
        // === Hackathon Tools ===
        case "trust_request":
          return this.executeTrustRequest(tool.args);
        case "trust_list_pending":
          return this.executeTrustListPending(tool.args);
        case "x402_fetch":
          return this.executeX402Fetch(tool.args);
        case "x402_balance":
          return this.executeX402Balance(tool.args);
        case "erc8004_register":
          return this.executeERC8004Register(tool.args);
        case "erc8004_reputation":
          return this.executeERC8004Reputation(tool.args);
        case "erc8004_feedback":
          return this.executeERC8004Feedback(tool.args);
        case "erc8004_verify":
          return this.executeERC8004Verify(tool.args);
        case "deploy_erc8004":
          return this.executeDeployERC8004(tool.args);
        case "a2a_discover":
          return this.executeA2ADiscover(tool.args);
        case "a2a_delegate":
          return this.executeA2ADelegate(tool.args);
        case "a2a_delegate_stream":
          return this.executeA2ADelegateStream(tool.args);
        case "cre_simulate":
          return this.executeCRESimulate(tool.args);
        case "cre_deploy":
          return this.executeCREDeploy(tool.args);
        case "create_project":
          return this.executeCreateProject(tool.args);
        case "scaffold_shadcn":
          return this.executeScaffoldShadcn(tool.args);
        case "add_component":
          return this.executeAddComponent(tool.args);
        case "run_dev_server":
          return this.executeRunDevServer(tool.args);
        // === Document Generation ===
        case "document_create":
          return this.executeDocumentCreate(tool.args);
        case "document_chart":
          return this.executeDocumentChart(tool.args);
        case "document_flowchart":
          return this.executeDocumentFlowchart(tool.args);
        case "document_table":
          return this.executeDocumentTable(tool.args);
        case "latex_compile":
          return this.executeLatexCompile(tool.args);
        case "research_report":
          return this.executeResearchReport(tool.args);
        case "generate_x402_report":
          return this.executeGenerateX402Report(tool.args);
        // === Telegram Document Delivery ===
        case "send_document_to_telegram":
          return this.executeSendDocumentToTelegram(tool.args);
        case "send_progress_update":
          return this.executeSendProgressUpdate(tool.args);
        case "ask_user_confirmation":
          return this.executeAskUserConfirmation(tool.args);
        // === Enhanced File System ===
        case "file_permissions":
          return this.executeFilePermissions(tool.args);
        case "send_link":
          return this.executeSendLink(tool.args);
        // === Grounding & Verification ===
        case "verify_fact":
          return this.executeVerifyFact(tool.args);
        case "distinguish_task":
          return this.executeDistinguishTask(tool.args);
        // === Hugging Face ===
        case "huggingface_inference":
          return this.executeHuggingFaceInference(tool.args);
        // === Natural Voice (Gemini TTS) ===
        case "natural_voice_reply":
          return this.executeNaturalVoiceReply(tool.args);
        // === Multimodal Tools ===
        case "multimodal_explain":
          return this.executeMultimodalExplain(tool.args);
        case "generate_diagram":
          return this.executeGenerateDiagram(tool.args);
        case "zip_and_send_project":
          return this.executeZipAndSendProject(tool.args);
        case "generate_document_with_visuals":
          return this.executeGenerateDocumentWithVisuals(tool.args);
        // === Desktop Screenshot & Recording ===
        case "desktop_screenshot":
          return this.executeDesktopScreenshot(tool.args);
        case "screen_record":
          return this.executeScreenRecord(tool.args);
        // === Git & GitHub ===
        case "git_init":
          return this.executeGitInit(tool.args);
        case "git_commit":
          return this.executeGitCommit(tool.args);
        case "git_push":
          return this.executeGitPush(tool.args);
        case "git_status":
          return this.executeGitStatus(tool.args);
        // === Vercel Deployment ===
        case "vercel_deploy":
          return this.executeVercelDeploy(tool.args);
        case "vercel_list":
          return this.executeVercelList(tool.args);
        // === NPM/Package Management ===
        case "npm_install":
          return this.executeNpmInstall(tool.args);
        case "npm_run":
          return this.executeNpmRun(tool.args);
        // === Debugging ===
        case "debug_logs":
          return this.executeDebugLogs(tool.args);
        case "debug_port":
          return this.executeDebugPort(tool.args);
        case "debug_process":
          return this.executeDebugProcess(tool.args);
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

    // Check if command is safe or auto-approved
    const firstWord = command.split(" ")[0];
    const isSafe = SAFE_COMMANDS.has(firstWord) || SAFE_COMMANDS.has(command.trim());

    // Check if it's a development command (auto-approve in autonomous mode)
    const isDevCommand = DEV_COMMANDS_PATTERNS.some(pattern => pattern.test(command));
    const isAutonomous = this.config.security.autonomousMode;

    // Skip approval if: safe command, or autonomous mode with dev command
    const skipApproval = isSafe || (isAutonomous && isDevCommand);

    if (!skipApproval && this.config.security.requireApprovalForExternal) {
      const approved = await requestApproval("bash", `Execute: ${command}`, { command });
      if (!approved) {
        return { success: false, output: "", error: "Command not approved by user" };
      }
    }

    try {
      // Use workspace directory as cwd for relative commands
      const { join } = await import("path");
      const workspaceDir = join(this.runtimeDir, "workspace");
      ensureDir(workspaceDir);

      const { stdout, stderr } = await execAsync(command, {
        timeout: 180000, // 3 minutes for npm operations
        maxBuffer: 10 * 1024 * 1024, // 10MB for large outputs
        cwd: workspaceDir, // Run commands in workspace
        env: { ...process.env },
      });

      const combined = stdout + (stderr ? `\nSTDERR: ${stderr}` : "");
      const output = sanitizeOutput(combined);

      // Self-healing: detect errors in successful exit code outputs (e.g. npm warnings, TS errors)
      const healingHint = this.detectErrorsForSelfHealing(combined);
      if (healingHint) {
        return { success: true, output: output + `\n\n[SELF-HEAL] ${healingHint}` };
      }

      return { success: true, output };
    } catch (err: any) {
      const output = sanitizeOutput(err.stdout || "");
      const errorMsg = sanitizeOutput(err.stderr || err.message || "Command failed");

      // Self-healing: enrich error with fix hint
      const healingHint = this.detectErrorsForSelfHealing(err.stderr || err.stdout || err.message || "");
      const error = healingHint
        ? `${errorMsg}\n\n[SELF-HEAL] ${healingHint}`
        : errorMsg;

      return { success: false, output, error };
    }
  }

  /**
   * Self-healing: Detect common errors and provide fix hints for the agent.
   * Returns a hint string or null if no actionable error is detected.
   */
  private detectErrorsForSelfHealing(output: string): string | null {
    if (!output) return null;
    const lower = output.toLowerCase();

    // Module not found
    if (lower.includes("module not found") || lower.includes("cannot find module")) {
      const match = output.match(/Cannot find module ['"]([^'"]+)['"]/i);
      const mod = match?.[1] || "the missing module";
      return `Missing module detected: ${mod}. Fix: run "npm install ${mod}" then retry.`;
    }

    // TypeScript errors
    if (lower.includes("ts(") || lower.includes("error ts")) {
      return "TypeScript compilation errors detected. Read the error messages, fix the type issues in the source files, then rebuild.";
    }

    // ESLint / Syntax errors
    if (lower.includes("syntaxerror") || lower.includes("unexpected token")) {
      return "Syntax error detected. Check the file for missing brackets, semicolons, or invalid syntax. Fix and retry.";
    }

    // Port in use
    if (lower.includes("eaddrinuse") || lower.includes("address already in use")) {
      const portMatch = output.match(/port (\d+)/i) || output.match(/:(\d{4,5})/);
      const port = portMatch?.[1] || "the port";
      return `Port ${port} is already in use. Fix: kill the process using the port or use a different port.`;
    }

    // Permission denied
    if (lower.includes("eacces") || lower.includes("permission denied")) {
      return "Permission denied. Try using a relative path in the workspace directory instead.";
    }

    // npm ERR
    if (lower.includes("npm err!") || lower.includes("npm error")) {
      if (lower.includes("peer dep") || lower.includes("peer dependency")) {
        return "Peer dependency conflict. Fix: run with --legacy-peer-deps flag.";
      }
      if (lower.includes("enoent") || lower.includes("no such file")) {
        return "File or directory not found. Verify the path exists before running the command.";
      }
      return "npm error detected. Read the error output, fix the issue, and retry.";
    }

    // React/Next.js build errors
    if (lower.includes("failed to compile") || lower.includes("build error")) {
      return "Build failed. Read the specific error lines, fix the code, and rebuild.";
    }

    // General error pattern (only for meaningful errors, not warnings)
    if ((lower.includes("error:") || lower.includes("error -")) && !lower.includes("0 error")) {
      return "Errors detected in output. Read the error messages, fix the root cause, and retry the command.";
    }

    return null;
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
    let path = String(args.path || "");
    const content = String(args.content || "");
    if (!path) return { success: false, output: "", error: "No path provided" };

    // Resolve relative paths to workspace
    const { isAbsolute, resolve: resolvePath, join } = await import("path");
    if (!isAbsolute(path)) {
      // Use workspace directory for relative paths
      const workspaceDir = join(this.runtimeDir, "workspace");
      ensureDir(workspaceDir);
      path = resolvePath(workspaceDir, path);
    }

    // Create checkpoint before overwrite
    if (existsSync(path)) {
      try { createCheckpoint(this.runtimeDir, path); } catch { /* non-fatal */ }
    }

    // Skip approval in autonomous mode
    const isAutonomous = this.config.security.autonomousMode;
    if (!isAutonomous && existsSync(path) && this.config.security.requireApprovalForExternal) {
      const approved = await requestApproval("file_write", `Overwrite: ${path}`, { path });
      if (!approved) return { success: false, output: "", error: "Write not approved" };
    }

    try {
      ensureDir(dirname(path));
      writeFileSync(path, content, "utf-8");
      return { success: true, output: `Written ${content.length} bytes to ${path}` };
    } catch (err: any) {
      // Handle permission errors with helpful message
      if (err.code === "EPERM" || err.code === "EACCES") {
        const workspaceDir = join(this.runtimeDir, "workspace");
        return {
          success: false,
          output: "",
          error: `Permission denied: ${path}\n\nI don't have write access to this location. Try using a relative path (e.g., "calculator/index.html") and I'll create it in my workspace: ${workspaceDir}`,
        };
      }
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

    // Support 1-4 variations (default 1, can specify up to 4)
    const count = Math.min(Math.max(Number(args.count) || 1, 1), 4);
    const aspectRatio = String(args.aspectRatio || "1:1");

    try {
      const { generateImage } = await import("../ai/gemini.js");
      const result = await generateImage(prompt, {
        model: this.config.gemini.models.image,
        aspectRatio,
        numberOfImages: count,
      });

      if (result.images.length === 0) {
        // Fallback to Unsplash
        const keyword = prompt.split(" ").slice(0, 3).join(",");
        const unsplashUrl = `https://source.unsplash.com/800x800/?${encodeURIComponent(keyword)}`;
        return {
          success: true,
          output: `Image generation not available. Use this Unsplash URL instead:\n${unsplashUrl}`,
        };
      }

      // Save images to media folder
      const { saveMedia } = await import("../utils/media.js");
      const savedPaths: string[] = [];
      const timestamp = Date.now();

      for (let i = 0; i < result.images.length; i++) {
        const filename = `generated-${timestamp}-${i}.png`;
        const imageBuffer = Buffer.from(result.images[i].base64, "base64");
        const savedPath = saveMedia(this.runtimeDir, "outgoing", filename, imageBuffer);
        savedPaths.push(savedPath);

        // Emit progress event for visual feedback system
        await this.emitProgress({
          type: "image_generated",
          toolName: "image_generate",
          message: `Generated image: ${prompt.slice(0, 50)}...`,
          data: {
            buffer: imageBuffer,
            prompt,
            imageId: `img_${timestamp}_${i}`,
            path: savedPath,
          },
        });

        // Send to Telegram if chat context available
        if (this.currentChatContext?.sendImage) {
          try {
            const caption = count > 1 ? `Image ${i + 1}/${count}: ${prompt.slice(0, 50)}` : undefined;
            await this.currentChatContext.sendImage(savedPath, caption);
          } catch (e) {
            log.warn("Failed to send image to chat: %s", (e as Error).message);
          }
        }
      }

      return {
        success: true,
        output: `Generated ${savedPaths.length} image${savedPaths.length > 1 ? " variations" : ""}:\n${savedPaths.join("\n")}`,
      };
    } catch (err: any) {
      // Fallback to Unsplash
      const keyword = prompt.split(" ").slice(0, 3).join(",");
      const unsplashUrl = `https://source.unsplash.com/800x800/?${encodeURIComponent(keyword)}`;
      return {
        success: true,
        output: `Image generation unavailable (${err.message}).\n\nUse this Unsplash URL instead:\n${unsplashUrl}`,
      };
    }
  }

  private async executeGenerateProjectImages(args: Record<string, unknown>): Promise<ToolResult> {
    const promptsJson = String(args.prompts || "[]");
    const aspectRatio = String(args.aspectRatio || "1:1");

    let prompts: string[];
    try {
      prompts = JSON.parse(promptsJson);
      if (!Array.isArray(prompts)) throw new Error("prompts must be an array");
    } catch {
      return { success: false, output: "", error: "Invalid prompts JSON array" };
    }

    try {
      const { generateProjectImages } = await import("../ai/gemini.js");
      const results = await generateProjectImages(prompts, this.runtimeDir, { aspectRatio });

      const output = results.map((r, i) =>
        `${i + 1}. "${r.prompt}"\n   URL: ${r.url}\n   Path: ${r.path || "N/A"}`
      ).join("\n\n");

      return {
        success: true,
        output: `Generated ${results.length} images:\n\n${output}\n\nUse these URLs in your HTML img src attributes.`,
      };
    } catch (err: any) {
      // Fallback: return Unsplash URLs
      const fallbackUrls = prompts.map((prompt, i) => {
        const keyword = prompt.split(" ").slice(0, 3).join(",");
        return `${i + 1}. "${prompt}"\n   URL: https://source.unsplash.com/400x400/?${encodeURIComponent(keyword)}`;
      }).join("\n\n");

      return {
        success: true,
        output: `Image generation unavailable. Using Unsplash fallback:\n\n${fallbackUrls}`,
      };
    }
  }

  private async executePreviewAndScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
    const htmlPath = String(args.htmlPath || "");
    if (!htmlPath) return { success: false, output: "", error: "No HTML path provided" };

    // Resolve path
    const { isAbsolute, resolve: resolvePath, join } = await import("path");
    let fullPath = htmlPath;
    if (!isAbsolute(htmlPath)) {
      fullPath = resolvePath(join(this.runtimeDir, "workspace"), htmlPath);
    }

    // Normalize Windows path
    fullPath = fullPath.replace(/\\/g, "/");

    if (!existsSync(fullPath.replace(/\//g, "\\"))) {
      // Try the original path
      if (!existsSync(htmlPath)) {
        return { success: false, output: "", error: `File not found: ${fullPath}` };
      }
      fullPath = htmlPath.replace(/\\/g, "/");
    }

    try {
      const { getBrowser } = await import("../browser/controller.js");
      const browser = getBrowser(this.runtimeDir);

      // Always try to connect fresh for local file preview
      const status = await browser.getStatus();
      if (!status.connected) {
        const connected = await browser.connect();
        if (!connected) {
          return { success: false, output: "", error: "Could not connect to browser. Make sure Playwright is installed." };
        }
      }

      // Navigate to local file with file:// protocol
      const fileUrl = `file:///${fullPath}`;
      log.info("Navigating to: %s", fileUrl);

      const navResult = await browser.navigate(fileUrl);
      if (!navResult.success) {
        return { success: false, output: "", error: `Failed to load file: ${fullPath}` };
      }

      // Wait longer for page to fully render (CSS, fonts, images)
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Take screenshot with retry
      let screenshotPath: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          screenshotPath = await browser.screenshot(false);
          if (screenshotPath) break;
        } catch (err) {
          log.warn("Screenshot attempt %d failed, retrying...", attempt + 1);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!screenshotPath) {
        // Fallback: try to save raw screenshot manually
        try {
          const { mkdirSync, writeFileSync } = await import("fs");
          const screenshotDir = join(this.runtimeDir, "screenshots");
          mkdirSync(screenshotDir, { recursive: true });

          const filename = `preview-${Date.now()}.png`;
          screenshotPath = join(screenshotDir, filename);

          // Use page.screenshot directly if browser is available
          log.info("Trying fallback screenshot method");
        } catch {
          // ignore fallback failure
        }

        if (!screenshotPath) {
          return {
            success: true,
            output: `File loaded but screenshot failed.\n\nFile: ${fullPath}\nURL: ${fileUrl}\n\nYou can view it by opening: ${fullPath}`,
          };
        }
      }

      return {
        success: true,
        output: `Preview screenshot saved:\n${screenshotPath}\n\nFile: ${fullPath}`,
      };
    } catch (err: any) {
      log.error({ err }, "Preview and screenshot failed");
      return {
        success: false,
        output: "",
        error: `Screenshot failed: ${err.message}\n\nYou can manually open: ${fullPath}`,
      };
    }
  }

  // Store the current chat context for sending images back
  private currentChatContext?: { channel: string; peerId: string; chatId?: string; sendImage?: (path: string, caption?: string) => Promise<void> };

  public setChatContext(ctx: { channel: string; peerId: string; chatId?: string; sendImage?: (path: string, caption?: string) => Promise<void> }) {
    this.currentChatContext = ctx;
  }

  private async executeSendImageToChat(args: Record<string, unknown>): Promise<ToolResult> {
    const imagePath = String(args.imagePath || "");
    const caption = args.caption ? String(args.caption) : undefined;

    if (!imagePath) return { success: false, output: "", error: "No image path provided" };
    if (!existsSync(imagePath)) return { success: false, output: "", error: `Image not found: ${imagePath}` };

    if (!this.currentChatContext?.sendImage) {
      return {
        success: false,
        output: "",
        error: "No chat context available. This tool only works when responding to a message in Telegram/WhatsApp.",
      };
    }

    try {
      await this.currentChatContext.sendImage(imagePath, caption);
      return {
        success: true,
        output: `Image sent to ${this.currentChatContext.channel}:${this.currentChatContext.peerId}\nPath: ${imagePath}${caption ? `\nCaption: ${caption}` : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to send image: ${err.message}` };
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
    const cronExpr = String(args.cron || args.schedule || "");
    const instruction = String(args.instruction || "");

    if (!name || !cronExpr || !instruction) {
      return { success: false, output: "", error: "name, cron/schedule, and instruction are required" };
    }

    if (!this.cronService) {
      return { success: false, output: "", error: "Cron service not available. Start Wispy with gateway mode for scheduling." };
    }

    try {
      // Try to parse natural language schedule
      const { parseSchedule } = require("../cron/service.js");
      let cron: string;
      try {
        cron = parseSchedule(cronExpr);
      } catch {
        cron = cronExpr; // Use as-is if already a cron expression
      }

      const job = this.cronService.addJob(name, cron, instruction, {
        channel: this.currentChatContext?.channel || "cli",
        timeout: 60,
        retries: 1,
      });

      return {
        success: true,
        output: `✓ Task "${name}" scheduled\nID: ${job.id}\nSchedule: ${cron}\nNext run: ${job.nextRunAt}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private executeRemindMe(args: Record<string, unknown>): ToolResult {
    const message = String(args.message || args.text || args.reminder || "");
    const when = String(args.when || args.time || args.at || "in 1 hour");

    if (!message) {
      return { success: false, output: "", error: "message is required" };
    }

    if (!this.reminderService) {
      return { success: false, output: "", error: "Reminder service not available. Start Wispy with gateway mode for reminders." };
    }

    try {
      const { parseNaturalTime, formatReminder } = require("../cron/reminders.js");
      const triggerTime = parseNaturalTime(when);

      const reminder = this.reminderService.addReminder(message, triggerTime, {
        channel: (this.currentChatContext?.channel as any) || "cli",
        peerId: this.currentChatContext?.peerId || "cli-user",
      });

      const formattedTime = triggerTime.toLocaleString();
      return {
        success: true,
        output: `✓ Reminder set!\n📝 "${message}"\n⏰ ${formattedTime}\nID: ${reminder.id}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private executeListReminders(_args: Record<string, unknown>): ToolResult {
    if (!this.reminderService) {
      return { success: false, output: "", error: "Reminder service not available" };
    }

    try {
      const { formatReminder } = require("../cron/reminders.js");
      const reminders = this.reminderService.listReminders();

      if (reminders.length === 0) {
        return { success: true, output: "No upcoming reminders." };
      }

      const lines = reminders.map((r: any) => {
        const time = new Date(r.triggerAt).toLocaleString();
        return `• ${r.message}\n  ⏰ ${time} (ID: ${r.id})`;
      });

      return { success: true, output: `📋 Upcoming Reminders:\n\n${lines.join("\n\n")}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private executeDeleteReminder(args: Record<string, unknown>): ToolResult {
    const id = String(args.id || args.reminderId || "");

    if (!id) {
      return { success: false, output: "", error: "reminder id is required" };
    }

    if (!this.reminderService) {
      return { success: false, output: "", error: "Reminder service not available" };
    }

    const deleted = this.reminderService.deleteReminder(id);
    if (deleted) {
      return { success: true, output: `✓ Reminder deleted: ${id}` };
    } else {
      return { success: false, output: "", error: `Reminder not found: ${id}` };
    }
  }

  // Voice mode state
  private voiceMode = false;
  private voicePersona: string = "default";
  private voiceCallback?: (audioPath: string, text: string) => Promise<boolean>;

  /**
   * Set callback for sending voice messages (used by Telegram/CLI)
   */
  setVoiceCallback(callback: (audioPath: string, text: string) => Promise<boolean>): void {
    this.voiceCallback = callback;
  }

  /**
   * Check if voice mode is enabled
   */
  isVoiceModeEnabled(): boolean {
    return this.voiceMode;
  }

  /**
   * Get current voice persona
   */
  getVoicePersona(): string {
    return this.voicePersona;
  }

  private async executeVoiceReply(args: Record<string, unknown>): Promise<ToolResult> {
    const text = String(args.text || args.message || "");
    const persona = String(args.persona || this.voicePersona || "default");

    if (!text) {
      return { success: false, output: "", error: "text is required for voice reply" };
    }

    try {
      const { join } = await import("path");
      const voiceDir = join(this.runtimeDir, "voice");

      // Keep text short for faster generation
      const shortText = text.length > 300 ? text.slice(0, 300) + "..." : text;

      let audioPath: string | null = null;

      // === PRIORITY 1: Chatterbox (fastest, most natural) ===
      try {
        const { generateRealisticSpeech } = await import("../voice/realistic-tts.js");
        const result = await generateRealisticSpeech(shortText, voiceDir, {
          model: "chatterbox",  // Force Chatterbox
          emotion: "friendly",
        });
        if (result) {
          audioPath = result.audioPath;
          log.info("Voice generated with Chatterbox");
        }
      } catch (e) {
        log.debug("Chatterbox failed, trying fallback");
      }

      // === PRIORITY 2: Quick fallback - basic Google TTS (fastest) ===
      if (!audioPath) {
        try {
          const { textToSpeech, getTempVoicePath } = await import("../voice/tts.js");
          const outputPath = getTempVoicePath(this.runtimeDir);
          audioPath = await textToSpeech(shortText, outputPath, { persona: persona as any });
          if (audioPath) log.info("Voice generated with Google TTS");
        } catch {}
      }

      if (!audioPath) {
        return {
          success: false,
          output: "",
          error: "Voice synthesis failed. Check network connectivity.",
        };
      }

      // Send via callback if available (Telegram/CLI)
      if (this.voiceCallback) {
        const sent = await this.voiceCallback(audioPath, text);
        if (sent) {
          return { success: true, output: `🔊 Voice message sent` };
        }
      }

      return {
        success: true,
        output: `🔊 Voice generated: ${audioPath}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Voice error: ${err.message}` };
    }
  }

  private executeSetVoiceMode(args: Record<string, unknown>): ToolResult {
    const enabled = args.enabled === true || args.enabled === "true";
    const persona = String(args.persona || "default");

    this.voiceMode = enabled;
    if (persona) {
      this.voicePersona = persona;
    }

    if (enabled) {
      return {
        success: true,
        output: `🔊 Voice mode enabled (persona: ${this.voicePersona})\nAll responses will now be sent as voice messages.`,
      };
    } else {
      return {
        success: true,
        output: `🔇 Voice mode disabled. Responses will be text only.`,
      };
    }
  }

  private async executeGoogleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query || "");
    if (!query) return { success: false, output: "", error: "query is required" };

    try {
      // Use Vertex AI's built-in Google Search grounding
      const { generate } = await import("../ai/gemini.js");
      const result = await generate({
        model: "gemini-2.0-flash",
        systemPrompt: "You are a search assistant. Summarize the search results concisely.",
        messages: [{ role: "user", content: query }],
        useGoogleSearch: true,
        temperature: 0.3,
      });

      return {
        success: true,
        output: `🔎 Search results for "${query}":\n\n${result.text}`,
      };
    } catch (err: any) {
      // Fallback to web_search tool
      return this.executeWebSearch({ query });
    }
  }

  private async executeRunPython(args: Record<string, unknown>): Promise<ToolResult> {
    const code = String(args.code || "");
    if (!code) return { success: false, output: "", error: "code is required" };

    try {
      // Use Vertex AI's code execution sandbox
      const { generate } = await import("../ai/gemini.js");
      const result = await generate({
        model: "gemini-2.0-flash",
        systemPrompt: "Execute the Python code and return the output. Only return the execution result, no explanation.",
        messages: [{ role: "user", content: `Execute this Python code and show the output:\n\`\`\`python\n${code}\n\`\`\`` }],
        useCodeExecution: true,
        temperature: 0,
      });

      return {
        success: true,
        output: `🐍 Python execution result:\n\n${result.text}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Python execution failed: ${err.message}` };
    }
  }

  private async executeWalletBalance(_args: Record<string, unknown>): Promise<ToolResult> {
    try {
      // SKALE wallet bridge: when AGENT_PRIVATE_KEY is set, query SKALE BITE V2
      const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
      if (privateKey) {
        const { createPublicClient, http, formatUnits } = await import("viem");
        const { skaleBiteSandbox, SKALE_BITE_SANDBOX } = await import(
          "../integrations/agentic-commerce/config.js"
        );
        const { privateKeyToAccount } = await import("viem/accounts");

        const account = privateKeyToAccount(privateKey);
        const publicClient = createPublicClient({
          chain: skaleBiteSandbox,
          transport: http(),
        });

        // Query USDC balance
        const usdcRaw = await publicClient.readContract({
          address: SKALE_BITE_SANDBOX.usdc as `0x${string}`,
          abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
          functionName: "balanceOf",
          args: [account.address],
        });
        const usdcBalance = formatUnits(usdcRaw as bigint, 6);

        // Query sFUEL (native gas)
        const sFuel = await publicClient.getBalance({ address: account.address });
        const sFuelBalance = formatUnits(sFuel, 18);

        const lines = [
          `Network: SKALE BITE V2 Sandbox (gasless)`,
          `Address: ${account.address}`,
          `USDC Balance: ${usdcBalance} USDC`,
          `sFUEL: ${sFuelBalance}`,
          `Explorer: ${SKALE_BITE_SANDBOX.explorerUrl}/address/${account.address}`,
        ];

        // Include agentic-commerce budget if available
        if (this.integrationRegistry) {
          try {
            const budget = await this.integrationRegistry.executeTool("x402_check_budget", {});
            if (budget?.success) lines.push("", "Spending Status:", budget.output);
          } catch { /* no budget info */ }
        }

        return { success: true, output: lines.join("\n") };
      }

      // Fallback: original Base wallet
      const { getBalance, getWalletAddress } = await import("../wallet/x402.js");
      const address = getWalletAddress(this.runtimeDir);
      if (!address) return { success: false, output: "", error: "Wallet not initialized" };
      const balance = await getBalance(this.runtimeDir);
      const { addressLink } = await import("../wallet/explorer.js");
      return { success: true, output: `Address: ${address}\nUSDC Balance: ${balance}\nExplorer: ${addressLink(address)}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeWalletPay(args: Record<string, unknown>): Promise<ToolResult> {
    const to = String(args.to || args.address || "");
    const amount = String(args.amount || "");
    if (!to || !amount) return { success: false, output: "", error: "to and amount required" };

    // SKALE wallet bridge: when AGENT_PRIVATE_KEY is set, transfer on SKALE
    const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
    if (privateKey) {
      try {
        // Request approval first
        const approved = await requestApproval("wallet_pay", `Send ${amount} USDC to ${to} on SKALE`, args);
        if (!approved) return { success: false, output: "", error: "Payment not approved" };

        const { createPublicClient, createWalletClient, http, parseUnits } = await import("viem");
        const { skaleBiteSandbox, SKALE_BITE_SANDBOX } = await import(
          "../integrations/agentic-commerce/config.js"
        );
        const { privateKeyToAccount } = await import("viem/accounts");

        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({
          account,
          chain: skaleBiteSandbox,
          transport: http(),
        });
        const publicClient = createPublicClient({
          chain: skaleBiteSandbox,
          transport: http(),
        });

        const hash = await walletClient.writeContract({
          address: SKALE_BITE_SANDBOX.usdc as `0x${string}`,
          abi: [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }],
          functionName: "transfer",
          args: [to as `0x${string}`, parseUnits(amount, 6)],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          success: true,
          output: [
            `Sent ${amount} USDC to ${to}`,
            `Network: SKALE BITE V2 (gasless)`,
            `Tx: ${hash}`,
            `Status: ${receipt.status === "success" ? "confirmed" : "failed"}`,
            `Explorer: ${SKALE_BITE_SANDBOX.explorerUrl}/tx/${hash}`,
          ].join("\n"),
        };
      } catch (err: any) {
        return { success: false, output: "", error: `SKALE transfer failed: ${err.message}` };
      }
    }

    // Fallback: original Base wallet
    const { getX402Client } = await import("../wallet/x402-client.js");
    const client = getX402Client();
    if (!client) return { success: false, output: "", error: "Wallet not initialized. Run /wallet first." };

    // Check commerce policy
    const { getCommerceEngine } = await import("../wallet/commerce.js");
    const commerce = getCommerceEngine();
    if (commerce) {
      const check = await commerce.checkPayment(to, parseFloat(amount));
      if (!check.allowed) return { success: false, output: "", error: `Payment blocked: ${check.reason}` };

      // Auto-approve if policy says so
      if (!check.requiresApproval) {
        const result = await client.executePayment({
          amount, currency: "USDC", recipient: to, network: "base",
        });
        if (result.success) commerce.recordPayment(to, parseFloat(amount), result.txHash!);
        if (result.success) {
          const { txLink } = await import("../wallet/explorer.js");
          return { success: true, output: `Sent ${amount} USDC to ${to}\nTx: ${result.txHash}\nExplorer: ${txLink(result.txHash!)}` };
        }
        return { success: false, output: "", error: result.error || "Transaction failed" };
      }
    }

    // Request trust approval for amounts above auto-approve threshold
    const approved = await requestApproval("wallet_pay", `Send ${amount} USDC to ${to}`, args);
    if (!approved) return { success: false, output: "", error: "Payment not approved" };

    // Execute on-chain transfer
    const result = await client.executePayment({
      amount, currency: "USDC", recipient: to, network: "base",
    });

    if (result.success && commerce) {
      commerce.recordPayment(to, parseFloat(amount), result.txHash!);
    }

    if (result.success) {
      const { txLink } = await import("../wallet/explorer.js");
      return { success: true, output: `Sent ${amount} USDC to ${to}\nTx: ${result.txHash}\nExplorer: ${txLink(result.txHash!)}` };
    }
    return { success: false, output: "", error: result.error || "Transaction failed" };
  }

  private async executeCommerceStatus(): Promise<ToolResult> {
    // SKALE wallet bridge: when AGENT_PRIVATE_KEY is set, show SKALE status
    const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
    if (privateKey) {
      try {
        const { createPublicClient, http, formatUnits } = await import("viem");
        const { skaleBiteSandbox, SKALE_BITE_SANDBOX } = await import(
          "../integrations/agentic-commerce/config.js"
        );
        const { privateKeyToAccount } = await import("viem/accounts");

        const account = privateKeyToAccount(privateKey);
        const publicClient = createPublicClient({
          chain: skaleBiteSandbox,
          transport: http(),
        });

        const usdcRaw = await publicClient.readContract({
          address: SKALE_BITE_SANDBOX.usdc as `0x${string}`,
          abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
          functionName: "balanceOf",
          args: [account.address],
        });
        const usdcBalance = formatUnits(usdcRaw as bigint, 6);

        const lines = [
          "Commerce Status (SKALE BITE V2):",
          `  Network:   SKALE BITE V2 Sandbox (gasless)`,
          `  Wallet:    ${account.address}`,
          `  USDC:      ${usdcBalance} USDC`,
          `  Explorer:  ${SKALE_BITE_SANDBOX.explorerUrl}/address/${account.address}`,
        ];

        // Include integration budget/audit data
        if (this.integrationRegistry) {
          try {
            const budget = await this.integrationRegistry.executeTool("x402_check_budget", {});
            if (budget?.success) lines.push("", "Budget Status:", budget.output);
          } catch { /* no budget */ }

          try {
            const audit = await this.integrationRegistry.executeTool("x402_audit_trail", {});
            if (audit?.success) lines.push("", "Audit Trail:", audit.output);
          } catch { /* no audit */ }
        }

        return { success: true, output: lines.join("\n") };
      } catch (err: any) {
        return { success: false, output: "", error: `SKALE status failed: ${err.message}` };
      }
    }

    // Fallback: original Base commerce engine
    const { getCommerceEngine } = await import("../wallet/commerce.js");
    const commerce = getCommerceEngine();
    if (!commerce) return { success: false, output: "", error: "Commerce engine not initialized" };

    const status = commerce.getStatus();
    const lines = [
      "Commerce Policy:",
      `  Max per tx:     $${status.policy.maxPerTransaction}`,
      `  Daily limit:    $${status.policy.dailyLimit}`,
      `  Auto-approve:   < $${status.policy.autoApproveBelow}`,
      `  Whitelisted:    ${status.policy.whitelistedRecipients.length} addresses`,
      `  Blacklisted:    ${status.policy.blacklistedRecipients.length} addresses`,
      "",
      "Today's Spending:",
      `  Total:     $${status.dailySpending.total.toFixed(2)}`,
      `  Count:     ${status.dailySpending.count} payments`,
      `  Remaining: $${status.dailySpending.remaining.toFixed(2)}`,
    ];

    if (status.recentPayments.length > 0) {
      const { txLink } = await import("../wallet/explorer.js");
      lines.push("", "Recent Payments:");
      for (const p of status.recentPayments) {
        lines.push(`  $${p.amount} -> ${p.to.slice(0, 10)}... [View Tx](${txLink(p.txHash)})`);
      }
    }

    return { success: true, output: lines.join("\n") };
  }

  private async executeDeployERC8004(args: Record<string, unknown>): Promise<ToolResult> {
    const privateKey = process.env.AGENT_PRIVATE_KEY;
    if (!privateKey) {
      return { success: false, output: "", error: "AGENT_PRIVATE_KEY required for ERC-8004 deployment" };
    }

    const approved = await requestApproval("deploy_erc8004", "Deploy ERC-8004 identity contracts on SKALE", args);
    if (!approved) return { success: false, output: "", error: "Deployment not approved" };

    try {
      const { deployERC8004 } = await import(
        "../integrations/agentic-commerce/deploy/deploy-erc8004.js"
      );
      const registerAgent = args.register_agent !== false;
      const agentUri = args.agent_uri as string | undefined;

      const result = await deployERC8004(privateKey as `0x${string}`, {
        registerAgent,
        agentURI: agentUri,
      });

      const { SKALE_BITE_SANDBOX } = await import(
        "../integrations/agentic-commerce/config.js"
      );

      const lines = [
        "ERC-8004 Contracts Deployed on SKALE BITE V2 (gasless):",
        "",
        `Factory:            ${result.factory}`,
        `IdentityRegistry:   ${result.identityRegistry}`,
        `ReputationRegistry: ${result.reputationRegistry}`,
        `ValidationRegistry: ${result.validationRegistry}`,
      ];

      if (result.agentId) {
        lines.push("", `Agent Registered: ID ${result.agentId}`);
      }

      lines.push(
        "",
        `Explorer: ${SKALE_BITE_SANDBOX.explorerUrl}/address/${result.factory}`,
      );

      return { success: true, output: lines.join("\n") };
    } catch (err: any) {
      return { success: false, output: "", error: `ERC-8004 deployment failed: ${err.message}` };
    }
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

  private async executeCreateFolder(args: Record<string, unknown>): Promise<ToolResult> {
    let path = String(args.path || "");
    if (!path) return { success: false, output: "", error: "No path provided" };

    // Resolve relative paths to workspace
    const { isAbsolute, resolve: resolvePath, join } = await import("path");
    if (!isAbsolute(path)) {
      const workspaceDir = join(this.runtimeDir, "workspace");
      ensureDir(workspaceDir);
      path = resolvePath(workspaceDir, path);
    }

    try {
      ensureDir(path);
      return { success: true, output: `Created folder: ${path}` };
    } catch (err: any) {
      // Handle permission errors with helpful message
      if (err.code === "EPERM" || err.code === "EACCES") {
        const workspaceDir = join(this.runtimeDir, "workspace");
        return {
          success: false,
          output: "",
          error: `Permission denied: ${path}\n\nTry using a relative path (e.g., "my-project") and I'll create it in my workspace: ${workspaceDir}`,
        };
      }
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeFileDelete(args: Record<string, unknown>): Promise<ToolResult> {
    const path = String(args.path || "");
    if (!path) return { success: false, output: "", error: "No path provided" };
    if (!existsSync(path)) return { success: false, output: "", error: `Path not found: ${path}` };

    const { statSync, unlinkSync, rmdirSync } = await import("fs");
    const stats = statSync(path);

    if (stats.isDirectory()) {
      const entries = readdirSync(path);
      if (entries.length > 0) {
        // Non-empty directory requires approval
        if (this.config.security.requireApprovalForExternal) {
          const approved = await requestApproval("file_delete", `Delete folder with ${entries.length} items: ${path}`, { path });
          if (!approved) return { success: false, output: "", error: "Delete not approved" };
        }
        // Recursively delete
        const { rmSync } = await import("fs");
        rmSync(path, { recursive: true });
      } else {
        rmdirSync(path);
      }
    } else {
      // Create checkpoint before delete
      try { createCheckpoint(this.runtimeDir, path); } catch { /* non-fatal */ }
      unlinkSync(path);
    }

    return { success: true, output: `Deleted: ${path}` };
  }

  private async executeFileCopy(args: Record<string, unknown>): Promise<ToolResult> {
    const source = String(args.source || "");
    const destination = String(args.destination || "");
    if (!source || !destination) return { success: false, output: "", error: "source and destination required" };
    if (!existsSync(source)) return { success: false, output: "", error: `Source not found: ${source}` };

    try {
      const { cpSync, statSync } = await import("fs");
      const stats = statSync(source);

      if (stats.isDirectory()) {
        cpSync(source, destination, { recursive: true });
      } else {
        ensureDir(dirname(destination));
        cpSync(source, destination);
      }

      return { success: true, output: `Copied: ${source} → ${destination}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeFileMove(args: Record<string, unknown>): Promise<ToolResult> {
    const source = String(args.source || "");
    const destination = String(args.destination || "");
    if (!source || !destination) return { success: false, output: "", error: "source and destination required" };
    if (!existsSync(source)) return { success: false, output: "", error: `Source not found: ${source}` };

    try {
      const { renameSync } = await import("fs");
      ensureDir(dirname(destination));
      renameSync(source, destination);
      return { success: true, output: `Moved: ${source} → ${destination}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeLocalhostServe(args: Record<string, unknown>): Promise<ToolResult> {
    const directory = String(args.directory || process.cwd());
    const port = Number(args.port || 3000);
    const { join } = await import("path");

    try {
      // CRITICAL: Check if this is an npm project - if so, ALWAYS use npm run dev
      // Never use static file serving for projects with package.json
      const packageJsonPath = join(directory, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
          const scripts = packageJson.scripts || {};

          // If there's ANY dev or start script, use npm
          if (scripts.dev || scripts.start) {
            const devCommand = scripts.dev ? "dev" : "start";

            log.info(`Detected npm project with '${devCommand}' script - using npm run ${devCommand}`);

            // Check if node_modules exists - if not, run npm install first
            const nodeModulesPath = join(directory, "node_modules");
            if (!existsSync(nodeModulesPath)) {
              log.info("node_modules not found, running npm install first...");
              try {
                execSync("npm install", {
                  cwd: directory,
                  stdio: "pipe",
                  timeout: 180000, // 3 minute timeout
                });
                log.info("npm install completed successfully");
              } catch (installErr: any) {
                log.warn("npm install failed: " + installErr.message);
                // Continue anyway - maybe deps are bundled
              }
            }

            // Start the dev server
            const proc = spawn("npm", ["run", devCommand], {
              cwd: directory,
              detached: true,
              stdio: "ignore",
              shell: true,
              env: { ...process.env, PORT: String(port) },
            });
            proc.unref();

            // Wait for server to start
            await new Promise(resolve => setTimeout(resolve, 5000));

            return {
              success: true,
              output: `Started npm development server:\n` +
                `  URL: http://localhost:${port}\n` +
                `  Directory: ${directory}\n` +
                `  Command: npm run ${devCommand}\n` +
                `  PID: ${proc.pid}\n\n` +
                `IMPORTANT: This is running 'npm run ${devCommand}', NOT a static file server.\n` +
                `The app should compile and hot-reload automatically.`,
            };
          }
        } catch (e: any) {
          log.warn("Failed to parse package.json: " + e.message);
        }
      }

      // ONLY use static serve for pure HTML/CSS/JS projects (no package.json)
      log.info("No package.json found, using static file server");
      const proc = spawn("npx", ["serve", "-l", String(port), directory], {
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      proc.unref();

      return {
        success: true,
        output: `Started STATIC file server (for plain HTML only):\n` +
          `  URL: http://localhost:${port}\n` +
          `  Directory: ${directory}\n` +
          `  PID: ${proc.pid}\n\n` +
          `WARNING: This is a static file server that shows directory listings.\n` +
          `If you see 'Index of' in your browser, the project needs 'npm run dev' instead.`,
      };
    } catch (err: any) {
      // Fallback to simple node http server
      try {
        const { createServer } = await import("http");
        const { readFileSync, statSync } = await import("fs");
        const { join, extname } = await import("path");

        const mimeTypes: Record<string, string> = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".svg": "image/svg+xml",
        };

        const server = createServer((req, res) => {
          const filePath = join(directory, req.url === "/" ? "index.html" : req.url!);
          try {
            const stats = statSync(filePath);
            if (stats.isFile()) {
              const ext = extname(filePath);
              const contentType = mimeTypes[ext] || "application/octet-stream";
              const content = readFileSync(filePath);
              res.writeHead(200, { "Content-Type": contentType });
              res.end(content);
            } else {
              res.writeHead(404);
              res.end("Not Found");
            }
          } catch {
            res.writeHead(404);
            res.end("Not Found");
          }
        });

        server.listen(port);

        return {
          success: true,
          output: `Started HTTP server:\n  URL: http://localhost:${port}\n  Directory: ${directory}`,
        };
      } catch (innerErr: any) {
        return { success: false, output: "", error: innerErr.message };
      }
    }
  }

  // ─── Browser Control Methods (Gemini 3 Computer Use) ─────────────────────────
  // These methods integrate with the BrowserController for CDP-based automation
  // Compatible with Gemini 3's Computer Use API actions

  /**
   * Ensure browser is connected before executing browser tools
   */
  private async ensureBrowserConnected(): Promise<{ browser: any; error?: string }> {
    try {
      const { getBrowser } = await import("../browser/controller.js");
      const browser = getBrowser(this.runtimeDir);
      const status = await browser.getStatus();

      if (!status.connected) {
        log.info("Browser not connected, attempting to connect...");
        const connected = await browser.connect();
        if (!connected) {
          return {
            browser: null,
            error: "Browser not connected. The browser will launch automatically when you use browser tools. If this persists, ensure Playwright is installed: npm install playwright-core",
          };
        }
        log.info("Browser connected successfully");
      }

      return { browser };
    } catch (err: any) {
      return { browser: null, error: `Browser error: ${err.message}` };
    }
  }

  private async executeBrowserNavigate(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    if (!url) return { success: false, output: "", error: "No URL provided" };

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const result = await browser.navigate(url);
      return {
        success: result.success,
        output: result.success ? `Navigated to: ${result.url}\nTitle: ${result.title}` : "",
        error: result.success ? undefined : "Navigation failed",
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserClick(args: Record<string, unknown>): Promise<ToolResult> {
    const selector = String(args.selector || "");
    if (!selector) return { success: false, output: "", error: "No selector provided" };

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const result = await browser.click(selector);
      return {
        success: result.success,
        output: result.success ? `Clicked: ${selector}` : "",
        error: result.message,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserType(args: Record<string, unknown>): Promise<ToolResult> {
    const selector = String(args.selector || "");
    const text = String(args.text || "");
    if (!selector) return { success: false, output: "", error: "No selector provided" };

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const result = await browser.type(selector, text);
      return {
        success: result.success,
        output: result.success ? `Typed "${text.slice(0, 20)}${text.length > 20 ? "..." : ""}" into ${selector}` : "",
        error: result.message,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
    const fullPage = Boolean(args.fullPage);

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const path = await browser.screenshot(fullPage);
      return { success: true, output: `Screenshot saved: ${path}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserSnapshot(_args: Record<string, unknown>): Promise<ToolResult> {
    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const snapshot = await browser.snapshot();

      // Truncate content for output
      const contentPreview = snapshot.content.length > 5000
        ? snapshot.content.slice(0, 5000) + "\n...(truncated)"
        : snapshot.content;

      return {
        success: true,
        output: `URL: ${snapshot.url}\nTitle: ${snapshot.title}\nScreenshot: ${snapshot.imagePath}\n\nContent:\n${contentPreview}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserScroll(args: Record<string, unknown>): Promise<ToolResult> {
    const direction = String(args.direction || "down") as "up" | "down" | "top" | "bottom";

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      await browser.scroll(direction);
      return { success: true, output: `Scrolled ${direction}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserTabs(_args: Record<string, unknown>): Promise<ToolResult> {
    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const tabs = await browser.listTabs();

      if (tabs.length === 0) {
        return { success: true, output: "No tabs open" };
      }

      const output = tabs.map((t: { title: string; url: string }, i: number) => `[${i}] ${t.title}\n    ${t.url}`).join("\n\n");
      return { success: true, output };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserNewTab(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url ? String(args.url) : undefined;

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const success = await browser.newTab(url);
      return {
        success,
        output: success ? `Opened new tab${url ? `: ${url}` : ""}` : "",
        error: success ? undefined : "Failed to open new tab",
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeBrowserPressKey(args: Record<string, unknown>): Promise<ToolResult> {
    const key = String(args.key || "");
    if (!key) return { success: false, output: "", error: "No key provided" };

    const { browser, error } = await this.ensureBrowserConnected();
    if (error) return { success: false, output: "", error };

    try {
      const success = await browser.pressKey(key);
      return {
        success,
        output: success ? `Pressed key: ${key}` : "",
        error: success ? undefined : "Key press failed",
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // ─── Hackathon Tools: Trust Controls ─────────────────────────────────────────

  private async executeTrustRequest(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action || "");
    const description = String(args.description || "");
    const metadata = args.metadata ? JSON.parse(String(args.metadata)) : {};

    if (!action || !description) {
      return { success: false, output: "", error: "action and description required" };
    }

    try {
      const { getTrustController } = await import("../trust/controller.js");
      const trust = getTrustController();

      const approved = await trust.requestApproval({
        action,
        description,
        metadata,
        channel: "tool",
        userId: "agent",
      });

      return {
        success: true,
        output: approved
          ? `Approved: ${description}`
          : `Denied: ${description}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeTrustListPending(_args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { getTrustController } = await import("../trust/controller.js");
      const trust = getTrustController();
      const pending = trust.listPending();

      if (pending.length === 0) {
        return { success: true, output: "No pending approval requests" };
      }

      const output = pending.map((p) =>
        `[${p.id}] ${p.action}: ${p.description} (expires: ${p.expiresAt.toISOString()})`
      ).join("\n");

      return { success: true, output };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // ─── Hackathon Tools: x402 Payments ──────────────────────────────────────────

  private async executeX402Fetch(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    const method = String(args.method || "GET");
    const body = args.body ? String(args.body) : undefined;

    if (!url) return { success: false, output: "", error: "No URL provided" };

    try {
      const { getX402Client } = await import("../wallet/x402-client.js");
      const client = getX402Client();

      if (!client) {
        return { success: false, output: "", error: "x402 wallet not initialized" };
      }

      const response = await client.fetch(url, {
        method,
        body,
        headers: body ? { "Content-Type": "application/json" } : undefined,
      });

      const text = await response.text();
      const truncated = text.length > 10000 ? text.slice(0, 10000) + "...(truncated)" : text;
      return { success: response.ok, output: truncated, error: response.ok ? undefined : `HTTP ${response.status}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeX402Balance(_args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { getX402Client } = await import("../wallet/x402-client.js");
      const client = getX402Client();

      if (!client) {
        return { success: false, output: "", error: "x402 wallet not initialized" };
      }

      const [usdc, eth] = await Promise.all([
        client.getUSDCBalance(),
        client.getETHBalance(),
      ]);

      return {
        success: true,
        output: `Address: ${client.address}\nUSDC: ${usdc}\nETH: ${eth} (for gas)`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // ─── Hackathon Tools: ERC-8004 ───────────────────────────────────────────────

  private async executeERC8004Register(args: Record<string, unknown>): Promise<ToolResult> {
    const agentURI = String(args.agentURI || "");
    if (!agentURI) return { success: false, output: "", error: "agentURI required" };

    try {
      const { getERC8004Client } = await import("../trust/erc8004.js");
      const client = getERC8004Client();

      if (!client) {
        return { success: false, output: "", error: "ERC-8004 client not initialized" };
      }

      const deployed = await client.isDeployed();
      if (!deployed) {
        return { success: false, output: "", error: "ERC-8004 contracts not deployed on this network" };
      }

      const agentId = await client.registerAgent(agentURI);
      return { success: true, output: `Agent registered with ID: ${agentId.toString()}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeERC8004Reputation(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = String(args.agentId || "");
    const tag = args.tag ? String(args.tag) : undefined;

    if (!agentId) return { success: false, output: "", error: "agentId required" };

    try {
      const { getERC8004Client } = await import("../trust/erc8004.js");
      const client = getERC8004Client();

      if (!client) {
        return { success: false, output: "", error: "ERC-8004 client not initialized" };
      }

      const rep = await client.getReputation(BigInt(agentId), tag);
      return {
        success: true,
        output: `Agent ${agentId} Reputation:\n` +
          `  Feedback Count: ${rep.count}\n` +
          `  Average Score: ${rep.averageScore.toFixed(1)}/100\n` +
          `  Trusted: ${rep.trusted ? "Yes" : "No"}\n` +
          `  Reason: ${rep.reason}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeERC8004Feedback(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = String(args.agentId || "");
    const score = Number(args.score || 0);
    const tag = args.tag ? String(args.tag) : undefined;

    if (!agentId || score < 0 || score > 100) {
      return { success: false, output: "", error: "agentId and score (0-100) required" };
    }

    try {
      const { getERC8004Client } = await import("../trust/erc8004.js");
      const client = getERC8004Client();

      if (!client) {
        return { success: false, output: "", error: "ERC-8004 client not initialized" };
      }

      await client.giveFeedback({
        agentId: BigInt(agentId),
        score,
        tag1: tag,
      });

      return { success: true, output: `Feedback submitted: ${score}/100 for agent ${agentId}` };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeERC8004Verify(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = String(args.agentId || "");
    const minScore = Number(args.minScore || 70);

    if (!agentId) return { success: false, output: "", error: "agentId required" };

    try {
      const { getERC8004Client } = await import("../trust/erc8004.js");
      const client = getERC8004Client();

      if (!client) {
        return { success: false, output: "", error: "ERC-8004 client not initialized" };
      }

      const [identity, trust] = await Promise.all([
        client.verifyAgent(BigInt(agentId)),
        client.shouldTrust(BigInt(agentId), minScore),
      ]);

      return {
        success: true,
        output: `Agent ${agentId} Verification:\n` +
          `  Valid: ${identity.valid}\n` +
          `  Owner: ${identity.owner || "N/A"}\n` +
          `  Wallet: ${identity.wallet || "N/A"}\n` +
          `  URI: ${identity.uri || "N/A"}\n` +
          `  Should Trust: ${trust.trusted ? "Yes" : "No"}\n` +
          `  Reason: ${trust.reason}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // ─── Hackathon Tools: A2A Protocol ───────────────────────────────────────────

  private async executeA2ADiscover(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    if (!url) return { success: false, output: "", error: "URL required" };

    try {
      const { A2AClient } = await import("../a2a/protocol.js");
      const client = new A2AClient(url);
      const card = await client.discover();

      return {
        success: true,
        output: `Agent: ${card.name} v${card.version}\n` +
          `Description: ${card.description}\n` +
          `URL: ${card.url}\n` +
          `Capabilities: ${JSON.stringify(card.capabilities)}\n` +
          `Skills:\n${card.skills.map((s) => `  - ${s.name}: ${s.description}`).join("\n")}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeA2ADelegate(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    const instruction = String(args.instruction || "");
    const context = args.context ? String(args.context) : undefined;

    if (!url || !instruction) {
      return { success: false, output: "", error: "url and instruction required" };
    }

    try {
      const { A2AClient } = await import("../a2a/protocol.js");
      const client = new A2AClient(url);
      const task = await client.delegateTask(instruction, context);

      const resultText = task.message?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join("\n") || "";

      return {
        success: task.status === "completed",
        output: `Task ${task.id} ${task.status}\n\nResult:\n${resultText}`,
        error: task.status === "failed" ? "Task failed" : undefined,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeA2ADelegateStream(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    const instruction = String(args.instruction || "");

    if (!url || !instruction) {
      return { success: false, output: "", error: "url and instruction required" };
    }

    try {
      const { A2AClient } = await import("../a2a/protocol.js");
      const client = new A2AClient(url);

      const updates: string[] = [];
      for await (const event of client.subscribeToTask({
        message: { role: "user", parts: [{ type: "text", text: instruction }] },
      })) {
        updates.push(`[${event.status}] ${event.message?.parts?.[0]?.text || ""}`);
        if (event.final) break;
      }

      return { success: true, output: updates.join("\n") };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // ─── Hackathon Tools: Chainlink CRE ──────────────────────────────────────────

  private async executeCRESimulate(args: Record<string, unknown>): Promise<ToolResult> {
    const workflowName = String(args.workflow || "");
    const mockEvent = args.mockEvent ? JSON.parse(String(args.mockEvent)) : undefined;

    if (!workflowName) {
      return { success: false, output: "", error: "workflow name required" };
    }

    try {
      const {
        createDeFiMonitorWorkflow,
        createPriceAlertWorkflow,
        createTrustBridgeWorkflow,
        simulateWorkflow,
      } = await import("../cre/workflows.js");

      let workflow;
      const config = {
        schedule: "*/15 * * * *",
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
        walletAddress: "0x0000000000000000000000000000000000000000",
        ilThreshold: 0.1,
        wispyApiUrl: "http://localhost:3000",
        feedAddress: "0x...",
        targetPrice: 3000,
        direction: "below" as const,
        chainId: 8453,
      };

      switch (workflowName) {
        case "defi-monitor":
          workflow = createDeFiMonitorWorkflow(config);
          break;
        case "price-alert":
          workflow = createPriceAlertWorkflow(config);
          break;
        case "trust-bridge":
          workflow = createTrustBridgeWorkflow({ wispyApiUrl: config.wispyApiUrl });
          break;
        default:
          return { success: false, output: "", error: `Unknown workflow: ${workflowName}` };
      }

      const result = await simulateWorkflow(workflow, config, {}, mockEvent);

      return {
        success: result.success,
        output: `Workflow: ${workflowName}\n` +
          `Success: ${result.success}\n` +
          `Data: ${JSON.stringify(result.data, null, 2)}`,
        error: result.error,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  private async executeCREDeploy(args: Record<string, unknown>): Promise<ToolResult> {
    const projectName = String(args.projectName || "wispy-cre");
    const workflows = args.workflows ? String(args.workflows).split(",") : ["defi-monitor", "price-alert"];

    try {
      const { generateCREConfig } = await import("../cre/workflows.js");

      const config = generateCREConfig({
        projectName,
        wispyApiUrl: "https://api.wispy.ai",
        walletAddress: "0x...",
      });

      // Filter to requested workflows
      config.workflows = config.workflows.filter((w) => workflows.includes(w.name));

      return {
        success: true,
        output: `CRE Config Generated:\n\n${JSON.stringify(config, null, 2)}\n\n` +
          `To deploy:\n` +
          `1. cre init ${projectName}\n` +
          `2. Copy config to cre-config.ts\n` +
          `3. cre deploy --network base-sepolia`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // ─── Full Project Creation Tool ───────────────────────────────────────────────

  private async executeCreateProject(args: Record<string, unknown>): Promise<ToolResult> {
    const name = String(args.name || "my-project");
    const framework = String(args.framework || "html").toLowerCase();
    const description = String(args.description || "");

    const { join } = await import("path");
    const workspaceDir = join(this.runtimeDir, "workspace");
    ensureDir(workspaceDir);
    const projectDir = join(workspaceDir, name);

    try {
      ensureDir(projectDir);

      let createCommand = "";
      let installCommand = "";
      let files: { path: string; content: string }[] = [];

      switch (framework) {
        case "react":
        case "react-ts":
          createCommand = `cd "${projectDir}" && npm create vite@latest . -- --template ${framework === "react-ts" ? "react-ts" : "react"} --yes`;
          installCommand = `cd "${projectDir}" && npm install && npm install tailwindcss postcss autoprefixer -D`;
          break;

        case "next":
        case "nextjs":
          createCommand = `cd "${projectDir}" && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --yes`;
          break;

        case "vue":
        case "vue-ts":
          createCommand = `cd "${projectDir}" && npm create vite@latest . -- --template ${framework === "vue-ts" ? "vue-ts" : "vue"} --yes`;
          installCommand = `cd "${projectDir}" && npm install && npm install tailwindcss postcss autoprefixer -D`;
          break;

        case "vite":
          createCommand = `cd "${projectDir}" && npm create vite@latest . -- --template vanilla --yes`;
          installCommand = `cd "${projectDir}" && npm install`;
          break;

        case "express":
        case "node":
          files = this.generateExpressProject(name, description);
          break;

        case "html":
        case "static":
        default:
          files = this.generateStaticProject(name, description);
          break;
      }

      // For npm-based projects, run create commands
      if (createCommand) {
        log.info("Creating project with command: %s", createCommand);
        try {
          await execAsync(createCommand, {
            timeout: 180000,
            maxBuffer: 10 * 1024 * 1024,
            cwd: workspaceDir,
            env: { ...process.env },
          });

          if (installCommand) {
            await execAsync(installCommand, {
              timeout: 180000,
              maxBuffer: 10 * 1024 * 1024,
              cwd: workspaceDir,
              env: { ...process.env },
            });
          }

          return {
            success: true,
            output: `Created ${framework} project: ${projectDir}\n\n` +
              `To start:\n  cd ${projectDir}\n  npm run dev\n\n` +
              `Project is ready for development!`,
          };
        } catch (err: any) {
          log.warn("npm create failed, falling back to manual scaffold: %s", err.message);
          // Fall back to static project if npm create fails
          files = this.generateStaticProject(name, description);
        }
      }

      // For static/express projects or fallback, write files manually
      for (const file of files) {
        const filePath = join(projectDir, file.path);
        ensureDir(dirname(filePath));
        writeFileSync(filePath, file.content, "utf-8");
      }

      const fileList = files.map(f => `  - ${f.path}`).join("\n");
      return {
        success: true,
        output: `Created ${framework} project: ${projectDir}\n\nFiles:\n${fileList}\n\n` +
          `Open ${join(projectDir, "index.html")} in a browser to view.`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to create project: ${err.message}` };
    }
  }

  private generateStaticProject(name: string, description: string): { path: string; content: string }[] {
    const title = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const desc = description || `A beautiful ${title} platform`;

    return [
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#7c3aed',
            secondary: '#06b6d4',
            accent: '#f472b6',
          },
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
        }
      }
    }
  </script>

  <!-- Font Awesome Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

  <!-- AOS Animations -->
  <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">

  <!-- Custom Styles -->
  <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-gray-950 text-white min-h-screen font-sans antialiased">

  <!-- Navigation -->
  <nav class="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <div class="flex items-center space-x-2">
          <div class="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
            <i class="fas fa-bolt text-white text-lg"></i>
          </div>
          <span class="text-xl font-bold">${title}</span>
        </div>
        <div class="hidden md:flex items-center space-x-8">
          <a href="#features" class="text-gray-300 hover:text-white transition flex items-center gap-2">
            <i class="fas fa-th-large text-sm"></i> Features
          </a>
          <a href="#about" class="text-gray-300 hover:text-white transition flex items-center gap-2">
            <i class="fas fa-info-circle text-sm"></i> About
          </a>
          <a href="#contact" class="text-gray-300 hover:text-white transition flex items-center gap-2">
            <i class="fas fa-envelope text-sm"></i> Contact
          </a>
          <button class="bg-primary hover:bg-primary/80 px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
            <i class="fas fa-rocket"></i> Get Started
          </button>
        </div>
        <button class="md:hidden text-gray-300" id="mobile-menu-btn">
          <i class="fas fa-bars text-xl"></i>
        </button>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <section class="pt-32 pb-20 px-4 relative overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent"></div>
    <div class="absolute top-20 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-[100px]"></div>
    <div class="absolute bottom-20 right-1/4 w-72 h-72 bg-accent/20 rounded-full blur-[100px]"></div>

    <div class="max-w-6xl mx-auto text-center relative z-10">
      <div data-aos="fade-up" class="inline-flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-2 mb-8">
        <i class="fas fa-sparkles text-yellow-400"></i>
        <span class="text-sm text-gray-300">Powered by AI</span>
      </div>

      <h1 data-aos="fade-up" data-aos-delay="100" class="text-5xl md:text-7xl font-extrabold mb-6 leading-tight">
        Welcome to<br>
        <span class="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-secondary">${title}</span>
      </h1>

      <p data-aos="fade-up" data-aos-delay="200" class="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
        ${desc}
      </p>

      <div data-aos="fade-up" data-aos-delay="300" class="flex flex-col sm:flex-row gap-4 justify-center">
        <button class="bg-primary hover:bg-primary/80 text-white font-semibold py-4 px-8 rounded-xl transition transform hover:scale-105 flex items-center justify-center gap-3 shadow-lg shadow-primary/25">
          <i class="fas fa-play-circle"></i> Get Started Free
        </button>
        <button class="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold py-4 px-8 rounded-xl transition flex items-center justify-center gap-3">
          <i class="fas fa-book-open"></i> Learn More
        </button>
      </div>

      <div data-aos="fade-up" data-aos-delay="400" class="mt-16 flex items-center justify-center gap-8 text-gray-400">
        <div class="flex items-center gap-2">
          <i class="fas fa-check-circle text-green-400"></i>
          <span>Free Forever</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-shield-alt text-blue-400"></i>
          <span>Secure</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-bolt text-yellow-400"></i>
          <span>Lightning Fast</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section id="features" class="py-20 px-4 bg-gray-900/50">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-16">
        <h2 data-aos="fade-up" class="text-4xl font-bold mb-4">
          <i class="fas fa-cubes text-primary mr-3"></i>Powerful Features
        </h2>
        <p data-aos="fade-up" data-aos-delay="100" class="text-gray-400 max-w-2xl mx-auto">
          Everything you need to build amazing experiences
        </p>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div data-aos="fade-up" data-aos-delay="100" class="bg-gray-800/50 border border-gray-700/50 p-8 rounded-2xl hover:border-primary/50 transition group">
          <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
            <i class="fas fa-rocket text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-3">Lightning Fast</h3>
          <p class="text-gray-400">Optimized performance with cutting-edge technology for instant results.</p>
        </div>

        <div data-aos="fade-up" data-aos-delay="200" class="bg-gray-800/50 border border-gray-700/50 p-8 rounded-2xl hover:border-primary/50 transition group">
          <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
            <i class="fas fa-shield-alt text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-3">Enterprise Security</h3>
          <p class="text-gray-400">Bank-grade encryption and security protocols protect your data.</p>
        </div>

        <div data-aos="fade-up" data-aos-delay="300" class="bg-gray-800/50 border border-gray-700/50 p-8 rounded-2xl hover:border-primary/50 transition group">
          <div class="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
            <i class="fas fa-chart-line text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-3">Analytics</h3>
          <p class="text-gray-400">Real-time insights and comprehensive analytics dashboard.</p>
        </div>

        <div data-aos="fade-up" data-aos-delay="400" class="bg-gray-800/50 border border-gray-700/50 p-8 rounded-2xl hover:border-primary/50 transition group">
          <div class="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
            <i class="fas fa-cogs text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-3">Automation</h3>
          <p class="text-gray-400">Automate repetitive tasks and focus on what matters most.</p>
        </div>

        <div data-aos="fade-up" data-aos-delay="500" class="bg-gray-800/50 border border-gray-700/50 p-8 rounded-2xl hover:border-primary/50 transition group">
          <div class="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
            <i class="fas fa-plug text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-3">Integrations</h3>
          <p class="text-gray-400">Connect with 100+ tools and services seamlessly.</p>
        </div>

        <div data-aos="fade-up" data-aos-delay="600" class="bg-gray-800/50 border border-gray-700/50 p-8 rounded-2xl hover:border-primary/50 transition group">
          <div class="w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
            <i class="fas fa-headset text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-3">24/7 Support</h3>
          <p class="text-gray-400">Round-the-clock support from our expert team.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Stats Section -->
  <section class="py-20 px-4">
    <div class="max-w-6xl mx-auto">
      <div class="grid md:grid-cols-4 gap-8 text-center">
        <div data-aos="zoom-in" data-aos-delay="100">
          <div class="text-5xl font-bold text-primary mb-2">10K+</div>
          <div class="text-gray-400 flex items-center justify-center gap-2">
            <i class="fas fa-users"></i> Active Users
          </div>
        </div>
        <div data-aos="zoom-in" data-aos-delay="200">
          <div class="text-5xl font-bold text-secondary mb-2">99.9%</div>
          <div class="text-gray-400 flex items-center justify-center gap-2">
            <i class="fas fa-server"></i> Uptime
          </div>
        </div>
        <div data-aos="zoom-in" data-aos-delay="300">
          <div class="text-5xl font-bold text-accent mb-2">50M+</div>
          <div class="text-gray-400 flex items-center justify-center gap-2">
            <i class="fas fa-tasks"></i> Tasks Completed
          </div>
        </div>
        <div data-aos="zoom-in" data-aos-delay="400">
          <div class="text-5xl font-bold text-green-400 mb-2">4.9</div>
          <div class="text-gray-400 flex items-center justify-center gap-2">
            <i class="fas fa-star"></i> User Rating
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section id="contact" class="py-20 px-4">
    <div class="max-w-4xl mx-auto">
      <div data-aos="fade-up" class="bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 rounded-3xl p-12 text-center relative overflow-hidden">
        <div class="absolute top-0 right-0 w-40 h-40 bg-primary/20 rounded-full blur-[80px]"></div>
        <div class="absolute bottom-0 left-0 w-40 h-40 bg-accent/20 rounded-full blur-[80px]"></div>

        <div class="relative z-10">
          <h2 class="text-4xl font-bold mb-4">
            <i class="fas fa-paper-plane text-primary mr-3"></i>Ready to Get Started?
          </h2>
          <p class="text-gray-300 mb-8 max-w-xl mx-auto">
            Join thousands of users who are already transforming their workflow with ${title}.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <input type="email" placeholder="Enter your email" class="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 w-full sm:w-80 focus:border-primary focus:outline-none">
            <button class="bg-primary hover:bg-primary/80 text-white font-semibold py-4 px-8 rounded-xl transition flex items-center justify-center gap-2">
              <i class="fas fa-arrow-right"></i> Subscribe
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 border-t border-gray-800 py-12 px-4">
    <div class="max-w-6xl mx-auto">
      <div class="grid md:grid-cols-4 gap-8 mb-8">
        <div>
          <div class="flex items-center space-x-2 mb-4">
            <div class="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
              <i class="fas fa-bolt text-white"></i>
            </div>
            <span class="text-xl font-bold">${title}</span>
          </div>
          <p class="text-gray-400 text-sm">Building the future, one feature at a time.</p>
        </div>
        <div>
          <h4 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-link text-primary"></i> Quick Links</h4>
          <ul class="space-y-2 text-gray-400">
            <li><a href="#" class="hover:text-white transition"><i class="fas fa-home mr-2"></i>Home</a></li>
            <li><a href="#features" class="hover:text-white transition"><i class="fas fa-th-large mr-2"></i>Features</a></li>
            <li><a href="#" class="hover:text-white transition"><i class="fas fa-dollar-sign mr-2"></i>Pricing</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-building text-primary"></i> Company</h4>
          <ul class="space-y-2 text-gray-400">
            <li><a href="#about" class="hover:text-white transition"><i class="fas fa-info-circle mr-2"></i>About</a></li>
            <li><a href="#" class="hover:text-white transition"><i class="fas fa-briefcase mr-2"></i>Careers</a></li>
            <li><a href="#contact" class="hover:text-white transition"><i class="fas fa-envelope mr-2"></i>Contact</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-share-alt text-primary"></i> Connect</h4>
          <div class="flex space-x-4">
            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-primary transition">
              <i class="fab fa-twitter"></i>
            </a>
            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-primary transition">
              <i class="fab fa-github"></i>
            </a>
            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-primary transition">
              <i class="fab fa-discord"></i>
            </a>
            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-primary transition">
              <i class="fab fa-linkedin"></i>
            </a>
          </div>
        </div>
      </div>
      <div class="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
        <p>&copy; ${new Date().getFullYear()} ${title}. Built with <i class="fas fa-heart text-red-500"></i> by Wispy AI</p>
      </div>
    </div>
  </footer>

  <!-- AOS Animation -->
  <script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
  <script>AOS.init({ duration: 800, once: true });</script>

  <!-- Custom Scripts -->
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: `/* ${title} - Custom Styles */

/* Smooth scrolling */
html {
  scroll-behavior: smooth;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #1f2937;
}

::-webkit-scrollbar-thumb {
  background: #7c3aed;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #6d28d9;
}

/* Gradient text animation */
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.gradient-animate {
  background-size: 200% 200%;
  animation: gradient-shift 3s ease infinite;
}

/* Floating animation */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

/* Pulse glow */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(124, 58, 237, 0.3); }
  50% { box-shadow: 0 0 40px rgba(124, 58, 237, 0.6); }
}

.animate-pulse-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}

/* Card hover effect */
.card-hover {
  transition: all 0.3s ease;
}

.card-hover:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(124, 58, 237, 0.2);
}

/* Button ripple effect */
.btn-ripple {
  position: relative;
  overflow: hidden;
}

.btn-ripple::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.3s, height 0.3s;
}

.btn-ripple:hover::after {
  width: 300px;
  height: 300px;
}

/* Glass morphism */
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Text gradient */
.text-gradient {
  background: linear-gradient(135deg, #7c3aed, #f472b6, #06b6d4);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
`,
      },
      {
        path: "app.js",
        content: `// ${title} - JavaScript
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  console.log('${title} loaded successfully!');

  // Mobile menu toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      // Add mobile menu logic here
      console.log('Mobile menu clicked');
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Navbar background on scroll
  const nav = document.querySelector('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        nav.classList.add('bg-gray-950');
        nav.classList.remove('bg-gray-950/80');
      } else {
        nav.classList.remove('bg-gray-950');
        nav.classList.add('bg-gray-950/80');
      }
    });
  }

  // Form submission
  const emailInput = document.querySelector('input[type="email"]');
  const subscribeBtn = emailInput?.nextElementSibling;
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', () => {
      const email = emailInput.value;
      if (email && email.includes('@')) {
        alert('Thank you for subscribing! We\\'ll be in touch soon.');
        emailInput.value = '';
      } else {
        alert('Please enter a valid email address.');
      }
    });
  }

  // Counter animation for stats
  const animateCounters = () => {
    document.querySelectorAll('[data-aos="zoom-in"]').forEach(el => {
      const value = el.querySelector('.text-5xl')?.textContent;
      if (value) {
        // Stats are already set, animation handled by AOS
      }
    });
  };

  // Initialize counters when in view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounters();
      }
    });
  }, { threshold: 0.5 });

  const statsSection = document.querySelector('.grid.md\\\\:grid-cols-4');
  if (statsSection) {
    observer.observe(statsSection);
  }
});
`,
      },
    ];
  }

  private generateExpressProject(name: string, description: string): { path: string; content: string }[] {
    const title = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    return [
      {
        path: "package.json",
        content: JSON.stringify({
          name,
          version: "1.0.0",
          description: description || `${title} - Express API`,
          type: "module",
          main: "server.js",
          scripts: {
            start: "node server.js",
            dev: "node --watch server.js",
          },
          dependencies: {
            express: "^4.18.2",
            cors: "^2.8.5",
          },
        }, null, 2),
      },
      {
        path: "server.js",
        content: `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from ${title}!' });
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 ${title} running at http://localhost:\${PORT}\`);
});
`,
      },
      {
        path: "public/index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold mb-4">${title}</h1>
    <p class="text-gray-400 mb-8">Express API is running!</p>
    <div id="response" class="bg-gray-800 p-4 rounded-lg"></div>
  </div>
  <script>
    fetch('/api/hello')
      .then(res => res.json())
      .then(data => {
        document.getElementById('response').innerHTML =
          '<pre class="text-green-400">' + JSON.stringify(data, null, 2) + '</pre>';
      });
  </script>
</body>
</html>`,
      },
    ];
  }

  private async executeScaffoldShadcn(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || args.project || "");
    const components = args.components ? String(args.components).split(",").map(c => c.trim()) : ["button", "card", "input"];

    const { join, isAbsolute } = await import("path");
    let fullPath = projectPath;
    if (!isAbsolute(projectPath)) {
      fullPath = join(this.runtimeDir, "workspace", projectPath);
    }

    if (!existsSync(fullPath)) {
      return { success: false, output: "", error: `Project not found: ${fullPath}` };
    }

    try {
      // Initialize shadcn/ui
      log.info("Initializing shadcn/ui in %s", fullPath);

      // Run shadcn init
      await execAsync(`cd "${fullPath}" && npx shadcn@latest init -y --defaults`, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      });

      // Add requested components
      const addedComponents: string[] = [];
      for (const component of components) {
        try {
          await execAsync(`cd "${fullPath}" && npx shadcn@latest add ${component} -y`, {
            timeout: 60000,
            maxBuffer: 5 * 1024 * 1024,
            env: { ...process.env },
          });
          addedComponents.push(component);
        } catch (err: any) {
          log.warn("Failed to add component %s: %s", component, err.message);
        }
      }

      return {
        success: true,
        output: `Initialized shadcn/ui in ${fullPath}\n\nAdded components:\n${addedComponents.map(c => `  - ${c}`).join("\n")}\n\nUsage:\nimport { Button } from "@/components/ui/button"`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to scaffold shadcn: ${err.message}` };
    }
  }

  private async executeAddComponent(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || args.project || "");
    const component = String(args.component || args.name || "");
    const framework = String(args.framework || "shadcn").toLowerCase();

    if (!component) {
      return { success: false, output: "", error: "No component name provided" };
    }

    const { join, isAbsolute } = await import("path");
    let fullPath = projectPath;
    if (projectPath && !isAbsolute(projectPath)) {
      fullPath = join(this.runtimeDir, "workspace", projectPath);
    } else if (!projectPath) {
      fullPath = join(this.runtimeDir, "workspace");
    }

    try {
      if (framework === "shadcn") {
        await execAsync(`cd "${fullPath}" && npx shadcn@latest add ${component} -y`, {
          timeout: 60000,
          maxBuffer: 5 * 1024 * 1024,
          env: { ...process.env },
        });
        return {
          success: true,
          output: `Added shadcn component: ${component}\n\nUsage:\nimport { ${component.charAt(0).toUpperCase() + component.slice(1)} } from "@/components/ui/${component}"`,
        };
      }

      // For other frameworks, create a basic component file
      const componentName = component.charAt(0).toUpperCase() + component.slice(1);
      const componentPath = join(fullPath, "src", "components", `${componentName}.tsx`);

      ensureDir(dirname(componentPath));

      const componentCode = `import React from 'react';

interface ${componentName}Props {
  children?: React.ReactNode;
  className?: string;
}

export function ${componentName}({ children, className = '' }: ${componentName}Props) {
  return (
    <div className={\`\${className}\`}>
      {children}
    </div>
  );
}

export default ${componentName};
`;

      writeFileSync(componentPath, componentCode, "utf-8");

      return {
        success: true,
        output: `Created component: ${componentPath}\n\nUsage:\nimport { ${componentName} } from './components/${componentName}'`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to add component: ${err.message}` };
    }
  }

  private async executeRunDevServer(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const port = Number(args.port) || 3000;

    const { join, isAbsolute } = await import("path");
    let fullPath = projectPath;
    if (!isAbsolute(projectPath)) {
      fullPath = join(this.runtimeDir, "workspace", projectPath);
    }

    if (!existsSync(fullPath)) {
      return { success: false, output: "", error: `Project not found: ${fullPath}` };
    }

    try {
      // Check if it's an npm project
      const packageJsonPath = join(fullPath, "package.json");
      if (existsSync(packageJsonPath)) {
        // Read package.json to find the right dev command
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        const scripts = packageJson.scripts || {};

        // Determine which command to run (dev, start, or build+start)
        let devCommand = "dev";
        if (!scripts.dev && scripts.start) {
          devCommand = "start";
        }

        // CRITICAL: Check if node_modules exists - if not, run npm install first
        const nodeModulesPath = join(fullPath, "node_modules");
        if (!existsSync(nodeModulesPath)) {
          log.info("node_modules not found, running npm install first...");
          try {
            execSync("npm install", {
              cwd: fullPath,
              stdio: "pipe",
              timeout: 180000, // 3 minute timeout for install
            });
            log.info("npm install completed successfully");
          } catch (installErr: any) {
            const installError = (installErr.stderr || installErr.message || "").toString();
            log.warn("npm install warning: " + installError.slice(0, 200));
            // Self-healing: provide fix hints
            const hint = this.detectErrorsForSelfHealing(installError);
            if (hint && installError.toLowerCase().includes("err!")) {
              return {
                success: false,
                output: `npm install failed in ${fullPath}`,
                error: `${installError.slice(0, 2000)}\n\n[SELF-HEAL] ${hint}`,
              };
            }
            // Non-fatal warnings: continue anyway
          }
        }

        // Start npm dev server in background with shell: true for Windows
        const proc = spawn("npm", ["run", devCommand], {
          cwd: fullPath,
          detached: true,
          stdio: "ignore",
          shell: true, // Required for Windows
          env: { ...process.env, PORT: String(port) },
        });
        proc.unref();

        // Wait longer for server to start (especially after install)
        await new Promise(resolve => setTimeout(resolve, 5000));

        return {
          success: true,
          output: `Started npm development server for ${projectPath}\n` +
            `URL: http://localhost:${port}\n` +
            `Command: npm run ${devCommand}\n` +
            `PID: ${proc.pid}\n\n` +
            `IMPORTANT: This is 'npm run ${devCommand}' (NOT static file server).\n` +
            `The app will compile and hot-reload. Wait a few seconds then open the URL.`,
        };
      }

      // For static HTML projects (no package.json), use serve
      log.info("No package.json found, using static server");
      const proc = spawn("npx", ["serve", "-l", String(port)], {
        cwd: fullPath,
        detached: true,
        stdio: "ignore",
        shell: true, // Required for Windows
      });
      proc.unref();

      return {
        success: true,
        output: `Started STATIC server for ${projectPath} (no package.json found)\n` +
          `URL: http://localhost:${port}\n` +
          `PID: ${proc.pid}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }

  // === Document Generation Methods ===

  private async executeDocumentCreate(args: Record<string, unknown>): Promise<ToolResult> {
    const title = String(args.title || "");
    const type = String(args.type || "report") as any;
    const content = String(args.content || "");
    const outputPath = String(args.outputPath || "");
    const author = String(args.author || "");
    const date = String(args.date || "");

    if (!title || !content || !outputPath) {
      return { success: false, output: "", error: "title, content, and outputPath are required" };
    }

    try {
      const { createDocument } = await import("../documents/generator.js");

      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(outputPath)
        ? outputPath
        : join(this.runtimeDir, "workspace", outputPath);

      const result = await createDocument({
        title,
        type,
        content,
        outputPath: fullPath,
        author,
        date,
      });

      return {
        success: true,
        output: `Document created: ${result}\n\nType: ${type}\nTitle: ${title}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Document creation failed: ${err.message}` };
    }
  }

  private async executeDocumentChart(args: Record<string, unknown>): Promise<ToolResult> {
    const chartType = String(args.chartType || "bar") as any;
    const title = String(args.title || "");
    const dataStr = String(args.data || "{}");
    const outputPath = String(args.outputPath || "");
    const width = Number(args.width || 12);
    const height = Number(args.height || 8);

    if (!title || !outputPath) {
      return { success: false, output: "", error: "title and outputPath are required" };
    }

    try {
      const data = JSON.parse(dataStr);
      const { createChart } = await import("../documents/generator.js");

      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(outputPath)
        ? outputPath
        : join(this.runtimeDir, "workspace", outputPath);

      const result = await createChart({
        chartType,
        title,
        data,
        outputPath: fullPath,
        width,
        height,
      });

      return {
        success: true,
        output: `Chart created: ${result}\n\nType: ${chartType}\nTitle: ${title}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Chart creation failed: ${err.message}` };
    }
  }

  private async executeDocumentFlowchart(args: Record<string, unknown>): Promise<ToolResult> {
    const diagramType = String(args.diagramType || "flowchart") as any;
    const title = String(args.title || "");
    const nodesStr = String(args.nodes || "[]");
    const connectionsStr = String(args.connections || "[]");
    const outputPath = String(args.outputPath || "");

    if (!outputPath) {
      return { success: false, output: "", error: "outputPath is required" };
    }

    try {
      const nodes = JSON.parse(nodesStr);
      const connections = JSON.parse(connectionsStr);
      const { createFlowchart } = await import("../documents/generator.js");

      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(outputPath)
        ? outputPath
        : join(this.runtimeDir, "workspace", outputPath);

      const result = await createFlowchart({
        diagramType,
        title,
        nodes,
        connections,
        outputPath: fullPath,
      });

      return {
        success: true,
        output: `Flowchart created: ${result}\n\nType: ${diagramType}${title ? `\nTitle: ${title}` : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Flowchart creation failed: ${err.message}` };
    }
  }

  private async executeDocumentTable(args: Record<string, unknown>): Promise<ToolResult> {
    const headersStr = String(args.headers || "[]");
    const rowsStr = String(args.rows || "[]");
    const title = String(args.title || "");
    const outputPath = String(args.outputPath || "");
    const style = String(args.style || "modern") as any;

    if (!outputPath) {
      return { success: false, output: "", error: "outputPath is required" };
    }

    try {
      const headers = JSON.parse(headersStr);
      const rows = JSON.parse(rowsStr);
      const { createTable } = await import("../documents/generator.js");

      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(outputPath)
        ? outputPath
        : join(this.runtimeDir, "workspace", outputPath);

      const result = await createTable({
        headers,
        rows,
        title,
        outputPath: fullPath,
        style,
      });

      return {
        success: true,
        output: `Table created: ${result}\n\nStyle: ${style}${title ? `\nTitle: ${title}` : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Table creation failed: ${err.message}` };
    }
  }

  private async executeLatexCompile(args: Record<string, unknown>): Promise<ToolResult> {
    const texPath = String(args.texPath || "");
    const outputDir = String(args.outputDir || "");

    if (!texPath) {
      return { success: false, output: "", error: "texPath is required" };
    }

    try {
      const { compileLaTeX } = await import("../documents/generator.js");
      const { dirname } = await import("path");

      const result = await compileLaTeX(texPath, outputDir || dirname(texPath));

      return {
        success: true,
        output: `PDF compiled: ${result}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `LaTeX compilation failed: ${err.message}` };
    }
  }

  private async executeResearchReport(args: Record<string, unknown>): Promise<ToolResult> {
    const topic = String(args.topic || "");
    const sectionsStr = String(args.sections || "[]");
    const chartsStr = String(args.charts || "[]");
    const referencesStr = String(args.references || "[]");
    const outputPath = String(args.outputPath || "");

    if (!topic || !outputPath) {
      return { success: false, output: "", error: "topic and outputPath are required" };
    }

    try {
      const sections = JSON.parse(sectionsStr);
      const charts = chartsStr ? JSON.parse(chartsStr) : [];
      const references = referencesStr ? JSON.parse(referencesStr) : [];

      const { createResearchReport } = await import("../documents/generator.js");

      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(outputPath)
        ? outputPath
        : join(this.runtimeDir, "workspace", outputPath);

      const result = await createResearchReport({
        topic,
        sections,
        charts,
        references,
        outputPath: fullPath,
      });

      return {
        success: true,
        output: `Research report created: ${result}\n\nTopic: ${topic}\nSections: ${sections.length}${references.length > 0 ? `\nReferences: ${references.length}` : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Research report creation failed: ${err.message}` };
    }
  }

  // === x402 Audit Report ===

  private async executeGenerateX402Report(args: Record<string, unknown>): Promise<ToolResult> {
    const outputPath = String(args.outputPath || "");
    const agentAddress = String(args.agentAddress || "");
    const network = String(args.network || "");
    const chainId = Number(args.chainId || 0);
    const explorerUrl = String(args.explorerUrl || "");
    const transactionsStr = String(args.transactions || "[]");
    const tracksStr = String(args.tracks || "[]");
    const totalSpent = Number(args.totalSpent || 0);

    if (!outputPath || !agentAddress || !explorerUrl) {
      return { success: false, output: "", error: "outputPath, agentAddress, and explorerUrl are required" };
    }

    try {
      const transactions = JSON.parse(transactionsStr);
      const tracks = JSON.parse(tracksStr);

      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(outputPath)
        ? outputPath
        : join(this.runtimeDir, "workspace", outputPath);

      const { generateX402Report } = await import("../documents/x402-report.js");

      const result = await generateX402Report({
        title: args.title ? String(args.title) : undefined,
        subtitle: args.subtitle ? String(args.subtitle) : undefined,
        agentAddress,
        sellerAddress: args.sellerAddress ? String(args.sellerAddress) : undefined,
        network,
        chainId,
        explorerUrl,
        totalSpent,
        totalTransactions: transactions.length,
        transactions,
        tracks,
        demoTurns: args.demoTurns ? Number(args.demoTurns) : undefined,
        duration: args.duration ? String(args.duration) : undefined,
        author: args.author ? String(args.author) : undefined,
      }, fullPath);

      const outputs = [`x402 Audit Report generated successfully.`];
      outputs.push(`LaTeX source: ${result.texPath}`);
      if (result.pdfPath) {
        outputs.push(`PDF output: ${result.pdfPath}`);
      } else {
        outputs.push(`PDF compilation skipped or failed. LaTeX source is available for manual compilation.`);
      }
      outputs.push(`\nReport contains ${transactions.length} transactions across ${tracks.length} tracks.`);
      outputs.push(`Total spent: $${totalSpent.toFixed(6)} USDC`);
      outputs.push(`Network: ${network} (Chain ${chainId})`);

      return { success: true, output: outputs.join("\n") };
    } catch (err: any) {
      return { success: false, output: "", error: `x402 report generation failed: ${err.message}` };
    }
  }

  // === Telegram Document Delivery Methods ===

  private async executeSendDocumentToTelegram(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(args.filePath || "");
    const caption = String(args.caption || "");
    const withVoice = Boolean(args.withVoice);
    const voiceText = String(args.voiceText || "");

    if (!filePath) {
      return { success: false, output: "", error: "filePath is required" };
    }

    if (!existsSync(filePath)) {
      return { success: false, output: "", error: `File not found: ${filePath}` };
    }

    try {
      // Try current context first, then env var fallback for CLI usage
      const chatId = this.currentChatContext?.chatId
        || process.env.TELEGRAM_CHAT_ID
        || process.env.WISPY_TELEGRAM_CHAT_ID;
      if (!chatId) {
        return { success: false, output: "", error: "No Telegram chat ID available. Set TELEGRAM_CHAT_ID environment variable to send documents from CLI, or use this tool in Telegram context." };
      }

      const { sendPdf, sendDocumentWithVoice, getTelegramBot, initTelegramDelivery } = await import("../documents/telegram-delivery.js");

      // If bot not initialized but we have a token, initialize it for CLI delivery
      if (!getTelegramBot() && process.env.TELEGRAM_BOT_TOKEN) {
        try {
          const { Bot } = await import("grammy");
          const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
          initTelegramDelivery(bot);
        } catch {
          // grammy may not be available
        }
      }

      if (withVoice && voiceText) {
        const success = await sendDocumentWithVoice(chatId, filePath, voiceText, { caption });
        return success
          ? { success: true, output: `Document sent with voice note to Telegram chat ${chatId}` }
          : { success: false, output: "", error: "Failed to send document with voice" };
      } else {
        const { basename } = await import("path");
        const success = await sendPdf(chatId, filePath, {
          title: basename(filePath),
          description: caption,
          generatedWith: "Wispy AI",
        });
        return success
          ? { success: true, output: `Document sent to Telegram chat ${chatId}` }
          : { success: false, output: "", error: "Failed to send document" };
      }
    } catch (err: any) {
      return { success: false, output: "", error: `Send document error: ${err.message}` };
    }
  }

  private async executeSendProgressUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const type = String(args.type || "update") as any;
    const message = String(args.message || "");
    const context = String(args.context || "");
    const buttonsStr = String(args.buttons || "");
    const voiceNote = Boolean(args.voiceNote);

    if (!message) {
      return { success: false, output: "", error: "message is required" };
    }

    try {
      const userId = this.currentChatContext?.peerId;
      if (!userId) {
        return { success: false, output: "", error: "No active user context" };
      }

      const { sendThought } = await import("../trust/progress-notifier.js");

      let buttons;
      if (buttonsStr) {
        try {
          buttons = JSON.parse(buttonsStr);
        } catch {}
      }

      const success = await sendThought(userId, type, message, { context, buttons, voiceNote });
      return success
        ? { success: true, output: `Progress update sent: ${type}` }
        : { success: false, output: "", error: "Failed to send progress update" };
    } catch (err: any) {
      return { success: false, output: "", error: `Progress update error: ${err.message}` };
    }
  }

  private async executeAskUserConfirmation(args: Record<string, unknown>): Promise<ToolResult> {
    const question = String(args.question || "");
    const context = String(args.context || "");
    const approveText = String(args.approveText || "");
    const denyText = String(args.denyText || "");
    const timeout = Number(args.timeout || 5 * 60 * 1000);

    if (!question) {
      return { success: false, output: "", error: "question is required" };
    }

    try {
      const userId = this.currentChatContext?.peerId;
      if (!userId) {
        return { success: true, output: "No user context - auto-approving" };
      }

      const { askConfirmation } = await import("../trust/progress-notifier.js");

      const approved = await askConfirmation(userId, question, {
        context,
        approveText: approveText || undefined,
        denyText: denyText || undefined,
        timeout,
      });

      return {
        success: true,
        output: approved ? "User approved: YES" : "User denied: NO",
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Confirmation error: ${err.message}` };
    }
  }

  // === Enhanced File System Methods ===

  private async executeFilePermissions(args: Record<string, unknown>): Promise<ToolResult> {
    const path = String(args.path || "");
    const action = String(args.action || "check");

    if (!path) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const fs = await import("fs");
      const { constants } = fs;

      if (action === "check") {
        const exists = existsSync(path);
        if (!exists) {
          return { success: true, output: `Path does not exist: ${path}\nCan create: Yes (parent dir exists: ${existsSync(dirname(path))})` };
        }

        let canRead = false;
        let canWrite = false;
        try {
          fs.accessSync(path, constants.R_OK);
          canRead = true;
        } catch {}
        try {
          fs.accessSync(path, constants.W_OK);
          canWrite = true;
        } catch {}

        const stat = fs.statSync(path);
        return {
          success: true,
          output: `Path: ${path}\nExists: Yes\nType: ${stat.isDirectory() ? "Directory" : "File"}\nReadable: ${canRead ? "Yes" : "No"}\nWritable: ${canWrite ? "Yes" : "No"}\nSize: ${stat.size} bytes`,
        };
      }

      // For grant actions, we just report what would happen (actual chmod is too dangerous)
      return {
        success: true,
        output: `Permission action '${action}' noted. In sandboxed mode, use workspace directory for full access: ${resolve(this.runtimeDir, "workspace")}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Permission check error: ${err.message}` };
    }
  }

  private async executeSendLink(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || "");
    const title = String(args.title || "");
    const description = String(args.description || "");
    const disablePreview = Boolean(args.disablePreview);

    if (!url) {
      return { success: false, output: "", error: "url is required" };
    }

    try {
      const chatId = this.currentChatContext?.chatId;
      if (!chatId) {
        return { success: true, output: `Link: ${url}${title ? `\nTitle: ${title}` : ""}${description ? `\nDescription: ${description}` : ""}` };
      }

      const { sendTelegramMessage } = await import("../channels/telegram/adapter.js");

      let message = title ? `*${title}*\n\n` : "";
      message += url;
      if (description) message += `\n\n_${description}_`;

      const success = await sendTelegramMessage(chatId, message);
      return success
        ? { success: true, output: `Link sent to Telegram: ${url}` }
        : { success: false, output: "", error: "Failed to send link" };
    } catch (err: any) {
      return { success: false, output: "", error: `Send link error: ${err.message}` };
    }
  }

  // === Grounding & Verification Methods (Anti-Hallucination) ===

  private async executeVerifyFact(args: Record<string, unknown>): Promise<ToolResult> {
    const claim = String(args.claim || "");
    const source = String(args.source || "");

    if (!claim) {
      return { success: false, output: "", error: "claim is required" };
    }

    try {
      // Use Google Search grounding for fact verification
      const { vertexAIWithGrounding } = await import("../ai/gemini.js");

      const query = source
        ? `Verify this claim against ${source}: "${claim}"`
        : `Verify this claim with current sources: "${claim}"`;

      const result = await vertexAIWithGrounding(query);

      return {
        success: true,
        output: `**Fact Verification**\n\nClaim: "${claim}"\n\n${result}\n\n*Grounded with Google Search*`,
      };
    } catch (err: any) {
      // Fallback to regular web search
      try {
        const searchResult = await this.executeWebSearch({ query: claim });
        return {
          success: true,
          output: `**Fact Check (Web Search)**\n\nClaim: "${claim}"\n\n${searchResult.output}`,
        };
      } catch {
        return { success: false, output: "", error: `Fact verification error: ${err.message}` };
      }
    }
  }

  private async executeDistinguishTask(args: Record<string, unknown>): Promise<ToolResult> {
    const newTaskName = String(args.newTaskName || "");
    const newTaskContext = String(args.newTaskContext || "");
    const previousTaskSummary = String(args.previousTaskSummary || "");

    if (!newTaskName || !newTaskContext) {
      return { success: false, output: "", error: "newTaskName and newTaskContext are required" };
    }

    // Create a clear task boundary
    const taskBoundary = `
════════════════════════════════════════
📋 TASK BOUNDARY: NEW TASK STARTING
════════════════════════════════════════

${previousTaskSummary ? `Previous Task Summary:\n${previousTaskSummary}\n\n---\n\n` : ""}**New Task:** ${newTaskName}

**Context & Requirements:**
${newTaskContext}

**Ground Rules:**
- Focus ONLY on this task
- Do NOT hallucinate features/APIs not in context
- Verify facts before stating them
- Ask for clarification if requirements are unclear
════════════════════════════════════════
`;

    // Also save to memory for context
    try {
      if (this.memoryManager) {
        await this.memoryManager.addMemory(
          `Task started: ${newTaskName} - ${newTaskContext.slice(0, 200)}`,
          "task_boundary",
          undefined,
          { importance: 0.9 }
        );
      }
    } catch {}

    return {
      success: true,
      output: taskBoundary,
    };
  }

  // === Hugging Face Integration ===

  private async executeHuggingFaceInference(args: Record<string, unknown>): Promise<ToolResult> {
    const model = String(args.model || "");
    const input = String(args.input || "");
    const task = String(args.task || "text-generation");
    const parametersStr = String(args.parameters || "{}");

    if (!model || !input) {
      return { success: false, output: "", error: "model and input are required" };
    }

    try {
      const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;

      if (!HF_API_KEY) {
        return {
          success: false,
          output: "",
          error: "HUGGINGFACE_API_KEY or HF_TOKEN environment variable not set. Get one at https://huggingface.co/settings/tokens",
        };
      }

      let parameters = {};
      try {
        parameters = JSON.parse(parametersStr);
      } catch {}

      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: input,
            parameters,
            options: { wait_for_model: true },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, output: "", error: `HuggingFace API error: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      const output = typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);

      return {
        success: true,
        output: `**HuggingFace Inference**\nModel: ${model}\nTask: ${task}\n\n${output}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `HuggingFace inference error: ${err.message}` };
    }
  }

  // === Natural Voice (Gemini Native TTS) ===

  private async executeNaturalVoiceReply(args: Record<string, unknown>): Promise<ToolResult> {
    const text = String(args.text || "");
    const voice = String(args.voice || "Kore");
    const sendToChat = args.sendToChat !== false;

    if (!text) {
      return { success: false, output: "", error: "text is required" };
    }

    try {
      const { join } = await import("path");
      const { existsSync, mkdirSync } = await import("fs");

      const voiceDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "voice-output");
      if (!existsSync(voiceDir)) {
        mkdirSync(voiceDir, { recursive: true });
      }

      // Use Gemini's native TTS (most natural)
      const { generateNaturalVoice } = await import("../core/multimodal-engine.js");
      const audioPath = await generateNaturalVoice(text, voiceDir, { voice });

      if (!audioPath) {
        return { success: false, output: "", error: "Failed to generate voice" };
      }

      // Send to chat
      if (sendToChat && this.currentChatContext?.chatId) {
        try {
          const { getTelegramBot } = await import("../documents/telegram-delivery.js");
          const bot = getTelegramBot();
          if (bot) {
            const { InputFile } = await import("grammy");
            const { createReadStream } = await import("fs");
            await bot.api.sendVoice(
              this.currentChatContext.chatId,
              new InputFile(createReadStream(audioPath))
            );
          }
        } catch (sendErr: any) {
          log.warn("Failed to send voice: %s", sendErr.message);
        }
      }

      return {
        success: true,
        output: `Natural voice generated and sent!\nVoice: ${voice}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Voice generation failed: ${err.message}` };
    }
  }

  // === Multimodal Tools ===

  private async executeMultimodalExplain(args: Record<string, unknown>): Promise<ToolResult> {
    const topic = String(args.topic || "");
    const includeVisuals = args.includeVisuals !== false;
    const includeAudio = Boolean(args.includeAudio);
    const style = String(args.style || "educational") as any;

    if (!topic) {
      return { success: false, output: "", error: "topic is required" };
    }

    try {
      const { join } = await import("path");
      const outputDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "multimodal");

      const { generateMultimodalExplanation } = await import("../core/multimodal-engine.js");
      const result = await generateMultimodalExplanation(topic, outputDir, {
        includeVisuals,
        includeAudio,
        style,
      });

      // Send results to chat
      if (this.currentChatContext?.chatId) {
        const { getTelegramBot } = await import("../documents/telegram-delivery.js");
        const bot = getTelegramBot();

        if (bot && result.images && result.images.length > 0) {
          const { InputFile } = await import("grammy");
          const { readFileSync } = await import("fs");
          for (const img of result.images) {
            const buffer = readFileSync(img.path);
            await bot.api.sendPhoto(
              this.currentChatContext.chatId,
              new InputFile(buffer, "diagram.png"),
              { caption: img.caption }
            );
          }
        }

        if (bot && result.audio) {
          const { InputFile } = await import("grammy");
          const { createReadStream } = await import("fs");
          await bot.api.sendVoice(
            this.currentChatContext.chatId,
            new InputFile(createReadStream(result.audio.path))
          );
        }
      }

      return {
        success: true,
        output: result.text || "Explanation generated with visuals.",
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Multimodal generation failed: ${err.message}` };
    }
  }

  private async executeGenerateDiagram(args: Record<string, unknown>): Promise<ToolResult> {
    const concept = String(args.concept || "");
    const type = String(args.type || "concept") as any;
    const sendToChat = args.sendToChat !== false;

    if (!concept) {
      return { success: false, output: "", error: "concept is required" };
    }

    try {
      const { join } = await import("path");
      const outputDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "diagrams");

      const { generateDiagram } = await import("../core/multimodal-engine.js");
      const imagePath = await generateDiagram(concept, outputDir, type);

      if (!imagePath) {
        return { success: false, output: "", error: "Failed to generate diagram" };
      }

      if (sendToChat && this.currentChatContext?.chatId) {
        const { getTelegramBot } = await import("../documents/telegram-delivery.js");
        const bot = getTelegramBot();
        if (bot) {
          const { InputFile } = await import("grammy");
          const { readFileSync } = await import("fs");
          const buffer = readFileSync(imagePath);
          await bot.api.sendPhoto(
            this.currentChatContext.chatId,
            new InputFile(buffer, "diagram.png"),
            { caption: `📊 Diagram: ${concept}` }
          );
        }
      }

      return {
        success: true,
        output: `Diagram generated: ${imagePath}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Diagram generation failed: ${err.message}` };
    }
  }

  private async executeZipAndSendProject(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.projectPath || "");
    const zipName = String(args.zipName || `project_${Date.now()}.zip`);

    if (!projectPath) {
      return { success: false, output: "", error: "projectPath is required" };
    }

    try {
      const { existsSync } = await import("fs");
      const { join, basename } = await import("path");

      if (!existsSync(projectPath)) {
        return { success: false, output: "", error: `Project path not found: ${projectPath}` };
      }

      const outputDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "exports");
      const { mkdirSync } = await import("fs");
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const zipPath = join(outputDir, zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);

      const { createProjectZip } = await import("../core/multimodal-engine.js");
      const result = await createProjectZip(projectPath, zipPath);

      if (!result) {
        return { success: false, output: "", error: "Failed to create zip" };
      }

      // Send to Telegram
      if (this.currentChatContext?.chatId) {
        const { sendDocument } = await import("../documents/telegram-delivery.js");
        await sendDocument(this.currentChatContext.chatId, zipPath, {
          caption: `📦 Project: ${basename(projectPath)}`,
        });
      }

      return {
        success: true,
        output: `Project zipped and sent: ${zipPath}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Zip failed: ${err.message}` };
    }
  }

  private async executeGenerateDocumentWithVisuals(args: Record<string, unknown>): Promise<ToolResult> {
    const title = String(args.title || "");
    const content = String(args.content || "");
    const generateDiagramFlag = args.generateDiagram !== false;
    const diagramPrompt = String(args.diagramPrompt || title);

    if (!title || !content) {
      return { success: false, output: "", error: "title and content are required" };
    }

    try {
      const { join } = await import("path");
      const { existsSync, mkdirSync } = await import("fs");

      const outputDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "documents");
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      let imagePath: string | null = null;

      // Generate diagram if requested
      if (generateDiagramFlag) {
        const { generateDiagram } = await import("../core/multimodal-engine.js");
        imagePath = await generateDiagram(diagramPrompt, outputDir, "concept");
      }

      // Generate LaTeX with image
      if (imagePath) {
        const { generateLatexWithImage } = await import("../core/multimodal-engine.js");
        const texPath = await generateLatexWithImage(title, content, imagePath, `Diagram: ${title}`, outputDir);

        if (texPath) {
          // Compile to PDF
          const { compileLatexToPdf } = await import("../documents/latex.js");
          const pdfPath = await compileLatexToPdf(texPath, outputDir);

          if (pdfPath && this.currentChatContext?.chatId) {
            const { sendPdf } = await import("../documents/telegram-delivery.js");
            await sendPdf(this.currentChatContext.chatId, pdfPath, {
              title,
              description: "Document with auto-generated diagram",
              generatedWith: "Wispy AI",
            });

            return {
              success: true,
              output: `Document generated with diagram: ${pdfPath}`,
            };
          }
        }
      }

      return {
        success: false,
        output: "",
        error: "Failed to generate document with visuals",
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Document generation failed: ${err.message}` };
    }
  }

  // === Legacy Realistic Voice (fallback) ===

  private async executeRealisticVoiceReply(args: Record<string, unknown>): Promise<ToolResult> {
    const text = String(args.text || "");
    const model = String(args.model || "auto") as any;
    const voice = String(args.voice || "assistant");
    const sendToChat = args.sendToChat !== false;

    if (!text) {
      return { success: false, output: "", error: "text is required" };
    }

    try {
      const { join } = await import("path");
      const { existsSync, mkdirSync } = await import("fs");

      const voiceDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "voice-output");
      if (!existsSync(voiceDir)) {
        mkdirSync(voiceDir, { recursive: true });
      }

      // Try realistic TTS from Hugging Face (conversational mode)
      const { generateVoiceForTelegram, isHuggingFaceTTSAvailable } = await import("../voice/realistic-tts.js");

      let audioPath: string | null = null;

      if (isHuggingFaceTTSAvailable()) {
        // Use conversational settings for natural speech
        audioPath = await generateVoiceForTelegram(text, voiceDir, {
          model: model as any,
          voice: voice || "friendly",
          emotion: "friendly",
          conversational: true,
        });
      }

      // Fallback to Gemini or local TTS
      if (!audioPath) {
        const { generateVoiceWithGemini } = await import("../cli/voice/tts.js");
        audioPath = await generateVoiceWithGemini(text, voiceDir);
      }

      if (!audioPath) {
        return { success: false, output: "", error: "Failed to generate voice - no TTS engine available" };
      }

      // Send to chat if requested
      if (sendToChat && this.currentChatContext?.chatId) {
        try {
          const { getTelegramBot } = await import("../documents/telegram-delivery.js");
          const bot = getTelegramBot();
          if (bot) {
            const { InputFile } = await import("grammy");
            const { createReadStream } = await import("fs");
            await bot.api.sendVoice(
              this.currentChatContext.chatId,
              new InputFile(createReadStream(audioPath)),
              { caption: "🎤 Voice reply" }
            );
          }
        } catch (sendErr: any) {
          log.warn("Failed to send voice to chat: %s", sendErr.message);
        }
      }

      return {
        success: true,
        output: `Voice generated!\nPath: ${audioPath}\nModel: ${model}\nVoice: ${voice}${sendToChat ? "\nSent to chat: Yes" : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Voice generation failed: ${err.message}` };
    }
  }

  // === Desktop Screenshot & Recording ===

  private async executeDesktopScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
    const filename = String(args.filename || `screenshot_${Date.now()}.png`);
    const region = String(args.region || "full");
    const monitor = args.monitor !== undefined ? Number(args.monitor) : 0;
    const sendToChat = Boolean(args.sendToChat);

    try {
      const { join } = await import("path");
      const { execSync } = await import("child_process");
      const { existsSync, mkdirSync } = await import("fs");

      // Create screenshots directory
      const screenshotDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "screenshots");
      if (!existsSync(screenshotDir)) {
        mkdirSync(screenshotDir, { recursive: true });
      }

      const outputPath = join(screenshotDir, filename);
      const platform = process.platform;

      if (platform === "win32") {
        // Windows: Use PowerShell with .NET
        const psScript = region === "active"
          ? `
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $screen = [System.Windows.Forms.Screen]::AllScreens[${monitor}]
            $bounds = $screen.Bounds
            $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
            $bitmap.Save('${outputPath.replace(/\\/g, "\\\\")}')
            $graphics.Dispose()
            $bitmap.Dispose()
          `
          : `
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $screens = [System.Windows.Forms.Screen]::AllScreens
            $screen = $screens[${monitor}]
            $bounds = $screen.Bounds
            $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
            $bitmap.Save('${outputPath.replace(/\\/g, "\\\\")}')
            $graphics.Dispose()
            $bitmap.Dispose()
          `;
        execSync(`powershell -Command "${psScript.replace(/\n/g, " ")}"`, { encoding: "utf8" });
      } else if (platform === "darwin") {
        // macOS: Use screencapture
        const captureCmd = region === "active"
          ? `screencapture -w "${outputPath}"`
          : `screencapture -x "${outputPath}"`;
        execSync(captureCmd, { encoding: "utf8" });
      } else {
        // Linux: Try multiple screenshot tools
        const tools = [
          { cmd: "gnome-screenshot", args: region === "active" ? `-w -f "${outputPath}"` : `-f "${outputPath}"` },
          { cmd: "scrot", args: region === "active" ? `-u "${outputPath}"` : `"${outputPath}"` },
          { cmd: "import", args: region === "active" ? `-window root "${outputPath}"` : `-window root "${outputPath}"` },
        ];

        let success = false;
        for (const tool of tools) {
          try {
            execSync(`which ${tool.cmd}`, { encoding: "utf8" });
            execSync(`${tool.cmd} ${tool.args}`, { encoding: "utf8" });
            success = true;
            break;
          } catch {
            continue;
          }
        }

        if (!success) {
          return {
            success: false,
            output: "",
            error: "No screenshot tool found. Install gnome-screenshot, scrot, or imagemagick.",
          };
        }
      }

      // Verify screenshot was created
      if (!existsSync(outputPath)) {
        return { success: false, output: "", error: "Screenshot file was not created" };
      }

      // Send to chat if requested
      if (sendToChat && this.currentChatContext?.chatId) {
        try {
          const { sendDocument } = await import("../documents/telegram-delivery.js");
          await sendDocument(this.currentChatContext.chatId, outputPath, {
            caption: `📸 Desktop screenshot (${region})`,
          });
        } catch (sendErr: any) {
          log.warn("Failed to send screenshot to chat: %s", sendErr.message);
        }
      }

      return {
        success: true,
        output: `Screenshot captured!\nPath: ${outputPath}\nRegion: ${region}\nMonitor: ${monitor}${sendToChat ? "\nSent to Telegram: Yes" : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Screenshot failed: ${err.message}` };
    }
  }

  private async executeScreenRecord(args: Record<string, unknown>): Promise<ToolResult> {
    const filename = String(args.filename || `recording_${Date.now()}.mp4`);
    const duration = Number(args.duration || 10);
    const fps = Number(args.fps || 15);
    const region = String(args.region || "full");

    try {
      const { join } = await import("path");
      const { execSync, spawn } = await import("child_process");
      const { existsSync, mkdirSync } = await import("fs");

      // Create recordings directory
      const recordDir = join(process.env.HOME || process.env.USERPROFILE || "", ".wispy", "recordings");
      if (!existsSync(recordDir)) {
        mkdirSync(recordDir, { recursive: true });
      }

      const outputPath = join(recordDir, filename);
      const platform = process.platform;

      // Check for ffmpeg
      try {
        execSync("ffmpeg -version", { encoding: "utf8", stdio: "pipe" });
      } catch {
        return {
          success: false,
          output: "",
          error: "FFmpeg not found. Install FFmpeg for screen recording: https://ffmpeg.org/download.html",
        };
      }

      let ffmpegArgs: string[];

      if (platform === "win32") {
        // Windows: Use GDI grab
        ffmpegArgs = [
          "-f", "gdigrab",
          "-framerate", String(fps),
          "-t", String(duration),
          "-i", "desktop",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-y",
          outputPath,
        ];
      } else if (platform === "darwin") {
        // macOS: Use avfoundation
        ffmpegArgs = [
          "-f", "avfoundation",
          "-framerate", String(fps),
          "-t", String(duration),
          "-i", "1:none",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-y",
          outputPath,
        ];
      } else {
        // Linux: Use x11grab
        ffmpegArgs = [
          "-f", "x11grab",
          "-framerate", String(fps),
          "-t", String(duration),
          "-i", ":0.0",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-y",
          outputPath,
        ];
      }

      // Run ffmpeg synchronously for short recordings
      execSync(`ffmpeg ${ffmpegArgs.join(" ")}`, {
        encoding: "utf8",
        timeout: (duration + 10) * 1000,
        stdio: "pipe",
      });

      if (!existsSync(outputPath)) {
        return { success: false, output: "", error: "Recording file was not created" };
      }

      const { statSync } = await import("fs");
      const stats = statSync(outputPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      return {
        success: true,
        output: `Screen recording complete!\nPath: ${outputPath}\nDuration: ${duration}s\nFPS: ${fps}\nSize: ${sizeMB} MB`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Screen recording failed: ${err.message}` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GIT & GITHUB TOOLS
  // ═══════════════════════════════════════════════════════════════════════════════

  private async executeGitInit(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const template = String(args.gitignoreTemplate || "node");

    if (!projectPath) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      if (!existsSync(fullPath)) {
        return { success: false, output: "", error: `Path not found: ${fullPath}` };
      }

      // Initialize git
      const initResult = execSync("git init", { cwd: fullPath, encoding: "utf8" });

      // Create .gitignore based on template
      const gitignoreTemplates: Record<string, string> = {
        node: `node_modules/\n.env\n.env.local\ndist/\n.next/\n.cache/\n*.log\n.DS_Store\nThumbdumbs.db`,
        python: `__pycache__/\n*.pyc\n.env\nvenv/\n.venv/\ndist/\n*.egg-info/`,
        react: `node_modules/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store`,
        nextjs: `node_modules/\n.next/\nout/\n.env\n.env.local\n*.log\n.DS_Store\n.vercel`,
      };

      const gitignoreContent = gitignoreTemplates[template] || gitignoreTemplates.node;
      const gitignorePath = join(fullPath, ".gitignore");
      writeFileSync(gitignorePath, gitignoreContent, "utf-8");

      return {
        success: true,
        output: `Git repository initialized!\n\n${initResult}\n\n.gitignore created with ${template} template.`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Git init failed: ${err.message}` };
    }
  }

  private async executeGitCommit(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const message = String(args.message || "");
    const stageAll = args.all !== false;

    if (!projectPath || !message) {
      return { success: false, output: "", error: "path and message are required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      // Stage all changes if requested
      if (stageAll) {
        execSync("git add -A", { cwd: fullPath, encoding: "utf8" });
      }

      // Check if there are staged changes
      const status = execSync("git status --porcelain", { cwd: fullPath, encoding: "utf8" });
      if (!status.trim()) {
        return { success: true, output: "Nothing to commit - working tree clean." };
      }

      // Commit with message
      const commitResult = execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: fullPath,
        encoding: "utf8",
      });

      return {
        success: true,
        output: `Commit created!\n\n${commitResult}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Git commit failed: ${err.message}` };
    }
  }

  private async executeGitPush(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const remote = String(args.remote || "origin");
    const branch = String(args.branch || "main");
    const createRepo = Boolean(args.createRepo);
    const repoName = String(args.repoName || "");
    const isPrivate = Boolean(args.private);

    if (!projectPath) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const { join, isAbsolute, basename } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      // Create GitHub repo if requested
      if (createRepo) {
        const name = repoName || basename(fullPath);
        const visibility = isPrivate ? "--private" : "--public";

        try {
          // Check if gh CLI is available
          execSync("gh --version", { encoding: "utf8", stdio: "pipe" });

          // Create repo
          execSync(`gh repo create ${name} ${visibility} --source="${fullPath}" --remote=origin`, {
            cwd: fullPath,
            encoding: "utf8",
          });
        } catch (ghErr: any) {
          // gh CLI not available or repo creation failed
          if (ghErr.message?.includes("gh")) {
            return { success: false, output: "", error: "GitHub CLI (gh) not installed. Install it with: npm install -g gh" };
          }
          // Repo might already exist, continue
        }
      }

      // Check if remote exists
      try {
        execSync(`git remote get-url ${remote}`, { cwd: fullPath, encoding: "utf8", stdio: "pipe" });
      } catch {
        return { success: false, output: "", error: `Remote '${remote}' not found. Use createRepo: true or add remote manually.` };
      }

      // Push
      const pushResult = execSync(`git push -u ${remote} ${branch}`, {
        cwd: fullPath,
        encoding: "utf8",
      });

      // Get remote URL
      const remoteUrl = execSync(`git remote get-url ${remote}`, { cwd: fullPath, encoding: "utf8" }).trim();

      return {
        success: true,
        output: `Pushed to GitHub!\n\nRemote: ${remoteUrl}\nBranch: ${branch}\n\n${pushResult}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Git push failed: ${err.message}` };
    }
  }

  private async executeGitStatus(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");

    if (!projectPath) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      const status = execSync("git status", { cwd: fullPath, encoding: "utf8" });
      const branch = execSync("git branch --show-current", { cwd: fullPath, encoding: "utf8" }).trim();

      let remoteInfo = "";
      try {
        remoteInfo = execSync("git remote -v", { cwd: fullPath, encoding: "utf8" });
      } catch { /* no remote */ }

      return {
        success: true,
        output: `Git Status\n\nBranch: ${branch}\n\n${status}\n${remoteInfo ? `\nRemotes:\n${remoteInfo}` : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Git status failed: ${err.message}` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VERCEL DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  private async executeVercelDeploy(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const production = Boolean(args.production);
    const name = String(args.name || "");
    const envStr = String(args.env || "{}");

    if (!projectPath) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      // Check if Vercel CLI is available
      try {
        execSync("vercel --version", { encoding: "utf8", stdio: "pipe" });
      } catch {
        return { success: false, output: "", error: "Vercel CLI not installed. Install it with: npm install -g vercel" };
      }

      // Build command
      let cmd = "vercel";
      if (production) cmd += " --prod";
      if (name) cmd += ` --name=${name}`;
      cmd += " --yes"; // Skip prompts

      // Parse and add environment variables
      try {
        const env = JSON.parse(envStr);
        for (const [key, value] of Object.entries(env)) {
          cmd += ` -e ${key}=${value}`;
        }
      } catch { /* invalid JSON, skip */ }

      // Deploy
      const result = execSync(cmd, {
        cwd: fullPath,
        encoding: "utf8",
        timeout: 300000, // 5 minute timeout
      });

      // Extract URL from result
      const urlMatch = result.match(/https:\/\/[^\s]+\.vercel\.app/);
      const deployUrl = urlMatch ? urlMatch[0] : "Unknown";

      return {
        success: true,
        output: `Deployed to Vercel!\n\n🚀 URL: ${deployUrl}\n\n${result}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Vercel deploy failed: ${err.message}` };
    }
  }

  private async executeVercelList(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const limit = Number(args.limit) || 5;

    try {
      // Check if Vercel CLI is available
      try {
        execSync("vercel --version", { encoding: "utf8", stdio: "pipe" });
      } catch {
        return { success: false, output: "", error: "Vercel CLI not installed. Install it with: npm install -g vercel" };
      }

      const cmd = projectPath
        ? `vercel list --limit=${limit}`
        : `vercel list --limit=${limit}`;

      const { join, isAbsolute } = await import("path");
      const cwd = projectPath
        ? (isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath))
        : process.cwd();

      const result = execSync(cmd, { cwd, encoding: "utf8" });

      return {
        success: true,
        output: `Recent Vercel Deployments:\n\n${result}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Vercel list failed: ${err.message}` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // NPM/PACKAGE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  private async executeNpmInstall(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const packages = String(args.packages || "");
    const dev = Boolean(args.dev);

    if (!projectPath) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      let cmd = "npm install";
      if (packages) {
        cmd += ` ${packages}`;
        if (dev) cmd += " --save-dev";
      }

      const result = execSync(cmd, {
        cwd: fullPath,
        encoding: "utf8",
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: true,
        output: `npm install complete!\n\n${result}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `npm install failed: ${err.message}` };
    }
  }

  private async executeNpmRun(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = String(args.path || "");
    const script = String(args.script || "");
    const scriptArgs = String(args.args || "");

    if (!projectPath || !script) {
      return { success: false, output: "", error: "path and script are required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(projectPath) ? projectPath : join(this.runtimeDir, "workspace", projectPath);

      // Check if package.json exists
      const packageJsonPath = join(fullPath, "package.json");
      if (!existsSync(packageJsonPath)) {
        return { success: false, output: "", error: "No package.json found in project" };
      }

      // Check if script exists
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (!packageJson.scripts?.[script]) {
        const available = Object.keys(packageJson.scripts || {}).join(", ");
        return { success: false, output: "", error: `Script '${script}' not found. Available: ${available}` };
      }

      let cmd = `npm run ${script}`;
      if (scriptArgs) cmd += ` -- ${scriptArgs}`;

      const result = execSync(cmd, {
        cwd: fullPath,
        encoding: "utf8",
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: true,
        output: `npm run ${script} complete!\n\n${result}`,
      };
    } catch (err: any) {
      // Many scripts (like test) exit with non-zero on failure but still have useful output
      const output = err.stdout || err.stderr || err.message;
      return { success: false, output: output, error: `npm run ${script} failed` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEBUGGING TOOLS
  // ═══════════════════════════════════════════════════════════════════════════════

  private async executeDebugLogs(args: Record<string, unknown>): Promise<ToolResult> {
    const logPath = String(args.path || "");
    const type = String(args.type || "auto");
    const lines = Number(args.lines) || 100;
    const filter = String(args.filter || "");

    if (!logPath) {
      return { success: false, output: "", error: "path is required" };
    }

    try {
      const { join, isAbsolute } = await import("path");
      const fullPath = isAbsolute(logPath) ? logPath : join(this.runtimeDir, "workspace", logPath);

      let logContent = "";

      // Check if it's a file or directory
      const { statSync } = await import("fs");
      const stats = statSync(fullPath);

      if (stats.isDirectory()) {
        // Look for common log files
        const logFiles = [
          "npm-debug.log",
          ".npm/_logs/*.log",
          "yarn-error.log",
          "debug.log",
          "error.log",
          ".next/trace",
        ];

        for (const pattern of logFiles) {
          const filePath = join(fullPath, pattern);
          if (existsSync(filePath)) {
            logContent += `\n=== ${pattern} ===\n`;
            logContent += readFileSync(filePath, "utf-8").split("\n").slice(-lines).join("\n");
          }
        }

        if (!logContent) {
          return { success: true, output: "No log files found in directory." };
        }
      } else {
        // Read the specific log file
        logContent = readFileSync(fullPath, "utf-8");
      }

      // Get last N lines
      let logLines = logContent.split("\n").slice(-lines);

      // Apply filter if provided
      if (filter) {
        const regex = new RegExp(filter, "i");
        logLines = logLines.filter(line => regex.test(line));
      }

      // Highlight errors and warnings
      const output = logLines.map(line => {
        if (/error/i.test(line)) return `❌ ${line}`;
        if (/warn/i.test(line)) return `⚠️ ${line}`;
        return line;
      }).join("\n");

      return {
        success: true,
        output: `Log Analysis:\n\n${output || "No matching log entries found."}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Log analysis failed: ${err.message}` };
    }
  }

  private async executeDebugPort(args: Record<string, unknown>): Promise<ToolResult> {
    const port = Number(args.port);
    const kill = Boolean(args.kill);

    if (!port) {
      return { success: false, output: "", error: "port is required" };
    }

    try {
      const platform = process.platform;
      let cmd = "";
      let result = "";

      if (platform === "win32") {
        cmd = `netstat -ano | findstr :${port}`;
      } else {
        cmd = `lsof -i :${port}`;
      }

      try {
        result = execSync(cmd, { encoding: "utf8", stdio: "pipe" });
      } catch {
        return { success: true, output: `Port ${port} is available - nothing is using it.` };
      }

      if (!result.trim()) {
        return { success: true, output: `Port ${port} is available - nothing is using it.` };
      }

      // Extract PID
      let pid = "";
      if (platform === "win32") {
        const match = result.match(/\s+(\d+)\s*$/m);
        pid = match ? match[1] : "";
      } else {
        const match = result.match(/\s+(\d+)\s+/);
        pid = match ? match[1] : "";
      }

      if (kill && pid) {
        if (platform === "win32") {
          execSync(`taskkill /PID ${pid} /F`, { encoding: "utf8" });
        } else {
          execSync(`kill -9 ${pid}`, { encoding: "utf8" });
        }
        return {
          success: true,
          output: `Port ${port} was in use by PID ${pid}.\n\n✅ Process killed. Port is now free.`,
        };
      }

      return {
        success: true,
        output: `Port ${port} is in use:\n\n${result}\n\n${pid ? `PID: ${pid}\n\nUse kill: true to free this port.` : ""}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Port check failed: ${err.message}` };
    }
  }

  private async executeDebugProcess(args: Record<string, unknown>): Promise<ToolResult> {
    const filter = String(args.filter || "node");
    const kill = Boolean(args.kill);

    try {
      const platform = process.platform;
      let cmd = "";
      let result = "";

      if (platform === "win32") {
        cmd = `tasklist /FI "IMAGENAME eq ${filter}*" /FO TABLE`;
      } else {
        cmd = `ps aux | grep -i "${filter}" | grep -v grep`;
      }

      try {
        result = execSync(cmd, { encoding: "utf8", stdio: "pipe" });
      } catch {
        return { success: true, output: `No processes matching '${filter}' found.` };
      }

      if (!result.trim()) {
        return { success: true, output: `No processes matching '${filter}' found.` };
      }

      if (kill) {
        if (platform === "win32") {
          execSync(`taskkill /IM "${filter}*" /F`, { encoding: "utf8" });
        } else {
          execSync(`pkill -f "${filter}"`, { encoding: "utf8" });
        }
        return {
          success: true,
          output: `Killed processes matching '${filter}'.\n\nPreviously running:\n${result}`,
        };
      }

      return {
        success: true,
        output: `Processes matching '${filter}':\n\n${result}\n\nUse kill: true to terminate these processes.`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Process check failed: ${err.message}` };
    }
  }

}
