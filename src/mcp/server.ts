import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";
import { loadEnv } from "../infra/dotenv.js";
import { loadConfig } from "../config/config.js";
import { initGemini } from "../ai/gemini.js";
import { Agent } from "../core/agent.js";
import { runBoot } from "../gateway/boot.js";
import { MemoryManager } from "../memory/manager.js";
import { loadSkills } from "../skills/loader.js";
import { McpRegistry } from "../mcp/client.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("mcp-server");

export async function startMcpServer(rootDir: string) {
  const runtimeDir = resolve(rootDir, ".wispy");
  const soulDir = resolve(rootDir, "wispy");

  loadEnv(rootDir);
  await runBoot({ rootDir, runtimeDir, soulDir });

  const config = loadConfig(runtimeDir);

  // Support both Vertex AI and API key
  const vertexConfig = config.gemini?.vertexai;
  if (vertexConfig?.enabled) {
    const project = vertexConfig.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    const location = vertexConfig.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    if (!project) {
      log.error("Vertex AI enabled but project not set");
      process.exit(1);
    }
    initGemini({ vertexai: true, project, location });
    log.info("Using Vertex AI (project: %s)", project);
  } else {
    const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      log.error("GEMINI_API_KEY not set");
      process.exit(1);
    }
    initGemini(apiKey);
  }

  const agent = new Agent({ config, runtimeDir, soulDir });
  const memoryManager = new MemoryManager(runtimeDir, config);

  // Wire skills into agent
  const skills = loadSkills(soulDir);
  if (skills.length > 0) agent.setSkills(skills);

  // Wire MCP servers (external tools)
  const mcpRegistry = new McpRegistry(runtimeDir);
  await mcpRegistry.startAll();
  const mcpStatus = mcpRegistry.getStatus();
  if (mcpStatus.length > 0) agent.setMcpRegistry(mcpRegistry);

  const server = new McpServer({
    name: "wispy",
    version: "1.1.0",
  });

  // ═══ Core Tools ═══════════════════════════════════════════════

  server.tool(
    "wispy_chat",
    "Send a message to the Wispy AI agent and get a streaming response. Wispy has access to tools for file operations, web search, code execution, and more.",
    { message: z.string(), session: z.string().optional() },
    async ({ message, session }) => {
      const result = await agent.chat(message, "mcp-user", "antigravity", "main");
      return { content: [{ type: "text" as const, text: result.text }] };
    }
  );

  server.tool(
    "wispy_chat_with_image",
    "Send a message with an image to Wispy for multimodal analysis. Provide base64-encoded image data.",
    {
      message: z.string(),
      imageBase64: z.string(),
      mimeType: z.string().default("image/png"),
    },
    async ({ message, imageBase64, mimeType }) => {
      const images = [{ mimeType, data: imageBase64 }];
      const result = await agent.chat(message, "mcp-user", "antigravity", "main");
      return { content: [{ type: "text" as const, text: result.text }] };
    }
  );

  // ═══ Memory Tools ═════════════════════════════════════════════

  server.tool(
    "wispy_memory_search",
    "Search Wispy's semantic memory for relevant information",
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit }) => {
      const results = await memoryManager.search(query, limit || 5);
      const text = results.map((r) => `[${r.score.toFixed(2)}] ${r.text}`).join("\n");
      return { content: [{ type: "text" as const, text: text || "No results found." }] };
    }
  );

  server.tool(
    "wispy_memory_save",
    "Save a fact or note to Wispy's persistent memory",
    { text: z.string(), source: z.string().optional() },
    async ({ text, source }) => {
      await memoryManager.addMemory(text, source || "antigravity", "mcp-user");
      return { content: [{ type: "text" as const, text: "Saved to memory." }] };
    }
  );

  // ═══ File Tools ═══════════════════════════════════════════════

  server.tool(
    "wispy_file_read",
    "Read a file's contents",
    { path: z.string() },
    async ({ path }) => {
      const { readFileSync } = await import("fs");
      try {
        const content = readFileSync(path, "utf8");
        return { content: [{ type: "text" as const, text: content.slice(0, 10000) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_file_write",
    "Write content to a file (creates directories if needed)",
    { path: z.string(), content: z.string() },
    async ({ path, content }) => {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { dirname } = await import("path");
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf8");
        return { content: [{ type: "text" as const, text: `Written to ${path}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_file_list",
    "List files in a directory",
    { path: z.string(), recursive: z.boolean().optional() },
    async ({ path, recursive }) => {
      const { readdirSync } = await import("fs");
      try {
        const files = readdirSync(path, { recursive: recursive || false, withFileTypes: true });
        const list = (files as any[]).map((f: any) => {
          const isDir = typeof f.isDirectory === "function" ? f.isDirectory() : false;
          const name = typeof f === "string" ? f : f.name;
          return `${isDir ? "📁 " : "📄 "}${name}`;
        }).join("\n");
        return { content: [{ type: "text" as const, text: list }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ Shell Tools ══════════════════════════════════════════════

  server.tool(
    "wispy_bash",
    "Execute a shell command with safety checks (30s timeout)",
    { command: z.string() },
    async ({ command }) => {
      const { execSync } = await import("child_process");
      try {
        const output = execSync(command, { timeout: 30000, encoding: "utf8", maxBuffer: 1024 * 1024 });
        return { content: [{ type: "text" as const, text: output.slice(0, 5000) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ Web Tools ════════════════════════════════════════════════

  server.tool(
    "wispy_web_fetch",
    "Fetch content from a URL and return the text",
    { url: z.string() },
    async ({ url }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        return { content: [{ type: "text" as const, text: text.slice(0, 10000) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ Channel Control Tools ════════════════════════════════════

  server.tool(
    "wispy_channel_list",
    "List all connected channels (CLI, Telegram, WhatsApp, Web, etc.)",
    {},
    async () => {
      try {
        const { getAllChannels } = await import("../channels/dock.js");
        const channels = getAllChannels();
        if (channels.length === 0) {
          return { content: [{ type: "text" as const, text: "No channels connected. Start the gateway first." }] };
        }
        const list = channels.map(ch =>
          `${ch.status === "connected" ? "✓" : "○"} ${ch.name} (${ch.type}) — ${ch.status}`
        ).join("\n");
        return { content: [{ type: "text" as const, text: `Connected Channels:\n${list}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_channel_send",
    "Send a message through a specific channel (e.g., Telegram, CLI). The gateway must be running.",
    { channel: z.string(), message: z.string(), peerId: z.string().optional() },
    async ({ channel, message, peerId }) => {
      try {
        const { broadcastChannelEvent } = await import("../channels/dock.js");
        broadcastChannelEvent({
          type: "notification",
          source: "antigravity",
          target: channel,
          data: { message },
          timestamp: new Date().toISOString(),
        });
        return { content: [{ type: "text" as const, text: `Sent to ${channel}: ${message.slice(0, 100)}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ Session Tools ════════════════════════════════════════════

  server.tool(
    "wispy_session_list",
    "List all active agent sessions",
    {},
    async () => {
      try {
        const { loadRegistry } = await import("../core/session.js");
        const reg = loadRegistry(runtimeDir, config.agent.id);
        const entries = Object.values(reg.sessions);
        if (entries.length === 0) return { content: [{ type: "text" as const, text: "No sessions." }] };
        const list = entries.map(s =>
          `${s.sessionKey} — ${s.channel} — ${s.messageCount} msgs — ${s.lastActiveAt}`
        ).join("\n");
        return { content: [{ type: "text" as const, text: `Sessions:\n${list}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ Model Control Tools ══════════════════════════════════════

  server.tool(
    "wispy_model_switch",
    "Switch the active AI model (e.g., pro, flash, 3-pro, gemma)",
    { model: z.string() },
    async ({ model }) => {
      const { saveConfig } = await import("../config/config.js");
      const MODELS: Record<string, string> = {
        "3": "gemini-3-pro", "3-pro": "gemini-3-pro", "3-flash": "gemini-3-flash",
        "pro": "gemini-2.5-pro", "flash": "gemini-2.5-flash",
        "2.5-pro": "gemini-2.5-pro", "2.5-flash": "gemini-2.5-flash",
        "2": "gemini-2.0-flash", "lite": "gemini-2.0-flash-lite",
        "1.5-pro": "gemini-1.5-pro", "1.5-flash": "gemini-1.5-flash",
      };
      const modelId = MODELS[model] || model;
      config.gemini.models.pro = modelId;
      saveConfig(runtimeDir, config);
      agent.updateConfig(config);
      return { content: [{ type: "text" as const, text: `Switched to: ${modelId}` }] };
    }
  );

  server.tool(
    "wispy_model_status",
    "Show the current active model and configuration",
    {},
    async () => {
      const vertexEnabled = config.gemini.vertexai?.enabled || false;
      const backend = vertexEnabled ? `Vertex AI (${config.gemini.vertexai?.project})` : "Gemini API";
      const text = [
        `Model: ${config.gemini.models.pro}`,
        `Flash: ${config.gemini.models.flash}`,
        `Image: ${config.gemini.models.image}`,
        `Backend: ${backend}`,
        `Thinking: ${config.thinking?.defaultLevel || "medium"}`,
      ].join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ═══ Scheduling Tools ═════════════════════════════════════════

  server.tool(
    "wispy_schedule_task",
    "Schedule a recurring cron task",
    { name: z.string(), cron: z.string(), instruction: z.string() },
    async ({ name, cron, instruction }) => {
      const { CronService } = await import("../cron/service.js");
      const cronSvc = new CronService(runtimeDir, agent);
      const job = cronSvc.addJob(name, cron, instruction);
      return { content: [{ type: "text" as const, text: `Scheduled: ${job.name} (${job.cron})` }] };
    }
  );

  // ═══ Wallet Tools ═════════════════════════════════════════════

  server.tool(
    "wispy_wallet_balance",
    "Check Wispy wallet USDC balance",
    {},
    async () => {
      try {
        const { getWalletAddress, getBalance } = await import("../wallet/x402.js");
        const addr = getWalletAddress(runtimeDir);
        if (!addr) return { content: [{ type: "text" as const, text: "Wallet not initialized" }] };
        const bal = await getBalance(runtimeDir);
        return { content: [{ type: "text" as const, text: `Address: ${addr}\nUSDC: ${bal}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_wallet_export_address",
    "Get the Wispy wallet address (for funding from MetaMask or other wallets)",
    {},
    async () => {
      try {
        const { getWalletAddress } = await import("../wallet/x402.js");
        const addr = getWalletAddress(runtimeDir);
        if (!addr) return { content: [{ type: "text" as const, text: "Wallet not initialized" }] };
        return { content: [{ type: "text" as const, text: `Address: ${addr}\nNetwork: Base (Chain ID 8453)\nRPC: https://mainnet.base.org` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_commerce_status",
    "Check commerce policy, spending limits, and today's payment activity",
    {},
    async () => {
      try {
        const { getCommerceEngine } = await import("../wallet/commerce.js");
        const commerce = getCommerceEngine();
        if (!commerce) return { content: [{ type: "text" as const, text: "Commerce engine not initialized" }] };
        const status = commerce.getStatus();
        const text = [
          `Policy: max/tx=$${status.policy.maxPerTransaction} daily=$${status.policy.dailyLimit} auto<$${status.policy.autoApproveBelow}`,
          `Today: $${status.dailySpending.total.toFixed(2)} spent (${status.dailySpending.count} txs), $${status.dailySpending.remaining.toFixed(2)} remaining`,
          `Whitelist: ${status.policy.whitelistedRecipients.length} | Blacklist: ${status.policy.blacklistedRecipients.length}`,
        ].join("\n");
        return { content: [{ type: "text" as const, text }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ Marathon Tools ═══════════════════════════════════════════

  server.tool(
    "wispy_marathon_start",
    "Start autonomous multi-step task execution (Marathon Mode)",
    { goal: z.string() },
    async ({ goal }) => {
      try {
        const { MarathonService } = await import("../marathon/service.js");
        const marathonService = new MarathonService(runtimeDir);
        const apiKeyOrMarker = config.gemini.vertexai?.enabled
          ? `vertex:${config.gemini.vertexai.project}`
          : (config.gemini.apiKey || process.env.GEMINI_API_KEY || "");
        await marathonService.start(goal, agent, apiKeyOrMarker, { workingDirectory: process.cwd() });
        return { content: [{ type: "text" as const, text: `Marathon started: ${goal}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_marathon_status",
    "Check the status of the active marathon",
    {},
    async () => {
      try {
        const { MarathonService } = await import("../marathon/service.js");
        const marathonService = new MarathonService(runtimeDir);
        const state = marathonService.getStatus();
        if (!state) return { content: [{ type: "text" as const, text: "No active marathon." }] };
        return { content: [{ type: "text" as const, text: `Marathon: ${state.plan.goal}\nStatus: ${state.status}\nMilestones: ${state.plan.milestones.length}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ═══ A2A Tools ════════════════════════════════════════════════

  server.tool(
    "wispy_a2a_delegate",
    "Delegate a task to another AI agent via A2A protocol",
    {
      agentUrl: z.string().describe("URL of the target agent (e.g. http://localhost:4002)"),
      task: z.string().describe("Task instruction to delegate"),
    },
    async ({ agentUrl, task }) => {
      try {
        const { A2AClient } = await import("../a2a/protocol.js");
        const client = new A2AClient(agentUrl);
        const result = await client.delegateTask(task);
        const parts = result.message?.parts || [];
        const resultText = parts.map((p: any) => p.text || "").filter(Boolean).join("\n");
        const text = result.status === "completed"
          ? `Delegation completed:\n${resultText || "done"}`
          : `Delegation status: ${result.status}${resultText ? "\n" + resultText : ""}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `A2A delegation failed: ${err.message}` }] };
      }
    }
  );

  // ═══ Skills Tools ═════════════════════════════════════════════

  server.tool(
    "wispy_skills_list",
    "List all installed agent skills",
    {},
    async () => {
      const loaded = loadSkills(soulDir);
      if (loaded.length === 0) return { content: [{ type: "text" as const, text: "No skills installed." }] };
      const list = loaded.map(s => `${s.name} — ${s.description}`).join("\n");
      return { content: [{ type: "text" as const, text: `Skills:\n${list}` }] };
    }
  );

  // ═══ x402scan Tools ══════════════════════════════════════════════

  server.tool(
    "wispy_x402scan",
    "Scan the agent's x402 wallet on Base blockchain. Returns balance, transaction history, spending stats, and runway estimate.",
    { address: z.string().optional() },
    async ({ address }) => {
      try {
        const { X402Scanner, formatScanSummary } = await import("../wallet/x402-scan.js");
        const { getWalletAddress } = await import("../wallet/x402.js");
        const addr = address || getWalletAddress(runtimeDir);
        if (!addr) return { content: [{ type: "text" as const, text: "Wallet not initialized." }] };
        const scanner = new X402Scanner(runtimeDir);
        const summary = await scanner.scanWallet(addr);
        return { content: [{ type: "text" as const, text: formatScanSummary(summary) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_x402scan_verify",
    "Verify an x402 payment transaction on-chain by its hash. Returns confirmation status, block, sender, recipient, and USDC value.",
    { txHash: z.string() },
    async ({ txHash }) => {
      try {
        const { X402Scanner, formatVerification } = await import("../wallet/x402-scan.js");
        const scanner = new X402Scanner(runtimeDir);
        const result = await scanner.verifyTransaction(txHash);
        return { content: [{ type: "text" as const, text: formatVerification(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "wispy_x402scan_history",
    "Get recent USDC transaction history for the agent's wallet on Base.",
    { limit: z.number().optional() },
    async ({ limit }) => {
      try {
        const { X402Scanner } = await import("../wallet/x402-scan.js");
        const { getWalletAddress } = await import("../wallet/x402.js");
        const addr = getWalletAddress(runtimeDir);
        if (!addr) return { content: [{ type: "text" as const, text: "Wallet not initialized." }] };
        const scanner = new X402Scanner(runtimeDir);
        const txs = await scanner.getUSDCTransfers(addr, { pageSize: limit || 20 });
        if (txs.length === 0) return { content: [{ type: "text" as const, text: "No transactions found." }] };
        const lines = txs.map(tx => {
          const dir = tx.direction === "out" ? "-" : "+";
          const peer = tx.direction === "out" ? tx.to : tx.from;
          return `${dir}$${tx.value} ${peer.slice(0, 10)}... ${tx.timestamp.split("T")[0]} ${tx.hash.slice(0, 14)}...`;
        });
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("Wispy MCP server running on stdio (Antigravity-ready)");
}
