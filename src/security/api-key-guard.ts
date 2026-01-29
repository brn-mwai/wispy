import { createLogger } from "../infra/logger.js";

const log = createLogger("api-key-guard");

// Patterns that match common API key formats
const KEY_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{35}/,       // Google API keys
  /sk-[a-zA-Z0-9]{20,}/,           // OpenAI-style keys
  /xai-[a-zA-Z0-9]{20,}/,          // xAI keys
  /ghp_[a-zA-Z0-9]{36}/,           // GitHub PATs
  /glpat-[a-zA-Z0-9\-_]{20,}/,     // GitLab PATs
  /sk_live_[a-zA-Z0-9]{20,}/,      // Stripe live keys
  /sk_test_[a-zA-Z0-9]{20,}/,      // Stripe test keys
  /0x[a-fA-F0-9]{64}/,             // Private keys (Ethereum)
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // PEM private keys
];

export function scanForLeakedKeys(text: string): string[] {
  const leaked: string[] = [];
  for (const pattern of KEY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      leaked.push(match[0].slice(0, 8) + "...");
    }
  }
  return leaked;
}

export function sanitizeOutput(text: string): string {
  const leaks = scanForLeakedKeys(text);
  if (leaks.length === 0) return text;

  log.warn("Blocked output containing %d potential API key(s)", leaks.length);
  let sanitized = text;
  for (const pattern of KEY_PATTERNS) {
    sanitized = sanitized.replace(
      new RegExp(pattern.source, "g"),
      "[REDACTED]"
    );
  }
  return sanitized;
}
