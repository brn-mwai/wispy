import { WebSocketServer, WebSocket } from "ws";
import { createFrame, validateChatFrame, type Frame } from "./protocol/index.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("ws-client");

export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  peerId: string;
  channel: string;
  clientType: "web" | "cli" | "antigravity";
  connectedAt: Date;
  /** Google Account info for Antigravity extension clients */
  googleUser?: {
    googleId: string;
    email: string;
    displayName: string;
  };
}

export class ClientManager {
  private clients = new Map<string, ConnectedClient>();
  private wss: WebSocketServer | null = null;
  /** Callback fired when an Antigravity extension client connects */
  onAntigravityConnect?: (clientId: string, payload: any) => void;
  /** Callback fired when an Antigravity extension client disconnects */
  onAntigravityDisconnect?: (clientId: string) => void;

  start(port: number, onMessage: (client: ConnectedClient, frame: Frame) => void) {
    this.wss = new WebSocketServer({ port });
    log.info("WebSocket server listening on port %d", port);

    this.wss.on("connection", (ws, req) => {
      const clientId = Math.random().toString(36).slice(2, 10);
      const client: ConnectedClient = {
        id: clientId,
        ws,
        peerId: `web:${clientId}`,
        channel: "web",
        clientType: "web",
        connectedAt: new Date(),
      };

      this.clients.set(clientId, client);
      log.info("Client connected: %s", clientId);

      ws.on("message", (data) => {
        try {
          const frame = JSON.parse(data.toString()) as Frame;

          // Handle cli_connect frames to identify CLI clients
          if (frame.type === "cli_connect") {
            const payload = frame.payload as { clientName: string; peerId: string };
            client.clientType = "cli";
            client.peerId = payload.peerId;
            client.channel = "cli";
            log.info("CLI client identified: %s (%s)", clientId, payload.clientName);

            // Broadcast to other CLI clients that a new CLI connected
            this.broadcastToCli(
              createFrame("cli_broadcast", {
                source: "gateway",
                message: `CLI client ${payload.clientName} connected`,
              }),
              clientId,
            );
            return;
          }

          // Handle antigravity_connect frames from VS Code extension
          if (frame.type === "antigravity_connect") {
            const payload = frame.payload as {
              googleId: string;
              email: string;
              displayName: string;
              avatarUrl?: string;
              extensionVersion?: string;
              vscodeVersion?: string;
              workspaceName?: string;
            };
            client.clientType = "antigravity";
            client.peerId = `antigravity:${payload.googleId}`;
            client.channel = "antigravity";
            client.googleUser = {
              googleId: payload.googleId,
              email: payload.email,
              displayName: payload.displayName,
            };
            log.info(
              "Antigravity client identified: %s (%s, %s)",
              clientId,
              payload.displayName,
              payload.email,
            );

            // Register with the antigravity adapter if available
            if (this.onAntigravityConnect) {
              this.onAntigravityConnect(clientId, payload);
            }

            // Send welcome with capabilities
            ws.send(
              JSON.stringify(
                createFrame("antigravity_welcome", {
                  clientId,
                  capabilities: [
                    "chat",
                    "chat_with_image",
                    "memory",
                    "file_ops",
                    "bash",
                    "web_fetch",
                    "channels",
                    "model_switch",
                    "marathon",
                    "a2a",
                    "skills",
                  ],
                })
              )
            );
            return;
          }

          if (frame.type === "chat" && validateChatFrame(frame)) {
            onMessage(client, frame);
          } else {
            ws.send(
              JSON.stringify(
                createFrame("error", { code: "INVALID_FRAME", message: "Invalid frame" })
              )
            );
          }
        } catch {
          ws.send(
            JSON.stringify(
              createFrame("error", { code: "PARSE_ERROR", message: "Invalid JSON" })
            )
          );
        }
      });

      ws.on("close", () => {
        // Broadcast disconnect to other CLI clients
        if (client.clientType === "cli") {
          this.broadcastToCli(
            createFrame("cli_broadcast", {
              source: "gateway",
              message: `CLI client ${client.peerId} disconnected`,
            }),
            clientId,
          );
        }

        // Notify antigravity adapter of disconnect
        if (client.clientType === "antigravity" && this.onAntigravityDisconnect) {
          this.onAntigravityDisconnect(clientId);
        }

        this.clients.delete(clientId);
        log.info("Client disconnected: %s", clientId);
      });

      // Send welcome
      ws.send(JSON.stringify(createFrame("connected", { clientId })));
    });
  }

  send(clientId: string, frame: Frame) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(frame));
    }
  }

  broadcast(frame: Frame) {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(frame));
      }
    }
  }

  /**
   * Broadcast a frame to all CLI clients, optionally excluding one.
   */
  broadcastToCli(frame: Frame, excludeClientId?: string) {
    for (const client of this.clients.values()) {
      if (
        client.clientType === "cli" &&
        client.ws.readyState === WebSocket.OPEN &&
        client.id !== excludeClientId
      ) {
        client.ws.send(JSON.stringify(frame));
      }
    }
  }

  /**
   * Broadcast a session_update frame to all CLI clients after a response completes.
   */
  broadcastSessionUpdate(payload: { tokens: number; cost: number; context: number; session: string }) {
    this.broadcastToCli(createFrame("session_update", payload));
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getCliClientCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.clientType === "cli") count++;
    }
    return count;
  }

  /**
   * Broadcast a frame to all Antigravity extension clients, optionally excluding one.
   */
  broadcastToAntigravity(frame: Frame, excludeClientId?: string) {
    for (const client of this.clients.values()) {
      if (
        client.clientType === "antigravity" &&
        client.ws.readyState === WebSocket.OPEN &&
        client.id !== excludeClientId
      ) {
        client.ws.send(JSON.stringify(frame));
      }
    }
  }

  getAntigravityClientCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.clientType === "antigravity") count++;
    }
    return count;
  }

  close() {
    this.wss?.close();
  }
}
