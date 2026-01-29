import { generateKeyPairSync, createHash, sign, verify } from "crypto";
import { existsSync, chmodSync } from "fs";
import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("device-identity");

export interface DeviceIdentity {
  publicKey: string; // base64
  privateKey: string; // base64
  deviceId: string; // SHA256 of public key
  createdAt: string;
}

const IDENTITY_FILE = "identity/device.json";

export function getIdentityPath(runtimeDir: string): string {
  return resolve(runtimeDir, IDENTITY_FILE);
}

export function loadOrCreateIdentity(runtimeDir: string): DeviceIdentity {
  const path = getIdentityPath(runtimeDir);
  ensureDir(resolve(runtimeDir, "identity"));

  const existing = readJSON<DeviceIdentity>(path);
  if (existing) {
    log.info("Device identity loaded: %s", existing.deviceId.slice(0, 12));
    return existing;
  }

  log.info("Generating new Ed25519 device identity...");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const deviceId = createHash("sha256")
    .update(publicKey)
    .digest("hex");

  const identity: DeviceIdentity = {
    publicKey: publicKey.toString("base64"),
    privateKey: privateKey.toString("base64"),
    deviceId,
    createdAt: new Date().toISOString(),
  };

  writeJSON(path, identity);

  // Restrict file permissions (owner-only)
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows doesn't support chmod well — log warning
    log.warn("Could not set 0600 permissions on identity file (expected on Windows)");
  }

  log.info("Device identity created: %s", deviceId.slice(0, 12));
  return identity;
}

export function signPayload(identity: DeviceIdentity, payload: string): string {
  const privateKeyDer = Buffer.from(identity.privateKey, "base64");
  const privateKey = {
    key: privateKeyDer,
    format: "der" as const,
    type: "pkcs8" as const,
  };
  const signature = sign(null, Buffer.from(payload), privateKey);
  return signature.toString("base64");
}

export function verifySignature(
  publicKeyBase64: string,
  payload: string,
  signatureBase64: string
): boolean {
  const publicKeyDer = Buffer.from(publicKeyBase64, "base64");
  const publicKey = {
    key: publicKeyDer,
    format: "der" as const,
    type: "spki" as const,
  };
  return verify(
    null,
    Buffer.from(payload),
    publicKey,
    Buffer.from(signatureBase64, "base64")
  );
}
