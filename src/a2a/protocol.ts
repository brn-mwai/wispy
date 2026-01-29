import { signPayload, verifySignature, type DeviceIdentity } from "../security/device-identity.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("a2a");

export interface A2AMessage {
  type: "task_request" | "task_response" | "capability_query" | "capability_response" | "ping" | "pong";
  from: { deviceId: string; publicKey: string; name: string };
  to: { deviceId: string };
  payload: unknown;
  timestamp: string;
  signature: string;
}

export function createA2AMessage(
  identity: DeviceIdentity,
  agentName: string,
  toDeviceId: string,
  type: A2AMessage["type"],
  payload: unknown
): A2AMessage {
  const msg: Omit<A2AMessage, "signature"> = {
    type,
    from: {
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      name: agentName,
    },
    to: { deviceId: toDeviceId },
    payload,
    timestamp: new Date().toISOString(),
  };

  const signature = signPayload(identity, JSON.stringify(msg));
  return { ...msg, signature };
}

export function verifyA2AMessage(message: A2AMessage): boolean {
  const { signature, ...rest } = message;
  return verifySignature(
    message.from.publicKey,
    JSON.stringify(rest),
    signature
  );
}

export interface TaskRequest {
  taskId: string;
  instruction: string;
  context?: string;
  timeout?: number;
}

export interface TaskResponse {
  taskId: string;
  status: "completed" | "failed" | "rejected";
  result?: string;
  error?: string;
}

export interface CapabilityResponse {
  name: string;
  skills: string[];
  channels: string[];
  models: string[];
}
