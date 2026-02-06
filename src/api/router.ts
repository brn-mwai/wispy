/**
 * Wispy Public API — Full REST API for third-party integrations
 *
 * Endpoints:
 *   POST   /api/v1/chat              — Send a message (sync)
 *   POST   /api/v1/chat/stream       — Send a message (SSE streaming)
 *   GET    /api/v1/sessions          — List sessions
 *   GET    /api/v1/sessions/:key     — Get session history
 *   DELETE /api/v1/sessions/:key     — Clear session
 *   POST   /api/v1/memory/search     — Search agent memory
 *   POST   /api/v1/marathon          — Start autonomous marathon
 *   GET    /api/v1/marathon/:id      — Get marathon status
 *   GET    /api/v1/marathon          — List marathons
 *   POST   /api/v1/marathon/:id/pause   — Pause marathon
 *   POST   /api/v1/marathon/:id/resume  — Resume marathon
 *   POST   /api/v1/marathon/:id/abort   — Abort marathon
 *   POST   /api/v1/generate/image    — Generate image
 *   GET    /api/v1/skills            — List available skills
 *   GET    /api/v1/tools             — List available tools
 *   GET    /api/v1/health            — Health check
 *   GET    /api/v1/usage             — API usage stats
 *   POST   /api/v1/webhooks          — Register webhook
 *   GET    /api/v1/webhooks          — List webhooks
 *   DELETE /api/v1/webhooks/:id      — Remove webhook
 */

import { createHash } from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { ApiKeyManager, type ApiKey, type ApiScope } from "./keys.js";
import type { Agent } from "../core/agent.js";
import type { WispyConfig } from "../config/schema.js";
import { sanitizeOutput } from "../security/api-key-guard.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("api");

// Extend Request to include API key context
interface AuthenticatedRequest extends Request {
  apiKey?: ApiKey;
  keyManager?: ApiKeyManager;
}

/**
 * Create the full public API router.
 */
export function createPublicApi(
  agent: Agent,
  config: WispyConfig,
  runtimeDir: string,
  apiKeyOrMarker?: string,
): express.Express {
  const app = express();
  const keyManager = new ApiKeyManager(runtimeDir);

  // ── Middleware ────────────────────────────────────────

  app.use(express.json({ limit: "10mb" }));

  // CORS — allow any origin for public API
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
    res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Request ID
  app.use((req: AuthenticatedRequest, _res, next) => {
    (req as any).requestId = `req_${Date.now().toString(36)}`;
    next();
  });

  // ── Auth middleware ──────────────────────────────────

  function requireAuth(scope: ApiScope) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // Try Authorization: Bearer wsk_xxx
      let key = req.headers.authorization?.replace("Bearer ", "");

      // Try X-Api-Key header
      if (!key) key = req.headers["x-api-key"] as string;

      // Try query param (for SSE/EventSource)
      if (!key) key = req.query.api_key as string;

      // Fallback to legacy bearer token from config
      const legacyToken = config.channels.rest?.bearerToken;
      if (!key && legacyToken) {
        const authHeader = req.headers.authorization;
        if (authHeader === `Bearer ${legacyToken}`) {
          // Legacy auth — grant full access
          (req as any).legacyAuth = true;
          return next();
        }
      }

      if (!key) {
        res.status(401).json({
          error: {
            code: "unauthorized",
            message: "Missing API key. Pass via Authorization: Bearer wsk_xxx or X-Api-Key header.",
            docs: "https://wispy.cc/developers",
          },
        });
        return;
      }

      const record = keyManager.validate(key, scope);
      if (!record) {
        // Check if rate limited specifically
        const hash = createHash("sha256").update(key).digest("hex");
        const existing = (keyManager as any).store?.keys?.find((k: any) => k.hash === hash);
        if (existing && !keyManager.checkRateLimit(existing)) {
          const info = keyManager.getRateLimitInfo(existing.id);
          res.setHeader("X-RateLimit-Limit", info.limit.toString());
          res.setHeader("X-RateLimit-Remaining", "0");
          res.setHeader("X-RateLimit-Reset", Math.ceil(info.resetAt / 1000).toString());
          res.status(429).json({
            error: {
              code: "rate_limit_exceeded",
              message: `Rate limit exceeded. Retry after ${Math.ceil((info.resetAt - Date.now()) / 1000)}s.`,
              retryAfter: Math.ceil((info.resetAt - Date.now()) / 1000),
            },
          });
          return;
        }

        res.status(403).json({
          error: {
            code: "forbidden",
            message: "Invalid API key, expired, or insufficient scope.",
          },
        });
        return;
      }

      // Attach rate limit headers
      const info = keyManager.getRateLimitInfo(record.id);
      res.setHeader("X-RateLimit-Limit", info.limit.toString());
      res.setHeader("X-RateLimit-Remaining", info.remaining.toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil(info.resetAt / 1000).toString());

      req.apiKey = record;
      req.keyManager = keyManager;
      next();
    };
  }

  // ── Health (no auth required) ────────────────────────

  app.get("/api/v1/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "wispy",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // ── OpenAPI spec summary (no auth) ───────────────────

  app.get("/api/v1", (_req, res) => {
    res.json({
      name: "Wispy API",
      version: "1.0.0",
      description: "Autonomous AI agent API — chat, marathon tasks, memory, tools, and more.",
      docs: "https://wispy.cc/developers",
      endpoints: {
        chat: { method: "POST", path: "/api/v1/chat", description: "Send a message" },
        stream: { method: "POST", path: "/api/v1/chat/stream", description: "Stream a response (SSE)" },
        sessions: { method: "GET", path: "/api/v1/sessions", description: "List sessions" },
        memory: { method: "POST", path: "/api/v1/memory/search", description: "Search agent memory" },
        marathon: { method: "POST", path: "/api/v1/marathon", description: "Start autonomous task" },
        generate: { method: "POST", path: "/api/v1/generate/image", description: "Generate image" },
        skills: { method: "GET", path: "/api/v1/skills", description: "List skills" },
        tools: { method: "GET", path: "/api/v1/tools", description: "List available tools" },
        health: { method: "GET", path: "/api/v1/health", description: "Health check" },
        usage: { method: "GET", path: "/api/v1/usage", description: "API usage stats" },
      },
      authentication: "Bearer token via Authorization header or X-Api-Key header",
    });
  });

  // ── Chat ─────────────────────────────────────────────

  app.post("/api/v1/chat", requireAuth("chat"), async (req: AuthenticatedRequest, res) => {
    const { message, session, context, thinking_level } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: { code: "bad_request", message: "\"message\" field is required (string)." } });
      return;
    }

    const peerId = req.apiKey?.id || "api-user";
    const sessionKey = session || "default";

    try {
      const result = await agent.chat(message, peerId, "api", sessionKey);
      const response: any = {
        id: (req as any).requestId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        message: {
          role: "assistant",
          content: result.text,
        },
      };

      if (result.thinking) response.thinking = result.thinking;
      if (result.toolCalls && result.toolCalls.length > 0) {
        response.tool_calls = result.toolCalls;
      }

      res.json(response);
    } catch (err) {
      log.error({ err }, "Chat API error");
      res.status(500).json({ error: { code: "internal_error", message: "Chat request failed." } });
    }
  });

  // ── Chat Stream (SSE) ────────────────────────────────

  app.post("/api/v1/chat/stream", requireAuth("chat:stream"), async (req: AuthenticatedRequest, res) => {
    const { message, session } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: { code: "bad_request", message: "\"message\" field is required." } });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const peerId = req.apiKey?.id || "api-user";
    const sessionKey = session || "default";

    try {
      for await (const chunk of agent.chatStream(message, peerId, "api", sessionKey)) {
        const event = {
          id: `evt_${Date.now().toString(36)}`,
          object: "chat.chunk",
          type: chunk.type,
          content: chunk.content,
        };
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      log.error({ err }, "Stream API error");
      res.write(`data: ${JSON.stringify({ type: "error", content: "Stream failed" })}\n\n`);
      res.end();
    }
  });

  // ── Sessions ─────────────────────────────────────────

  app.get("/api/v1/sessions", requireAuth("sessions"), async (req: AuthenticatedRequest, res) => {
    try {
      const { loadRegistry } = await import("../core/session.js");
      const reg = loadRegistry(runtimeDir, config.agent.id);
      const sessions = Object.values(reg.sessions).map(s => ({
        key: s.sessionKey,
        type: s.sessionType,
        channel: s.channel,
        messages: s.messageCount,
        last_active: s.lastActiveAt,
      }));
      res.json({ sessions, total: sessions.length });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to load sessions." } });
    }
  });

  app.get("/api/v1/sessions/:key", requireAuth("sessions"), async (req: AuthenticatedRequest, res) => {
    try {
      const { loadHistory } = await import("../core/session.js");
      const limit = parseInt(req.query.limit as string) || 50;
      const history = loadHistory(runtimeDir, config.agent.id, req.params.key as string, limit);
      res.json({
        session: req.params.key as string,
        messages: history.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        total: history.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to load session." } });
    }
  });

  app.delete("/api/v1/sessions/:key", requireAuth("sessions"), async (req: AuthenticatedRequest, res) => {
    try {
      const { clearHistory } = await import("../core/session.js");
      clearHistory(runtimeDir, config.agent.id, req.params.key as string);
      res.json({ deleted: true, session: req.params.key as string });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to clear session." } });
    }
  });

  // ── Memory ───────────────────────────────────────────

  app.post("/api/v1/memory/search", requireAuth("memory"), async (req: AuthenticatedRequest, res) => {
    const { query, limit } = req.body;

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: { code: "bad_request", message: "\"query\" field is required." } });
      return;
    }

    try {
      const mm = agent.getMemoryManager();
      const results = await mm.search(query, limit || 10);
      res.json({
        query,
        results: results.map(r => ({
          text: r.text,
          score: r.score,
          source: r.source,
        })),
        total: results.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Memory search failed." } });
    }
  });

  // ── Marathon ─────────────────────────────────────────

  app.post("/api/v1/marathon", requireAuth("marathon"), async (req: AuthenticatedRequest, res) => {
    const { goal, working_directory, webhook_url } = req.body;

    if (!goal || typeof goal !== "string") {
      res.status(400).json({ error: { code: "bad_request", message: "\"goal\" field is required." } });
      return;
    }

    try {
      const { MarathonService } = await import("../marathon/service.js");
      const marathonService = new MarathonService(runtimeDir);

      const state = await marathonService.start(goal, agent, apiKeyOrMarker || "", {
        workingDirectory: working_directory,
      });

      // Register webhook if provided
      if (webhook_url) {
        registerWebhookForMarathon(runtimeDir, state.id, webhook_url);
      }

      res.status(201).json({
        id: state.id,
        status: state.status,
        goal: state.plan.goal,
        created_at: state.startedAt,
        message: "Marathon started. Poll GET /api/v1/marathon/:id for status.",
      });
    } catch (err) {
      log.error({ err }, "Marathon start error");
      res.status(500).json({ error: { code: "internal_error", message: "Failed to start marathon." } });
    }
  });

  app.get("/api/v1/marathon", requireAuth("marathon:read"), async (_req: AuthenticatedRequest, res) => {
    try {
      const { MarathonService } = await import("../marathon/service.js");
      const marathonService = new MarathonService(runtimeDir);
      const marathons = marathonService.listMarathons();
      res.json({
        marathons: marathons.map(m => ({
          id: m.id,
          status: m.status,
          goal: m.plan.goal,
          started_at: m.startedAt,
          completed_at: m.completedAt,
          progress: m.plan.currentMilestoneIndex + "/" + m.plan.milestones.length,
        })),
        total: marathons.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to list marathons." } });
    }
  });

  app.get("/api/v1/marathon/:id", requireAuth("marathon:read"), async (req: AuthenticatedRequest, res) => {
    try {
      const { MarathonService } = await import("../marathon/service.js");
      const marathonService = new MarathonService(runtimeDir);
      const state = marathonService.getStatus(req.params.id as string);
      if (!state) {
        res.status(404).json({ error: { code: "not_found", message: "Marathon not found." } });
        return;
      }
      res.json({
        id: state.id,
        status: state.status,
        goal: state.plan.goal,
        milestones: state.plan.milestones.map((m: any) => ({
          id: m.id,
          title: m.title,
          status: m.status,
        })),
        current_milestone: state.plan.currentMilestoneIndex,
        started_at: state.startedAt,
        completed_at: state.completedAt,
        logs: state.logs.slice(-20),
        total_tokens: state.totalTokensUsed,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to get marathon." } });
    }
  });

  app.post("/api/v1/marathon/:id/pause", requireAuth("marathon"), async (req: AuthenticatedRequest, res) => {
    try {
      const { MarathonService } = await import("../marathon/service.js");
      const marathonService = new MarathonService(runtimeDir);
      marathonService.pause();
      res.json({ id: req.params.id as string, status: "paused" });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to pause marathon." } });
    }
  });

  app.post("/api/v1/marathon/:id/abort", requireAuth("marathon"), async (req: AuthenticatedRequest, res) => {
    try {
      const { MarathonService } = await import("../marathon/service.js");
      const marathonService = new MarathonService(runtimeDir);
      marathonService.abort();
      res.json({ id: req.params.id as string, status: "aborted" });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to abort marathon." } });
    }
  });

  // ── Image Generation ─────────────────────────────────

  app.post("/api/v1/generate/image", requireAuth("generate"), async (req: AuthenticatedRequest, res) => {
    const { prompt, aspect_ratio, count } = req.body;

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: { code: "bad_request", message: "\"prompt\" field is required." } });
      return;
    }

    try {
      const { generateImage } = await import("../ai/gemini.js");
      const result = await generateImage(prompt, {
        numberOfImages: count || 1,
        aspectRatio: aspect_ratio || "1:1",
      });

      res.json({
        images: result.images.map((img: any) => ({
          base64: img.base64,
          mime_type: img.mimeType,
        })),
        total: result.images.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Image generation failed." } });
    }
  });

  // ── Skills ───────────────────────────────────────────

  app.get("/api/v1/skills", requireAuth("skills"), async (_req: AuthenticatedRequest, res) => {
    try {
      const { loadSkills } = await import("../skills/loader.js");
      const { resolve } = await import("path");
      const soulDir = resolve(runtimeDir, "..", "wispy");
      const skills = loadSkills(soulDir);
      res.json({
        skills: skills.map(s => ({
          name: s.name,
          description: s.description,
          tools: s.tools.map(t => t.name),
        })),
        total: skills.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to load skills." } });
    }
  });

  // ── Tools ────────────────────────────────────────────

  app.get("/api/v1/tools", requireAuth("tools"), async (_req: AuthenticatedRequest, res) => {
    try {
      const { getToolDeclarations } = await import("../ai/tools.js");
      const tools = getToolDeclarations(true);
      const declarations = (tools[0] as any)?.functionDeclarations || [];
      res.json({
        tools: declarations.map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        total: declarations.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to load tools." } });
    }
  });

  // ── Usage ────────────────────────────────────────────

  app.get("/api/v1/usage", requireAuth("chat"), async (req: AuthenticatedRequest, res) => {
    if (req.apiKey) {
      const info = keyManager.getRateLimitInfo(req.apiKey.id);
      res.json({
        key_id: req.apiKey.id,
        name: req.apiKey.name,
        usage: req.apiKey.usage,
        rate_limit: {
          limit: info.limit,
          remaining: info.remaining,
          resets_at: new Date(info.resetAt).toISOString(),
        },
        scopes: req.apiKey.scopes,
      });
    } else {
      res.json({ message: "Using legacy auth — no usage tracking." });
    }
  });

  // ── Webhooks ─────────────────────────────────────────

  app.post("/api/v1/webhooks", requireAuth("admin"), async (req: AuthenticatedRequest, res) => {
    const { url, events } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: { code: "bad_request", message: "\"url\" field is required." } });
      return;
    }

    const webhook = registerWebhook(runtimeDir, url, events || ["marathon.completed", "marathon.failed"]);
    res.status(201).json(webhook);
  });

  app.get("/api/v1/webhooks", requireAuth("admin"), async (_req: AuthenticatedRequest, res) => {
    const hooks = listWebhooks(runtimeDir);
    res.json({ webhooks: hooks, total: hooks.length });
  });

  app.delete("/api/v1/webhooks/:id", requireAuth("admin"), async (req: AuthenticatedRequest, res) => {
    removeWebhook(runtimeDir, req.params.id as string);
    res.json({ deleted: true, id: req.params.id as string });
  });

  // ── 404 ──────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Endpoint not found. See GET /api/v1 for available endpoints.",
        docs: "https://wispy.cc/developers",
      },
    });
  });

  // ── Error handler ────────────────────────────────────

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err }, "Unhandled API error");
    res.status(500).json({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
      },
    });
  });

  return app;
}

// ── Webhook helpers ────────────────────────────────────

interface Webhook {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
}

function getWebhookStore(runtimeDir: string): { webhooks: Webhook[] } {
  const { existsSync, readFileSync } = require("fs");
  const { resolve } = require("path");
  const path = resolve(runtimeDir, "api", "webhooks.json");
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* */ }
  }
  return { webhooks: [] };
}

function saveWebhookStore(runtimeDir: string, store: { webhooks: Webhook[] }): void {
  const { writeFileSync, mkdirSync, existsSync } = require("fs");
  const { resolve } = require("path");
  const dir = resolve(runtimeDir, "api");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "webhooks.json"), JSON.stringify(store, null, 2));
}

function registerWebhook(runtimeDir: string, url: string, events: string[]): Webhook {
  const store = getWebhookStore(runtimeDir);
  const hook: Webhook = {
    id: `whk_${Date.now().toString(36)}`,
    url,
    events,
    createdAt: new Date().toISOString(),
  };
  store.webhooks.push(hook);
  saveWebhookStore(runtimeDir, store);
  return hook;
}

function registerWebhookForMarathon(runtimeDir: string, marathonId: string, url: string): void {
  registerWebhook(runtimeDir, url, [`marathon.${marathonId}.completed`, `marathon.${marathonId}.failed`]);
}

function listWebhooks(runtimeDir: string): Webhook[] {
  return getWebhookStore(runtimeDir).webhooks;
}

function removeWebhook(runtimeDir: string, id: string): void {
  const store = getWebhookStore(runtimeDir);
  store.webhooks = store.webhooks.filter(w => w.id !== id);
  saveWebhookStore(runtimeDir, store);
}

export async function fireWebhooks(runtimeDir: string, event: string, data: any): Promise<void> {
  const store = getWebhookStore(runtimeDir);
  const matching = store.webhooks.filter(w => w.events.some(e => event.startsWith(e) || e === "*"));

  for (const hook of matching) {
    try {
      await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
      });
    } catch (err) {
      log.warn("Webhook delivery failed: %s -> %s", event, hook.url);
    }
  }
}
