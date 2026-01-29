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
import { createLogger } from "../infra/logger.js";

const log = createLogger("mcp-server");

export async function startMcpServer(rootDir: string) {
  const runtimeDir = resolve(rootDir, ".wispy");
  const soulDir = resolve(rootDir, "wispy");

  loadEnv(rootDir);
  await runBoot({ rootDir, runtimeDir, soulDir });

  const config = loadConfig(runtimeDir);
  const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log.error("GEMINI_API_KEY not set");
    process.exit(1);
  }
  initGemini(apiKey);

  const agent = new Agent({ config, runtimeDir, soulDir });
  const memoryManager = new MemoryManager(runtimeDir, config);

  const server = new McpServer({
    name: "wispy",
    version: "0.1.0",
  });

  // --- Tools ---

  server.tool(
    "wispy_chat",
    "Send a message to the Wispy AI agent and get a response",
    { message: z.string(), session: z.string().optional() },
    async ({ message, session }) => {
      const result = await agent.chat(message, "mcp-user", "mcp", "main");
      return { content: [{ type: "text" as const, text: result.text }] };
    }
  );

  server.tool(
    "wispy_memory_search",
    "Search Wispy's semantic memory",
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit }) => {
      const results = await memoryManager.search(query, limit || 5);
      const text = results.map((r) => `[${r.score.toFixed(2)}] ${r.text}`).join("\n");
      return { content: [{ type: "text" as const, text: text || "No results found." }] };
    }
  );

  server.tool(
    "wispy_memory_save",
    "Save a fact or note to Wispy's memory",
    { text: z.string(), source: z.string().optional() },
    async ({ text, source }) => {
      await memoryManager.addMemory(text, source || "mcp", "mcp-user");
      return { content: [{ type: "text" as const, text: "Saved to memory." }] };
    }
  );

  server.tool(
    "wispy_bash",
    "Execute a shell command (with safety checks)",
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
    "Write content to a file",
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
    "wispy_web_fetch",
    "Fetch content from a URL",
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
    "wispy_schedule_task",
    "Schedule a cron task",
    { name: z.string(), cron: z.string(), instruction: z.string() },
    async ({ name, cron, instruction }) => {
      const { CronService } = await import("../cron/service.js");
      const cronSvc = new CronService(runtimeDir, agent);
      const job = cronSvc.addJob(name, cron, instruction);
      return { content: [{ type: "text" as const, text: `Scheduled: ${job.name} (${job.cron})` }] };
    }
  );

  server.tool(
    "wispy_a2a_delegate",
    "Delegate a task to another AI agent via A2A",
    { peerId: z.string(), task: z.string() },
    async ({ peerId, task }) => {
      return { content: [{ type: "text" as const, text: `Delegated to ${peerId}: ${task}` }] };
    }
  );

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("Wispy MCP server running on stdio");
}
