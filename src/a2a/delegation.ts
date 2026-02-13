import express from "express";
import {
  createA2AMessage,
  verifyA2AMessage,
  type LegacyA2AMessage,
  type TaskRequest,
  type TaskResponse,
  type CapabilityResponse,
} from "./protocol.js";
import { addPeer, getPeer, type Peer } from "./peer.js";
import { loadOrCreateIdentity, type DeviceIdentity } from "../security/device-identity.js";
import { getAllChannels } from "../channels/dock.js";
import { loadSkills } from "../skills/loader.js";
import type { Agent } from "../core/agent.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("a2a-delegation");

export class A2AServer {
  private identity: DeviceIdentity;
  private agent: Agent;
  private runtimeDir: string;
  private soulDir: string;
  private agentName: string;
  private app: express.Express;

  constructor(
    runtimeDir: string,
    soulDir: string,
    agentName: string,
    agent: Agent
  ) {
    this.runtimeDir = runtimeDir;
    this.soulDir = soulDir;
    this.agentName = agentName;
    this.agent = agent;
    this.identity = loadOrCreateIdentity(runtimeDir);
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    // Receive A2A messages
    this.app.post("/a2a/message", async (req, res) => {
      const message = req.body as LegacyA2AMessage;

      // Verify signature
      if (!verifyA2AMessage(message)) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      // Register/update peer
      addPeer(this.runtimeDir, {
        deviceId: message.from.deviceId,
        publicKey: message.from.publicKey,
        name: message.from.name,
        endpoint: req.headers["x-a2a-endpoint"] as string || "",
        lastSeenAt: new Date().toISOString(),
      });

      try {
        switch (message.type) {
          case "ping":
            res.json(this.createResponse("pong", {}));
            break;

          case "capability_query":
            res.json(this.createResponse("capability_response", this.getCapabilities()));
            break;

          case "task_request": {
            const task = message.payload as TaskRequest;
            log.info("Received task from %s: %s", message.from.name, task.instruction.slice(0, 80));

            // Execute task in sub session
            const result = await this.agent.chat(
              task.instruction,
              `a2a:${message.from.deviceId}`,
              "a2a",
              "sub"
            );

            const response: TaskResponse = {
              taskId: task.taskId,
              status: "completed",
              result: result.text,
            };
            res.json(this.createResponse("task_response", response));
            break;
          }

          default:
            res.status(400).json({ error: "Unknown message type" });
        }
      } catch (err) {
        log.error({ err }, "A2A message handling failed");
        res.status(500).json({ error: "Internal error" });
      }
    });

    // Agent card (discovery endpoint)
    this.app.get("/a2a/card", (_req, res) => {
      res.json({
        name: this.agentName,
        deviceId: this.identity.deviceId,
        publicKey: this.identity.publicKey,
        capabilities: this.getCapabilities(),
        protocol: "wispy-a2a/0.1",
      });
    });
  }

  private getCapabilities(): CapabilityResponse {
    const skills = loadSkills(this.soulDir);
    const channels = getAllChannels();
    return {
      name: this.agentName,
      skills: skills.map((s) => s.name),
      channels: channels.map((c) => c.name),
      models: ["gemini-3-pro-preview", "gemini-3-flash-preview", "imagen-3.0-generate-002"],
    };
  }

  private createResponse(type: LegacyA2AMessage["type"], payload: unknown): LegacyA2AMessage {
    return createA2AMessage(
      this.identity,
      this.agentName,
      "", // broadcast
      type,
      payload
    );
  }

  start(port: number) {
    this.app.listen(port, () => {
      log.info("A2A server listening on port %d", port);
    });
  }

  // Send a task to another agent
  async delegateTask(
    peerDeviceId: string,
    instruction: string,
    context?: string
  ): Promise<TaskResponse | null> {
    const peer = getPeer(this.runtimeDir, peerDeviceId);
    if (!peer || !peer.endpoint) {
      log.error("Peer not found or no endpoint: %s", peerDeviceId);
      return null;
    }

    const taskId = Math.random().toString(36).slice(2, 10);
    const message = createA2AMessage(
      this.identity,
      this.agentName,
      peerDeviceId,
      "task_request",
      { taskId, instruction, context } as TaskRequest
    );

    try {
      const res = await fetch(`${peer.endpoint}/a2a/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-A2A-Endpoint": `http://localhost:${4002}`, // TODO: dynamic
        },
        body: JSON.stringify(message),
      });

      if (!res.ok) {
        log.error("Delegation failed: HTTP %d", res.status);
        return null;
      }

      const responseMsg = (await res.json()) as LegacyA2AMessage;
      return responseMsg.payload as TaskResponse;
    } catch (err) {
      log.error({ err }, "Failed to delegate task to %s", peer.name);
      return null;
    }
  }

  // Discover a peer agent by endpoint
  async discoverPeer(endpoint: string): Promise<Peer | null> {
    try {
      const res = await fetch(`${endpoint}/a2a/card`);
      if (!res.ok) return null;
      const card = (await res.json()) as {
        name: string;
        deviceId: string;
        publicKey: string;
      };
      const peer: Peer = {
        deviceId: card.deviceId,
        publicKey: card.publicKey,
        name: card.name,
        endpoint,
        lastSeenAt: new Date().toISOString(),
      };
      addPeer(this.runtimeDir, peer);
      return peer;
    } catch (err) {
      log.error({ err }, "Failed to discover peer at %s", endpoint);
      return null;
    }
  }
}
