/**
 * Demo Runner — runs ALL 5 track scenarios in sequence.
 *
 * Usage:
 *   npx tsx src/integrations/agentic-commerce/demo/runner.ts
 *
 * Produces formatted output suitable for the hackathon demo video.
 */

import { runTrack1 } from "./scenarios/track1-overall.js";
import { runTrack2 } from "./scenarios/track2-x402.js";
import { runTrack3 } from "./scenarios/track3-ap2.js";
import { runTrack4 } from "./scenarios/track4-defi.js";
import { runTrack5 } from "./scenarios/track5-bite.js";

interface TrackResult {
  track: number;
  name: string;
  output: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

async function runAllTracks(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════╗
║  WISPY x402 AGENTIC COMMERCE — FULL DEMO        ║
║  SF Agentic Commerce x402 Hackathon (SKALE)      ║
║  All 5 Tracks                                    ║
╚══════════════════════════════════════════════════╝
`);

  const results: TrackResult[] = [];

  const tracks: Array<{ num: number; name: string; run: () => Promise<string> }> = [
    { num: 1, name: "Overall Best Agentic App", run: runTrack1 },
    { num: 2, name: "Agentic Tool Usage on x402", run: runTrack2 },
    { num: 3, name: "Best Integration of AP2", run: runTrack3 },
    { num: 4, name: "Best Trading / DeFi Agent", run: runTrack4 },
    { num: 5, name: "Encrypted Agents (BITE v2)", run: runTrack5 },
  ];

  for (const track of tracks) {
    const start = Date.now();
    try {
      const output = await track.run();
      results.push({
        track: track.num,
        name: track.name,
        output,
        success: true,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        track: track.num,
        name: track.name,
        output: "",
        success: false,
        error: (err as Error).message,
        durationMs: Date.now() - start,
      });
      console.error(`\n[Track ${track.num}] FAILED: ${(err as Error).message}\n`);
    }
  }

  // Print summary
  console.log(`
╔══════════════════════════════════════════════════╗
║  DEMO SUMMARY                                    ║
╚══════════════════════════════════════════════════╝
`);

  for (const r of results) {
    const status = r.success ? "PASS" : "FAIL";
    const icon = r.success ? "[OK]" : "[!!]";
    console.log(`  ${icon} Track ${r.track}: ${r.name} — ${status} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.error) {
      console.log(`       Error: ${r.error}`);
    }
  }

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`
━━━ Results ━━━
  Tracks passed: ${passed}/5
  Tracks failed: ${failed}/5
  Total time:    ${(totalTime / 1000).toFixed(1)}s

━━━ What We Demonstrated ━━━
  - x402 autonomous payments (HTTP 402 -> sign -> pay -> retry)
  - Budget-aware spending with daily limits
  - AP2 structured authorization (intent -> cart -> payment -> receipt)
  - AP2 graceful failure handling (authorization denied)
  - DeFi trading with risk engine guardrails
  - BITE v2 threshold encryption with conditional execution
  - On-chain verification of all transactions
  - Complete audit trail for every payment

━━━ Tech Stack ━━━
  Agent: Wispy AI (TypeScript, Gemini LLM)
  Chain: SKALE BITE V2 Sandbox (gasless, encrypted)
  Payments: x402 protocol (EIP-3009, Kobaru facilitator)
  Auth: AP2 protocol (Google mandate system)
  Privacy: BITE v2 threshold encryption

Built by Wispy AI — github.com/brn-mwai/wispy
`);
}

// CLI entry
runAllTracks().catch((err) => {
  console.error("Demo runner failed:", err);
  process.exit(1);
});
