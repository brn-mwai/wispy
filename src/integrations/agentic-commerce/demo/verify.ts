/**
 * On-Chain Verification — verifies transaction hashes on SKALE explorer.
 */

import { createPublicClient, http } from "viem";
import { SKALE_BITE_SANDBOX } from "../config.js";

// ─── Types ──────────────────────────────────────────────────

export interface VerificationResult {
  hash: string;
  found: boolean;
  confirmed: boolean;
  blockNumber?: number;
  from?: string;
  to?: string;
  value?: string;
  error?: string;
}

export interface VerificationReport {
  verified: number;
  failed: number;
  results: VerificationResult[];
}

// ─── Client ─────────────────────────────────────────────────

const publicClient = createPublicClient({
  transport: http(SKALE_BITE_SANDBOX.rpcUrl),
});

// ─── Verification ───────────────────────────────────────────

/** Verify a single transaction on SKALE */
async function verifyTransaction(hash: string): Promise<VerificationResult> {
  // Skip placeholder hashes
  if (hash === "0x0" || hash.startsWith("0x00000000")) {
    return { hash, found: false, confirmed: false, error: "Placeholder hash" };
  }

  try {
    const tx = await publicClient.getTransaction({
      hash: hash as `0x${string}`,
    });

    if (!tx) {
      return { hash, found: false, confirmed: false };
    }

    const receipt = await publicClient.getTransactionReceipt({
      hash: hash as `0x${string}`,
    });

    return {
      hash,
      found: true,
      confirmed: receipt.status === "success",
      blockNumber: Number(receipt.blockNumber),
      from: tx.from,
      to: tx.to ?? undefined,
      value: tx.value.toString(),
    };
  } catch (err) {
    return {
      hash,
      found: false,
      confirmed: false,
      error: (err as Error).message,
    };
  }
}

/** Verify multiple transactions and produce a report */
export async function verifyTransactions(
  txHashes: string[],
): Promise<VerificationReport> {
  console.log(`\n[verify] Verifying ${txHashes.length} transaction(s) on SKALE...`);

  const results: VerificationResult[] = [];
  for (const hash of txHashes) {
    const result = await verifyTransaction(hash);
    results.push(result);
    const status = result.confirmed
      ? "CONFIRMED"
      : result.found
        ? "FOUND (unconfirmed)"
        : "NOT FOUND";
    console.log(`[verify] ${hash.slice(0, 16)}... ${status}`);
  }

  const verified = results.filter((r) => r.confirmed).length;
  const failed = results.length - verified;

  return { verified, failed, results };
}

/** Format verification report as markdown */
export function formatVerificationReport(report: VerificationReport): string {
  const lines: string[] = [
    `## On-Chain Verification Report`,
    ``,
    `**Network:** SKALE BITE V2 Sandbox`,
    `**Explorer:** ${SKALE_BITE_SANDBOX.explorerUrl}`,
    `**Verified:** ${report.verified}/${report.results.length}`,
    ``,
    `| # | Tx Hash | Found | Confirmed | Block | From | To |`,
    `|---|---------|-------|-----------|-------|------|----|`,
  ];

  for (let i = 0; i < report.results.length; i++) {
    const r = report.results[i];
    lines.push(
      `| ${i + 1} | \`${r.hash.slice(0, 14)}...\` | ${r.found ? "Yes" : "No"} | ${r.confirmed ? "Yes" : "No"} | ${r.blockNumber ?? "-"} | ${r.from ? `\`${r.from.slice(0, 8)}...\`` : "-"} | ${r.to ? `\`${r.to.slice(0, 8)}...\`` : "-"} |`,
    );
  }

  return lines.join("\n");
}
