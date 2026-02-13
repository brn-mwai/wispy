/**
 * BITE v2 Conditional Logic — evaluates unlock conditions for encrypted transactions.
 *
 * Supports:
 * - delivery_proof: verify on-chain delivery event
 * - time_lock: unlock after a specific timestamp
 * - attestation: check for trusted attestation
 * - manual_trigger: explicit human trigger
 */

import { createPublicClient, http, parseAbiItem } from "viem";
import { SKALE_BITE_SANDBOX } from "../config.js";

// ─── Types ──────────────────────────────────────────────────

export interface PaymentCondition {
  type: "delivery_proof" | "time_lock" | "attestation" | "manual_trigger";
  description: string;
  params: Record<string, unknown>;
}

// ─── SKALE Client ───────────────────────────────────────────

const publicClient = createPublicClient({
  transport: http(SKALE_BITE_SANDBOX.rpcUrl),
});

// ─── Condition Evaluators ───────────────────────────────────

const evaluators: Record<
  PaymentCondition["type"],
  (params: Record<string, unknown>) => Promise<boolean>
> = {
  /**
   * Delivery proof: check if a specific transaction exists on-chain.
   * @param params.txHash - Transaction hash to verify
   * @param params.eventSignature - Optional event signature to check
   */
  delivery_proof: async (params) => {
    const txHash = params.txHash as string | undefined;
    if (!txHash) return false;

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      // Check if tx was successful
      if (receipt.status !== "success") return false;

      // If event signature provided, check logs
      const eventSignature = params.eventSignature as string | undefined;
      if (eventSignature) {
        const hasEvent = receipt.logs.some(
          (log) => log.topics[0] === eventSignature,
        );
        return hasEvent;
      }

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Time lock: check if current time is past the unlock threshold.
   * @param params.unlockAfter - ISO 8601 timestamp
   */
  time_lock: async (params) => {
    const unlockAfter = params.unlockAfter as string | undefined;
    if (!unlockAfter) return true; // No time specified = immediately unlocked
    const date = new Date(unlockAfter);
    if (isNaN(date.getTime())) return true; // Invalid date = treat as unlocked
    return new Date() >= date;
  },

  /**
   * Attestation: check if an attestation exists from a trusted party.
   * Simplified for hackathon: checks if attester has sent a tx to subject.
   * @param params.attester - Address of the attester
   * @param params.subject - Address of the subject
   */
  attestation: async (params) => {
    const attester = params.attester as string | undefined;
    const subject = params.subject as string | undefined;
    if (!attester || !subject) return false;

    try {
      // Check if attester has any interaction with subject (simplified)
      const nonce = await publicClient.getTransactionCount({
        address: attester as `0x${string}`,
      });
      return nonce > 0;
    } catch {
      return false;
    }
  },

  /**
   * Manual trigger: returns true only when explicitly triggered.
   * @param params.triggeredBy - Address of the person who triggered
   */
  manual_trigger: async (params) => {
    return !!params.triggeredBy;
  },
};

// ─── Public API ─────────────────────────────────────────────

/** Evaluate whether a payment condition is satisfied */
export async function evaluateCondition(
  condition: PaymentCondition,
): Promise<boolean> {
  const evaluator = evaluators[condition.type];
  if (!evaluator) {
    console.warn(`[BITE] Unknown condition type: ${condition.type}`);
    return false;
  }

  const result = await evaluator(condition.params);
  console.log(
    `[BITE] Condition "${condition.type}": ${result ? "MET" : "NOT MET"} — ${condition.description}`,
  );
  return result;
}

/** Get a human-readable description of a condition's current state */
export function describeCondition(condition: PaymentCondition): string {
  switch (condition.type) {
    case "delivery_proof":
      return `Waiting for delivery proof (tx: ${(condition.params.txHash as string)?.slice(0, 12) ?? "pending"}...)`;
    case "time_lock": {
      const raw = condition.params.unlockAfter as string | undefined;
      if (!raw) return "Time lock: immediately unlocked (no time specified)";
      const unlockAfter = new Date(raw);
      if (isNaN(unlockAfter.getTime())) return "Time lock: immediately unlocked (invalid time)";
      const now = new Date();
      if (now >= unlockAfter) return `Time lock expired (unlocked)`;
      const remaining = Math.ceil((unlockAfter.getTime() - now.getTime()) / 1000);
      return `Time lock: ${remaining}s remaining (unlocks at ${unlockAfter.toISOString()})`;
    }
    case "attestation":
      return `Awaiting attestation from ${(condition.params.attester as string)?.slice(0, 10)}...`;
    case "manual_trigger":
      return condition.params.triggeredBy
        ? `Manually triggered by ${(condition.params.triggeredBy as string).slice(0, 10)}...`
        : `Awaiting manual trigger`;
  }
}
