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
    chunkType: "text" | "thinking" | "tool_call" | "done";
  };
}

export interface ErrorFrame extends Frame {
  type: "error";
  payload: {
    code: string;
    message: string;
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
