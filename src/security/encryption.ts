import { encrypt, decrypt, deriveKey } from "../utils/crypto.js";
import type { DeviceIdentity } from "./device-identity.js";

export function getEncryptionKey(identity: DeviceIdentity): Buffer {
  return deriveKey(Buffer.from(identity.privateKey, "base64"));
}

export function encryptCredential(
  identity: DeviceIdentity,
  plaintext: string
): string {
  const key = getEncryptionKey(identity);
  return encrypt(plaintext, key);
}

export function decryptCredential(
  identity: DeviceIdentity,
  encrypted: string
): string {
  const key = getEncryptionKey(identity);
  return decrypt(encrypted, key);
}
