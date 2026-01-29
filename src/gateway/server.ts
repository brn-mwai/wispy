import { loadConfig } from "../config/config.js";
import { watchConfig } from "../config/hot-reload.js";
import { loadOrCreateIdentity } from "../security/device-identity.js";
import { initGemini } from "../ai/gemini.js";
import { Agent, type AgentContext } from "../core/agent.js";
import { HeartbeatRunner } from "../core/heartbeat.js";
import { ClientManager } from "./client.js";
import { createFrame, type ChatFrame, type Frame } from "./protocol/index.js";
import { runBoot } from "./boot.js";
import { loadEnv } from "../infra/dotenv.js";
import { CronService } from "../cron/service.js";
import { McpRegistry } from "../mcp/client.js";
import { A2AServer } from "../a2a/delegation.js";
import { initWallet } from "../wallet/x402.js";
import { loadSkills } from "../skills/loader.js";
import { loadIntegrations } from "../integrations/loader.js";
import { createLogger } from "../infra/logger.js";
import type { WispyConfig } from "../config/schema.js";
import type { SessionType } from "../security/isolation.js";

const log = createLogger("gateway");

interface GatewayOpts {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
  port?: number;
}

export async function startGateway(opts: GatewayOpts) {
  const { rootDir, runtimeDir, soulDir } = opts;

  // Load env
  loadEnv(rootDir);

  // Boot
  const bootOk = await runBoot({ rootDir, runtimeDir, soulDir });
  if (!bootOk) {
    log.error("Boot failed. Run 'wispy onboard' first.");
    process.exit(1);
  }

  // Load config
  let config = loadConfig(runtimeDir);
  const identity = loadOrCreateIdentity(runtimeDir);

  // Init Gemini
  const apiKey = config.gemini.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log.error("GEMINI_API_KEY not set");
    process.exit(1);
  }
  initGemini(apiKey);

  // Create agent
  const agentCtx: AgentContext = { config, runtimeDir, soulDir };
  let agent = new Agent(agentCtx);

  // Load skills
  const skills = loadSkills(soulDir);
  log.info("Loaded %d skill(s)", skills.length);

  // Load integrations
  try {
    const { CredentialManager } = await import("../integrations/credential-manager.js");
    const credMgr = new CredentialManager(runtimeDir, Buffer.from(identity.deviceId, "hex"));
    const integrationCtx = {
      config,
      runtimeDir,
      soulDir,
      credentialManager: credMgr,
      logger: log,
    };
    const integrationRegistry = await loadIntegrations(integrationCtx);
    agent.setIntegrationRegistry(integrationRegistry);
    log.info("Loaded %d integration(s), %d enabled", integrationRegistry.size, integrationRegistry.enabledCount);
  } catch (err) {
    log.warn("Integration loading failed: %s", err);
  }

  // Init wallet
  if (config.wallet?.enabled) {
    const walletInfo = initWallet(runtimeDir, identity, config.wallet.chain);
    log.info("Wallet: %s on %s", walletInfo.address, walletInfo.chain);
  }

  // Start MCP servers
  const mcpRegistry = new McpRegistry(runtimeDir);
  await mcpRegistry.startAll();
  const mcpStatus = mcpRegistry.getStatus();
  if (mcpStatus.length > 0) {
    log.info("MCP: %d server(s) running", mcpStatus.length);
  }

  // Start Cron service
  const cronService = new CronService(runtimeDir, agent);
  cronService.start();

  // Start Heartbeat
  const heartbeat = new HeartbeatRunner(config, runtimeDir, soulDir, agent.getMemoryManager());
  heartbeat.start();

  // Hot-reload config
  watchConfig(runtimeDir, (newConfig: WispyConfig) => {
    config = newConfig;
    agent = new Agent({ config: newConfig, runtimeDir, soulDir });
    log.info("Agent reloaded with new config");
  });

  // Start WebSocket server
  const wsPort = opts.port || config.channels.web?.port || 4000;
  const clientManager = new ClientManager();

  clientManager.start(wsPort, async (client, frame: Frame) => {
    const chatFrame = frame as ChatFrame;
    const { message, peerId, channel, sessionType } = chatFrame.payload;

    try {
      for await (const chunk of agent.chatStream(
        message,
        peerId || client.peerId,
        channel || "web",
        (sessionType as SessionType) || "main"
      )) {
        clientManager.send(
          client.id,
          createFrame("stream", { chunk: chunk.content, chunkType: chunk.type })
        );
      }
    } catch (err) {
      log.error({ err }, "Chat error");
      clientManager.send(
        client.id,
        createFrame("error", {
          code: "CHAT_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        })
      );
    }
  });

  // Start REST API with Dashboard
  const restPort = config.channels.rest?.port || 4001;
  if (config.channels.rest?.enabled !== false) {
    const { startRestApi } = await import("../channels/rest/adapter.js");
    startRestApi(restPort, agent, config, runtimeDir);
  }

  // Start Telegram (with apiKey for Marathon support)
  if (config.channels.telegram?.enabled && config.channels.telegram.token) {
    const { startTelegram } = await import("../channels/telegram/adapter.js");
    startTelegram(config.channels.telegram.token, agent, runtimeDir, apiKey);
  }

  // Start WhatsApp (with apiKey for Marathon support)
  if (config.channels.whatsapp?.enabled) {
    const { startWhatsApp } = await import("../channels/whatsapp/adapter.js");
    await startWhatsApp(agent, runtimeDir, apiKey);
  }

  // Start A2A server
  const a2aPort = 4002;
  const a2aServer = new A2AServer(runtimeDir, soulDir, config.agent.name, agent);
  a2aServer.start(a2aPort);

  // Print startup summary
  const telegramStatus = config.channels.telegram?.enabled ? "enabled" : "disabled";
  const whatsappStatus = config.channels.whatsapp?.enabled ? "enabled" : "disabled";

  console.log(`
  ☁️👀  Wispy Gateway Running!

  Device:     ${identity.deviceId.slice(0, 16)}...
  Agent:      ${config.agent.name}
  WebSocket:  ws://localhost:${wsPort}
  REST API:   http://localhost:${restPort}
  Dashboard:  http://localhost:${restPort}/dashboard
  A2A:        http://localhost:${a2aPort}/a2a/card
  Skills:     ${skills.length} loaded
  MCP:        ${mcpStatus.length} server(s)
  Memory:     Heartbeat every ${config.memory.heartbeatIntervalMinutes} min
  Wallet:     ${config.wallet?.enabled ? "enabled" : "disabled"}
  Telegram:   ${telegramStatus}
  WhatsApp:   ${whatsappStatus}
  `);

  // Handle shutdown
  const shutdown = () => {
    log.info("Shutting down...");
    heartbeat.stop();
    cronService.stop();
    mcpRegistry.stopAll();
    clientManager.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
