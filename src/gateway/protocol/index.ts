import AjvModule from "ajv";
const Ajv = (AjvModule as any).default ?? AjvModule;

const ajv = new Ajv();

// Protocol frame types for gateway communication
export interface Frame {
  type: string;
  payload: unknown;
  timestamp: string;
  deviceId?: string;
  signature?: string;
}

export interface ChatFrame extends Frame {
  type: "chat";
  payload: {
    message: string;
    peerId: string;
    channel: string;
    sessionType?: string;
  };
}

export interface ResponseFrame extends Frame {
  type: "response";
  payload: {
    text: string;
    thinking?: string;
    toolCalls?: unknown[];
  };
}

export interface StreamFrame extends Frame {
  type: "stream";
  payload: {
    chunk: string;
    chunkType: "text" | "thinking" | "tool_call" | "tool_result" | "done";
  };
}

export interface ErrorFrame extends Frame {
  type: "error";
  payload: {
    code: string;
    message: string;
  };
}

// ── CLI Sync Frames ──────────────────────────────────────────────

export interface CliConnectFrame extends Frame {
  type: "cli_connect";
  payload: {
    clientName: string;
    peerId: string;
  };
}

export interface CliBroadcastFrame extends Frame {
  type: "cli_broadcast";
  payload: {
    source: string;
    message: string;
    data?: unknown;
  };
}

export interface SessionUpdateFrame extends Frame {
  type: "session_update";
  payload: {
    tokens: number;
    cost: number;
    context: number;
    session: string;
  };
}

// ── Antigravity Extension Frames ─────────────────────────────────

export interface AntigravityConnectFrame extends Frame {
  type: "antigravity_connect";
  payload: {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    extensionVersion?: string;
    vscodeVersion?: string;
    workspaceName?: string;
  };
}

export interface AntigravityWelcomeFrame extends Frame {
  type: "antigravity_welcome";
  payload: {
    clientId: string;
    capabilities: string[];
  };
}

const chatSchema = {
  type: "object",
  required: ["type", "payload", "timestamp"],
  properties: {
    type: { const: "chat" },
    timestamp: { type: "string" },
    payload: {
      type: "object",
      required: ["message", "peerId", "channel"],
      properties: {
        message: { type: "string", minLength: 1 },
        peerId: { type: "string" },
        channel: { type: "string" },
        sessionType: { type: "string" },
      },
    },
  },
};

export const validateChatFrame = ajv.compile(chatSchema);

export function createFrame(type: string, payload: unknown): Frame {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
