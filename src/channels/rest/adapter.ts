import express from "express";
import { registerChannel, updateChannelStatus } from "../dock.js";
import type { Agent } from "../../core/agent.js";
import type { WispyConfig } from "../../config/schema.js";
import { sanitizeOutput } from "../../security/api-key-guard.js";
import { createLogger } from "../../infra/logger.js";
import { MarathonService } from "../../marathon/service.js";
import { createDashboardRouter } from "../../web/dashboard.js";

const log = createLogger("rest");

export function startRestApi(port: number, agent: Agent, config: WispyConfig, runtimeDir?: string) {
  const app = express();
  app.use(express.json());

  // Bearer token auth middleware
  const bearerToken = config.channels.rest?.bearerToken;
  if (bearerToken) {
    app.use((req, res, next) => {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${bearerToken}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
  }

  // Health check
  app.get("/api/v1/health", (_req, res) => {
    res.json({ status: "ok", agent: "wispy", version: "0.6.2" });
  });

  // Chat endpoint
  app.post("/api/v1/chat", async (req, res) => {
    const { message, peerId, sessionType } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    try {
      const result = await agent.chat(
        message,
        peerId || "rest-user",
        "rest",
        sessionType || "main"
      );
      res.json({
        text: result.text,
        thinking: result.thinking,
        toolCalls: result.toolCalls,
      });
    } catch (err) {
      log.error({ err }, "Chat error");
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Chat stream endpoint (SSE)
  app.post("/api/v1/chat/stream", async (req, res) => {
    const { message, peerId, sessionType } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      for await (const chunk of agent.chatStream(
        message,
        peerId || "rest-user",
        "rest",
        sessionType || "main"
      )) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      log.error({ err }, "Stream error");
      res.write(`data: ${JSON.stringify({ type: "error", content: "Internal error" })}\n\n`);
      res.end();
    }
  });

  // Mount Marathon Dashboard (if runtimeDir provided)
  if (runtimeDir) {
    const marathonService = new MarathonService(runtimeDir);
    const dashboardRouter = createDashboardRouter(marathonService);
    app.use("/dashboard", dashboardRouter);
    log.info("Dashboard available at http://localhost:%d/dashboard", port);
  }

  app.listen(port, () => {
    log.info("REST API listening on port %d", port);
    registerChannel({
      name: "rest",
      type: "rest",
      capabilities: {
        text: true,
        media: false,
        voice: false,
        buttons: false,
        reactions: false,
        groups: false,
        threads: false,
      },
      status: "connected",
      connectedAt: new Date().toISOString(),
    });
  });
}
