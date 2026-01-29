import { WebSocketServer, WebSocket } from "ws";
import { createFrame, validateChatFrame, type Frame } from "./protocol/index.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("ws-client");

export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  peerId: string;
  channel: string;
  connectedAt: Date;
}

export class ClientManager {
  private clients = new Map<string, ConnectedClient>();
  private wss: WebSocketServer | null = null;

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
        connectedAt: new Date(),
      };

      this.clients.set(clientId, client);
      log.info("Client connected: %s", clientId);

      ws.on("message", (data) => {
        try {
          const frame = JSON.parse(data.toString()) as Frame;
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

  getClientCount(): number {
    return this.clients.size;
  }

  close() {
    this.wss?.close();
  }
}
