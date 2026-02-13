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
import { ReminderService, type Reminder } from "../cron/reminders.js";
import { McpRegistry } from "../mcp/client.js";
import { A2AServer } from "../a2a/delegation.js";
import { initWallet } from "../wallet/x402.js";
import { loadSkills } from "../skills/loader.js";
import { loadIntegrations } from "../integrations/loader.js";
import { createLogger } from "../infra/logger.js";
import { getBrowser } from "../browser/controller.js";
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

  // Enable autonomous mode if configured
  if (config.security?.autonomousMode) {
    const { enableAutonomousMode } = await import("../trust/controller.js");
    enableAutonomousMode();
    log.info("Autonomous mode enabled - file/code operations auto-approved");
  }

  // Init Gemini (prefer config Vertex AI, then env Vertex AI, then API key)
  const vertexConfig = config.gemini?.vertexai;
  const envVertexAI = process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT;
  const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY;
  let apiKeyInstance: string;

  if (vertexConfig?.enabled) {
    // Config-based Vertex AI
    const project = vertexConfig.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    const location = vertexConfig.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!project) {
      log.error("Vertex AI enabled but project not set. Add vertexai.project to config or set GOOGLE_CLOUD_PROJECT env var.");
      process.exit(1);
    }

    log.info("Using Vertex AI (config) with project: %s, location: %s", project, location);
    initGemini({ vertexai: true, project, location });
    apiKeyInstance = `vertex:${project}`;
  } else if (envVertexAI) {
    // Environment-based Vertex AI
    const project = process.env.GOOGLE_CLOUD_PROJECT!;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    log.info("Using Vertex AI (env) with project: %s, location: %s", project, location);
    initGemini({ vertexai: true, project, location });
    apiKeyInstance = `vertex:${project}`;
  } else if (apiKey) {
    // Standard API key mode
    initGemini(apiKey);
    apiKeyInstance = apiKey;
  } else {
    log.error("No AI credentials found. Set GEMINI_API_KEY, enable Vertex AI in config, or set GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CLOUD_PROJECT");
    process.exit(1);
  }

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
    const integrationRegistry = await loadIntegrations(integrationCtx, config.integrations ?? []);
    agent.setIntegrationRegistry(integrationRegistry);
    log.info("Loaded %d integration(s), %d enabled", integrationRegistry.size, integrationRegistry.enabledCount);
  } catch (err) {
    log.warn("Integration loading failed: %s", err);
  }

  // Init wallet
  if (config.wallet?.enabled) {
    const walletInfo = initWallet(runtimeDir, identity, config.wallet.chain);
    log.info("Wallet: %s on %s", walletInfo.address, walletInfo.chain);

    // Init commerce engine with config-based policy
    const { initCommerceEngine } = await import("../wallet/commerce.js");
    initCommerceEngine(runtimeDir, config.wallet.commerce);
    log.info("Commerce engine initialized");
  }

  // Init browser (headless Playwright for web automation)
  let browserStatus = "disabled";
  if (config.browser?.enabled !== false) {
    try {
      const browser = getBrowser(runtimeDir);
      const connected = await browser.connect(config.browser?.cdpUrl);
      browserStatus = connected ? "connected" : "failed";
      if (connected) {
        log.info("Browser connected successfully");
      } else {
        log.warn("Browser connection failed - browser tools will retry on demand");
      }
    } catch (err) {
      log.warn("Browser initialization error: %s", err);
      browserStatus = "error";
    }
  }

  // Start MCP servers
  const mcpRegistry = new McpRegistry(runtimeDir);
  await mcpRegistry.startAll();
  const mcpStatus = mcpRegistry.getStatus();
  if (mcpStatus.length > 0) {
    log.info("MCP: %d server(s) running", mcpStatus.length);
    // Connect MCP tools to the agent
    agent.setMcpRegistry(mcpRegistry);
  }

  // Start Cron service
  const cronService = new CronService(runtimeDir, agent);
  cronService.start();
  agent.setCronService(cronService);

  // Start Reminder service with notification delivery
  const reminderService = new ReminderService(runtimeDir);
  reminderService.setNotificationCallback(async (reminder: Reminder) => {
    const message = `⏰ **Reminder**\n\n${reminder.message}`;

    // Try to send via the appropriate channel
    if (reminder.channel === "telegram" && reminder.peerId) {
      try {
        const { sendTelegramMessage } = await import("../channels/telegram/adapter.js");
        return await sendTelegramMessage(reminder.peerId, message);
      } catch (err) {
        log.warn({ err }, "Failed to send Telegram reminder");
      }
    }

    // Fallback: log the reminder (CLI will pick this up)
    log.info("📢 REMINDER: %s", reminder.message);
    console.log(`\n\x1b[33m⏰ REMINDER: ${reminder.message}\x1b[0m\n`);
    return true;
  });
  reminderService.start();
  agent.setReminderService(reminderService);

  // Start Heartbeat
  const heartbeat = new HeartbeatRunner(config, runtimeDir, soulDir, agent.getMemoryManager());
  heartbeat.start();

  // Hot-reload config
  watchConfig(runtimeDir, (newConfig: WispyConfig) => {
    config = newConfig;
    agent = new Agent({ config: newConfig, runtimeDir, soulDir });
    log.info("Agent reloaded with new config");
  });

  // Start Antigravity channel adapter (always available for VS Code extension)
  const { startAntigravity, registerAntigravityClient, unregisterAntigravityClient } =
    await import("../channels/antigravity/adapter.js");
  startAntigravity(agent);

  // Start WebSocket server
  const wsPort = opts.port || config.channels.web?.port || 4000;
  const clientManager = new ClientManager();

  // Wire Antigravity extension connect/disconnect to the adapter
  clientManager.onAntigravityConnect = (clientId, payload) => {
    registerAntigravityClient(clientId, payload);
  };
  clientManager.onAntigravityDisconnect = (clientId) => {
    unregisterAntigravityClient(clientId);
  };

  clientManager.start(wsPort, async (client, frame: Frame) => {
    const chatFrame = frame as ChatFrame;
    const { message, peerId, channel, sessionType } = chatFrame.payload;

    try {
      let tokenEstimate = 0;
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
        if (chunk.type === "text") {
          tokenEstimate += Math.ceil(chunk.content.length / 4);
        }
      }

      // Broadcast session_update to all CLI clients after response
      clientManager.broadcastSessionUpdate({
        tokens: tokenEstimate,
        cost: 0,
        context: 0,
        session: (sessionType as string) || "main",
      });
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

  // Start Public API (replaces basic REST adapter)
  const apiPort = config.channels.rest?.port || 4001;
  if (config.channels.rest?.enabled !== false) {
    const { createPublicApi } = await import("../api/router.js");
    const apiApp = createPublicApi(agent, config, runtimeDir, apiKeyInstance);

    // Mount legacy dashboard on the public API
    try {
      const { MarathonService } = await import("../marathon/service.js");
      const { createDashboardRouter } = await import("../web/dashboard.js");
      const marathonService = new MarathonService(runtimeDir);
      apiApp.use("/dashboard", createDashboardRouter(marathonService));
    } catch { /* dashboard optional */ }

    apiApp.listen(apiPort, () => {
      log.info("Public API listening on port %d", apiPort);
    });
  }

  // Start Telegram (with apiKeyInstance for Marathon support - includes Vertex AI marker)
  if (config.channels.telegram?.enabled && config.channels.telegram.token) {
    const { startTelegram } = await import("../channels/telegram/adapter.js");
    startTelegram(config.channels.telegram.token, agent, runtimeDir, apiKeyInstance);
  }

  // Start WhatsApp (with apiKeyInstance for Marathon support - includes Vertex AI marker)
  if (config.channels.whatsapp?.enabled) {
    const { startWhatsApp } = await import("../channels/whatsapp/adapter.js");
    await startWhatsApp(agent, runtimeDir, apiKeyInstance);
  }

  // Start A2A server
  const a2aPort = 4002;
  const a2aServer = new A2AServer(runtimeDir, soulDir, config.agent.name, agent);
  a2aServer.start(a2aPort);

  // Print startup summary
  const telegramStatus = config.channels.telegram?.enabled ? "enabled" : "disabled";
  const whatsappStatus = config.channels.whatsapp?.enabled ? "enabled" : "disabled";
  const aiBackend = apiKeyInstance.startsWith("vertex:")
    ? `Vertex AI (${apiKeyInstance.replace("vertex:", "")})`
    : "Gemini API";

  console.log(`
  ☁️👀  Wispy Gateway Running!

  Device:     ${identity.deviceId.slice(0, 16)}...
  Agent:      ${config.agent.name}
  AI Backend: ${aiBackend}
  WebSocket:  ws://localhost:${wsPort}
  API:        http://localhost:${apiPort}/api/v1
  Dashboard:  http://localhost:${apiPort}/dashboard
  A2A:        http://localhost:${a2aPort}/a2a/card
  Skills:     ${skills.length} loaded
  MCP:        ${mcpStatus.length} server(s)
  Memory:     Heartbeat every ${config.memory.heartbeatIntervalMinutes} min
  Wallet:     ${config.wallet?.enabled ? "enabled" : "disabled"}
  Browser:    ${browserStatus}
  Antigravity: ready (Google Account auth)
  Telegram:   ${telegramStatus}
  WhatsApp:   ${whatsappStatus}
  `);

  // Handle shutdown
  const { stopAntigravity } = await import("../channels/antigravity/adapter.js");
  const shutdown = () => {
    log.info("Shutting down...");
    heartbeat.stop();
    cronService.stop();
    reminderService.stop();
    mcpRegistry.stopAll();
    clientManager.close();
    try { stopAntigravity(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
