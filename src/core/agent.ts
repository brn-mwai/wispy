import { generate, generateStream, type GenerateOptions } from "../ai/gemini.js";
import { routeTask, type TaskType } from "../ai/router.js";
import { buildSystemPrompt } from "../ai/prompts.js";
import { getToolDeclarations } from "../ai/tools.js";
import { inferThinkingLevel } from "./thinking.js";
import {
  getOrCreateSession,
  appendMessage,
  loadHistory,
  clearHistory,
  type SessionMessage,
} from "./session.js";
import { ToolExecutor, type ToolCall, type ToolResult } from "../agents/tool-executor.js";
import { MemoryManager } from "../memory/manager.js";
import { sanitizeOutput } from "../security/api-key-guard.js";
import { appendDailyNote } from "./memory.js";
import { TokenManager } from "../token/estimator.js";
import type { IntegrationRegistry } from "../integrations/registry.js";
import type { McpRegistry } from "../mcp/client.js";
import type { SkillManifest } from "../skills/loader.js";
import type { ToolDeclaration } from "../ai/tools.js";
import type { SessionType } from "../security/isolation.js";
import type { WispyConfig } from "../config/schema.js";
import type { CronService } from "../cron/service.js";
import type { ReminderService } from "../cron/reminders.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("agent");

// Increased to 200 for autonomous webapp generation + follow-up tasks + debugging
// Each tool call = one file write, one bash command, etc.
// Complex projects need 15-25 tool calls, follow-ups + debugging need more
// Marathon mode and persistent conversations require high limits
// This prevents "Reached maximum tool execution steps" errors
const MAX_TOOL_LOOPS = 200;

export interface AgentContext {
  config: WispyConfig;
  runtimeDir: string;
  soulDir: string;
}

export interface AgentResponse {
  text: string;
  thinking?: string;
  toolCalls?: unknown[];
  toolResults?: ToolResult[];
}

export type AgentMode = "execute" | "plan";

const READ_ONLY_TOOLS = new Set([
  "file_read", "memory_search", "list_directory", "file_search",
  "web_fetch", "web_search",
]);

// Max context tokens to use (leave room for output)
const MAX_CONTEXT_TOKENS = 100_000;
// Auto-compact when context exceeds this percentage
const AUTO_COMPACT_THRESHOLD = 0.75;

export type ContextEventCallback = (event: "compacting" | "compacted", info?: string) => void;

export class Agent {
  private ctx: AgentContext;
  private toolExecutor: ToolExecutor;
  private memoryManager: MemoryManager;
  private tokenManager: TokenManager;
  private integrationRegistry?: IntegrationRegistry;
  private mcpRegistry?: McpRegistry;
  private cronService?: CronService;
  private reminderService?: ReminderService;
  private skills: SkillManifest[] = [];
  private mode: AgentMode = "execute";
  private contextEventCallback?: ContextEventCallback;

  constructor(ctx: AgentContext) {
    this.ctx = ctx;
    this.memoryManager = new MemoryManager(ctx.runtimeDir, ctx.config);
    this.tokenManager = new TokenManager();
    this.toolExecutor = new ToolExecutor(
      ctx.config,
      ctx.runtimeDir,
      ctx.soulDir,
      this.memoryManager
    );
  }

  /**
   * Attach an integration registry (loaded externally).
   * Updates the tool executor to route integration tools.
   */
  setIntegrationRegistry(registry: IntegrationRegistry): void {
    this.integrationRegistry = registry;
    this.rebuildToolExecutor();
  }

  getIntegrationRegistry(): IntegrationRegistry | undefined {
    return this.integrationRegistry;
  }

  /**
   * Attach an MCP registry for external MCP server tools.
   */
  setMcpRegistry(registry: McpRegistry): void {
    this.mcpRegistry = registry;
    this.rebuildToolExecutor();
  }

  getMcpRegistry(): McpRegistry | undefined {
    return this.mcpRegistry;
  }

  /**
   * Attach a cron service for scheduling tasks.
   */
  setCronService(cronService: CronService): void {
    this.cronService = cronService;
    this.toolExecutor.setCronService(cronService);
  }

  getCronService(): CronService | undefined {
    return this.cronService;
  }

  /**
   * Attach a reminder service for one-time reminders.
   */
  setReminderService(reminderService: ReminderService): void {
    this.reminderService = reminderService;
    this.toolExecutor.setReminderService(reminderService);
  }

  getReminderService(): ReminderService | undefined {
    return this.reminderService;
  }

  /**
   * Attach loaded skills so their tools are exposed to Gemini.
   */
  setSkills(skills: SkillManifest[]): void {
    this.skills = skills;
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
  }

  /**
   * Hot-swap config — used by /model and /vertex to change models without restart.
   */
  updateConfig(config: WispyConfig): void {
    this.ctx = { ...this.ctx, config };
  }

  getMode(): AgentMode {
    return this.mode;
  }

  /**
   * Set chat context for image sending (used by Telegram/WhatsApp)
   */
  setChatContext(ctx: {
    channel: string;
    peerId: string;
    chatId?: string;
    sendImage?: (path: string, caption?: string) => Promise<void>;
  }): void {
    this.toolExecutor.setChatContext(ctx);
  }

  /**
   * Set callback for context events (compaction notifications).
   */
  onContextEvent(callback: ContextEventCallback): void {
    this.contextEventCallback = callback;
  }

  /**
   * Check context usage and auto-compact if needed.
   * Returns true if compaction was performed.
   */
  private async autoCompactIfNeeded(
    agentId: string,
    sessionKey: string,
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string
  ): Promise<{ compacted: boolean; messages: Array<{ role: string; content: string }> }> {
    const { config, runtimeDir } = this.ctx;

    // Estimate current context size
    const systemTokens = this.tokenManager.estimateTokens(systemPrompt);
    let messageTokens = 0;
    for (const m of messages) {
      messageTokens += this.tokenManager.estimateTokens(m.content) + 4;
    }
    const totalTokens = systemTokens + messageTokens;
    const usageRatio = totalTokens / MAX_CONTEXT_TOKENS;

    // If under threshold, no action needed
    if (usageRatio < AUTO_COMPACT_THRESHOLD || messages.length < 10) {
      return { compacted: false, messages };
    }

    log.info("Auto-compacting context: %d%% used (%d tokens)", Math.round(usageRatio * 100), totalTokens);
    this.contextEventCallback?.("compacting");

    try {
      // Keep recent 30% of messages
      const keepCount = Math.max(Math.floor(messages.length * 0.3), 4);
      const toSummarize = messages.slice(0, messages.length - keepCount);
      const toKeep = messages.slice(-keepCount);

      // Summarize older messages
      const summaryPrompt = `Summarize this conversation concisely, preserving key facts, decisions, user preferences, and context needed to continue:\n\n` +
        toSummarize.map((m) => `${m.role}: ${m.content.slice(0, 500)}`).join("\n\n");

      const result = await generate({
        model: config.gemini.models.flash,
        messages: [{ role: "user", content: summaryPrompt }],
        thinkingLevel: "minimal",
      });

      // Clear and rebuild history
      clearHistory(runtimeDir, agentId, sessionKey);

      // Add summary as first message
      appendMessage(runtimeDir, agentId, sessionKey, {
        role: "model",
        content: `[Context Summary]\n${result.text}`,
        timestamp: new Date().toISOString(),
      });

      // Re-add recent messages
      for (const m of toKeep) {
        appendMessage(runtimeDir, agentId, sessionKey, {
          role: m.role as "user" | "model",
          content: m.content,
          timestamp: new Date().toISOString(),
        });
      }

      const newMessages = [
        { role: "model" as const, content: `[Context Summary]\n${result.text}` },
        ...toKeep.map(m => ({ role: m.role as "user" | "model", content: m.content })),
      ];

      this.contextEventCallback?.("compacted", `${toSummarize.length} messages → summary`);
      log.info("Auto-compact complete: %d messages summarized, %d kept", toSummarize.length, keepCount);

      return { compacted: true, messages: newMessages };
    } catch (err) {
      log.error({ err }, "Auto-compact failed");
      return { compacted: false, messages };
    }
  }

  private rebuildToolExecutor(): void {
    this.toolExecutor = new ToolExecutor(
      this.ctx.config,
      this.ctx.runtimeDir,
      this.ctx.soulDir,
      this.memoryManager,
      this.integrationRegistry,
      this.mcpRegistry
    );
  }

  /**
   * Build tool declarations from all sources: built-in, skills, MCP, integrations.
   */
  private buildToolDeclarations(): unknown[] {
    const skillTools: ToolDeclaration[] = this.skills.flatMap((s) =>
      s.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as ToolDeclaration["parameters"],
      }))
    );

    const mcpTools: ToolDeclaration[] = (this.mcpRegistry?.getAllTools() || []).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: (t.inputSchema || { type: "object", properties: {} }) as ToolDeclaration["parameters"],
    }));

    const integrationTools: ToolDeclaration[] =
      this.integrationRegistry?.getToolDeclarations?.() || [];

    const allTools = getToolDeclarations(true, skillTools, mcpTools, integrationTools);

    if (this.mode === "plan") {
      // Filter to read-only tools only
      const filtered = (allTools[0] as any)?.functionDeclarations?.filter(
        (t: any) => READ_ONLY_TOOLS.has(t.name)
      ) || [];
      return [{ functionDeclarations: filtered }];
    }

    return allTools;
  }

  /**
   * Build a context string describing available integrations so the model
   * knows what services/tools it can use (like Meltbot/Clawdbot awareness).
   */
  private buildIntegrationContext(): string | undefined {
    if (!this.integrationRegistry || this.integrationRegistry.size === 0) return undefined;

    const status = this.integrationRegistry.getStatus();
    const enabled = status.filter((s) => s.status === "active");
    const available = status.filter((s) => s.status !== "active");

    const lines: string[] = ["## Available Integrations\n"];

    if (enabled.length > 0) {
      lines.push("**Enabled (ready to use):**");
      for (const s of enabled) {
        lines.push(`- ${s.name} (${s.category}) — ${s.tools} tool(s)`);
      }
    }

    if (available.length > 0) {
      lines.push("\n**Available (not yet enabled):**");
      for (const s of available) {
        const note = s.status === "auth-required" ? " [needs auth]" : "";
        lines.push(`- ${s.name} (${s.category})${note}`);
      }
    }

    lines.push(
      "\nYou can use enabled integrations directly via their tools. " +
      "If a user asks about a disabled integration, let them know it exists " +
      "and can be enabled with `/integrations`."
    );

    return lines.join("\n");
  }

  // Marathon service reference for NLP
  private marathonService?: any;
  private apiKey?: string;

  /**
   * Set marathon service for NLP-based control
   */
  setMarathonService(service: any, apiKey: string): void {
    this.marathonService = service;
    this.apiKey = apiKey;
  }

  async chat(
    userMessage: string,
    peerId: string,
    channel: string,
    sessionType: SessionType = "main"
  ): Promise<AgentResponse> {
    const { config, runtimeDir, soulDir } = this.ctx;
    const agentId = config.agent.id;

    // === Context Isolation ===
    // Detect task boundaries and prevent context bleeding
    const { processWithIsolation, cancelTask, isTaskCancelled } = await import("./context-isolator.js");
    const { task, contextPrompt, isNewTask } = processWithIsolation(userMessage, peerId, channel);

    // Check for cancellation requests
    const lowerMsg = userMessage.toLowerCase();
    const cancelPhrases = ["stop", "cancel", "halt", "abort", "quit that", "forget it", "never mind"];
    const isCancel = cancelPhrases.some(p => lowerMsg.includes(p));
    if (isCancel) {
      cancelTask(peerId, channel);
      log.info("Task cancelled by user: %s", task.id);
      return {
        text: "Got it! I've stopped what I was doing. What would you like me to help you with now?",
      };
    }

    if (isNewTask) {
      log.info("New task started: %s - %s", task.id, task.topic);
    }

    // NLP-based marathon control (natural language interface)
    if (this.marathonService && this.apiKey) {
      try {
        const { handleMarathonNLP, mightBeMarathonRelated } = await import("../marathon/nlp-controller.js");

        // Quick pre-filter to avoid unnecessary processing
        if (mightBeMarathonRelated(userMessage)) {
          const nlpResult = await handleMarathonNLP(
            userMessage,
            peerId,
            this.marathonService,
            this,
            this.apiKey
          );

          if (nlpResult.handled && nlpResult.response) {
            // Save NLP interaction to history
            const session = getOrCreateSession(runtimeDir, agentId, sessionType, peerId, channel);
            appendMessage(runtimeDir, agentId, session.sessionKey, {
              role: "user",
              content: userMessage,
              timestamp: new Date().toISOString(),
              channel,
              peerId,
            });
            appendMessage(runtimeDir, agentId, session.sessionKey, {
              role: "model",
              content: nlpResult.response,
              timestamp: new Date().toISOString(),
            });

            return { text: nlpResult.response };
          }
        }
      } catch (err) {
        log.debug("NLP handler error (continuing to normal flow): %s", err);
      }
    }

    // Get or create session
    const session = getOrCreateSession(runtimeDir, agentId, sessionType, peerId, channel);

    // Save user message
    appendMessage(runtimeDir, agentId, session.sessionKey, {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
      channel,
      peerId,
    });

    // Build conversation history (limited to recent messages)
    const history = loadHistory(runtimeDir, agentId, session.sessionKey, 40);
    const rawMessages: Array<{ role: "user" | "model"; content: string }> = history.map((m) => ({
      role: m.role as "user" | "model",
      content: m.content,
    }));

    const thinkingLevel = inferThinkingLevel(userMessage);
    const route = routeTask("reasoning", config);
    const integrationCtx = this.buildIntegrationContext();
    const baseSystemPrompt = buildSystemPrompt(soulDir, sessionType, undefined, integrationCtx);

    // Add context isolation to prevent task bleeding
    const systemPrompt = `${baseSystemPrompt}\n\n${contextPrompt}`;

    // Auto-compact if context is getting full
    const compactResult = await this.autoCompactIfNeeded(agentId, session.sessionKey, rawMessages, systemPrompt);

    // Apply context windowing to prevent overflow
    const systemTokens = this.tokenManager.estimateTokens(systemPrompt);
    const messages = this.tokenManager.windowMessages(
      compactResult.compacted ? compactResult.messages : rawMessages,
      MAX_CONTEXT_TOKENS,
      systemTokens
    ) as Array<{ role: "user" | "model"; content: string }>;

    log.info(
      "Chat [%s] model=%s thinking=%s",
      session.sessionKey.slice(0, 30),
      route.model,
      thinkingLevel
    );

    // Agentic loop — generate, execute tools, feed results back, repeat
    let allToolResults: ToolResult[] = [];
    let finalText = "";
    let finalThinking: string | undefined;
    let loopCount = 0;

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      const result = await generate({
        model: route.model,
        systemPrompt,
        messages,
        tools: this.buildToolDeclarations(),
        thinkingLevel,
      });

      finalThinking = result.thinking;

      // If no tool calls, we have our final response
      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalText = result.text;
        break;
      }

      // Execute tool calls
      log.info("Agent requested %d tool call(s), loop %d", result.toolCalls.length, loopCount);

      const toolResults: string[] = [];
      for (const tc of result.toolCalls) {
        const call = tc as { name: string; args: Record<string, unknown> };
        const toolResult = await this.toolExecutor.execute(call);
        allToolResults.push(toolResult);
        toolResults.push(
          `Tool: ${call.name}\nResult: ${toolResult.success ? toolResult.output : "ERROR: " + toolResult.error}`
        );
        log.info("Tool %s: %s", call.name, toolResult.success ? "OK" : "FAIL");
      }

      // Add the model's partial response + tool results back into the conversation
      if (result.text) {
        messages.push({ role: "model", content: result.text });
      }
      // Format tool results clearly for all models to understand
      const resultText = toolResults.map((r, i) => {
        return `## Tool Result ${i + 1}\n${r}`;
      }).join("\n\n");
      messages.push({
        role: "user",
        content: `[TOOL EXECUTION COMPLETE]\n\n${resultText}\n\nPlease analyze the results and continue. If you need to use another tool, respond with the JSON format. If you're done, provide your final response to the user.`,
      });

      // If there was text alongside tools, that might be intermediate thinking
      if (result.text) {
        finalText = result.text;
      }
    }

    if (loopCount >= MAX_TOOL_LOOPS) {
      log.warn("Max tool loops reached (%d)", MAX_TOOL_LOOPS);
      finalText += "\n\n(Reached maximum tool execution steps)";
    }

    const safeText = sanitizeOutput(finalText);

    // Save agent response
    appendMessage(runtimeDir, agentId, session.sessionKey, {
      role: "model",
      content: safeText,
      timestamp: new Date().toISOString(),
      thinking: finalThinking,
    });

    // Index conversation in memory
    try {
      await this.memoryManager.addMemory(
        `User: ${userMessage}\nAgent: ${safeText.slice(0, 500)}`,
        "session",
        session.sessionKey
      );
    } catch { /* non-fatal */ }

    return {
      text: safeText,
      thinking: finalThinking,
      toolCalls: allToolResults.length > 0 ? allToolResults : undefined,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
    };
  }

  async *chatStream(
    userMessage: string,
    peerId: string,
    channel: string,
    sessionType: SessionType = "main",
    options?: { images?: Array<{ mimeType: string; data: string }> }
  ): AsyncGenerator<{ type: string; content: string }> {
    const { config, runtimeDir, soulDir } = this.ctx;
    const agentId = config.agent.id;

    const session = getOrCreateSession(runtimeDir, agentId, sessionType, peerId, channel);

    appendMessage(runtimeDir, agentId, session.sessionKey, {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
      channel,
      peerId,
    });

    const history = loadHistory(runtimeDir, agentId, session.sessionKey, 40);
    const rawMessages = history.map((m) => ({
      role: m.role as "user" | "model",
      content: m.content,
    }));

    const thinkingLevel = inferThinkingLevel(userMessage);
    const route = routeTask("reasoning", config);
    const integrationCtx = this.buildIntegrationContext();
    const systemPrompt = buildSystemPrompt(soulDir, sessionType, undefined, integrationCtx);

    // Auto-compact if context is getting full
    const compactResult = await this.autoCompactIfNeeded(agentId, session.sessionKey, rawMessages, systemPrompt);
    if (compactResult.compacted) {
      yield { type: "context_compacted", content: "Context auto-compacted" };
    }

    // Apply context windowing
    const systemTokens = this.tokenManager.estimateTokens(systemPrompt);
    const messages = this.tokenManager.windowMessages(
      compactResult.compacted ? compactResult.messages : rawMessages,
      MAX_CONTEXT_TOKENS,
      systemTokens
    ) as Array<{ role: "user" | "model"; content: string }>;

    let fullText = "";
    let loopCount = 0;

    // Agentic loop with tool support
    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      yield { type: "thinking", content: "" };

      const result = await generate({
        model: route.model,
        systemPrompt,
        messages,
        tools: this.buildToolDeclarations(),
        thinkingLevel,
        // Only attach images on the first loop iteration
        images: loopCount === 1 ? options?.images : undefined,
      });

      if (result.thinking) {
        yield { type: "thinking", content: result.thinking };
      }

      // If tool calls, execute them and loop
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolResults: string[] = [];

        for (const tc of result.toolCalls) {
          const call = tc as { name: string; args: Record<string, unknown> };
          yield { type: "tool_call", content: call.name };

          const toolResult = await this.toolExecutor.execute(call);
          const resultText = toolResult.success ? toolResult.output : "ERROR: " + toolResult.error;
          yield { type: "tool_result", content: resultText };

          toolResults.push(`Tool: ${call.name}\nResult: ${resultText}`);
        }

        if (result.text) {
          messages.push({ role: "model", content: result.text });
        }
        // Format tool results clearly for all models to understand
        const resultText = toolResults.map((r, i) => {
          return `## Tool Result ${i + 1}\n${r}`;
        }).join("\n\n");
        messages.push({
          role: "user",
          content: `[TOOL EXECUTION COMPLETE]\n\n${resultText}\n\nPlease analyze the results and continue. If you need to use another tool, respond with the JSON format. If you're done, provide your final response to the user.`,
        });
        continue;
      }

      // No tool calls — stream final text
      if (result.text) {
        fullText = result.text;
        // Yield text in chunks for streaming feel
        const words = result.text.split(" ");
        for (let i = 0; i < words.length; i++) {
          yield { type: "text", content: (i > 0 ? " " : "") + words[i] };
        }
      }
      break;
    }

    if (loopCount >= MAX_TOOL_LOOPS) {
      const msg = "\n\n(Reached maximum tool execution steps)";
      fullText += msg;
      yield { type: "text", content: msg };
    }

    yield { type: "done", content: "" };

    appendMessage(runtimeDir, agentId, session.sessionKey, {
      role: "model",
      content: sanitizeOutput(fullText),
      timestamp: new Date().toISOString(),
    });

    this.memoryManager.addMemory(
      `User: ${userMessage}\nAgent: ${fullText.slice(0, 500)}`,
      "session",
      session.sessionKey
    ).catch(() => {});
  }

  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }
}
