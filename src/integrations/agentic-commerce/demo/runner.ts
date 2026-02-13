/**
 * Demo Runner -- runs ALL 6 track scenarios in sequence with real-time progress.
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
import { runTrack6 } from "./scenarios/track6-vision.js";
import { runPreflight } from "./preflight.js";
import { SKALE_BITE_SANDBOX } from "../config.js";

const TRACK_TIMEOUT_MS = 60_000; // 60s per track

interface TrackResult {
  track: number;
  name: string;
  output: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

function timeoutPromise<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

async function runAllTracks(): Promise<void> {
  const agentKey = process.env.AGENT_PRIVATE_KEY;
  const demoStart = Date.now();

  // Pre-flight balance check
  console.log("\n  Running preflight checks...");
  const preflight = await runPreflight(agentKey);

  console.log(`
\x1b[36m╔══════════════════════════════════════════════════════╗
║  WISPY x402 AGENTIC COMMERCE -- FULL DEMO            ║
║  SF Agentic Commerce x402 Hackathon (SKALE)           ║
║  6 Tracks  |  Gemini 3 Pro  |  Mode: ${preflight.mode.toUpperCase().padEnd(15)}║
╚══════════════════════════════════════════════════════════╝\x1b[0m
`);

  console.log(`  Agent:  ${preflight.address}`);
  if (preflight.mode === "live") {
    console.log(`  sFUEL:  ${preflight.sFuelBalance}`);
    console.log(`  USDC:   $${preflight.usdcBalance.toFixed(6)}`);
  }
  for (const w of preflight.warnings) console.log(`  \x1b[33m[WARN]\x1b[0m ${w}`);
  if (preflight.mode === "live" && !preflight.ready) {
    console.error("\n  \x1b[31mInsufficient balance. Aborting.\x1b[0m\n");
    process.exit(1);
  }
  console.log(``);

  const results: TrackResult[] = [];

  const tracks: Array<{ num: number; name: string; run: () => Promise<string> }> = [
    { num: 1, name: "Overall Best Agentic App", run: () => runTrack1(agentKey) },
    { num: 2, name: "Agentic Tool Usage on x402", run: () => runTrack2(agentKey) },
    { num: 3, name: "Best Integration of AP2", run: () => runTrack3(agentKey) },
    { num: 4, name: "Best Trading / DeFi Agent", run: () => runTrack4(agentKey) },
    { num: 5, name: "Encrypted Agents (BITE v2)", run: () => runTrack5(agentKey) },
    { num: 6, name: "Agentic Vision (Gemini 3)", run: () => runTrack6(agentKey) },
  ];

  for (const track of tracks) {
    const start = Date.now();

    // Real-time: announce track start
    console.log(`\x1b[36m━━━ Track ${track.num}: ${track.name} ━━━\x1b[0m`);
    console.log(`  \x1b[33m>\x1b[0m Starting...`);

    try {
      const output = await timeoutPromise(
        track.run(),
        TRACK_TIMEOUT_MS,
        `Track ${track.num}`,
      );

      const dur = elapsed(start);
      console.log(`  \x1b[32m[PASS]\x1b[0m Completed in ${dur}`);

      // Print track output indented
      for (const line of output.split("\n")) {
        if (line.trim()) console.log(`  ${line}`);
      }

      results.push({
        track: track.num,
        name: track.name,
        output,
        success: true,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      const dur = elapsed(start);
      const msg = (err as Error).message;
      console.log(`  \x1b[31m[FAIL]\x1b[0m ${msg} (${dur})`);

      results.push({
        track: track.num,
        name: track.name,
        output: "",
        success: false,
        error: msg,
        durationMs: Date.now() - start,
      });
    }

    console.log(""); // blank line between tracks
  }

  // Print summary
  const totalTime = Date.now() - demoStart;
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\x1b[36m╔══════════════════════════════════════════════════════╗
║  DEMO SUMMARY                                        ║
╚══════════════════════════════════════════════════════════╝\x1b[0m
`);

  for (const r of results) {
    const icon = r.success ? "\x1b[32m[OK]\x1b[0m" : "\x1b[31m[!!]\x1b[0m";
    console.log(`  ${icon} Track ${r.track}: ${r.name} -- ${r.success ? "PASS" : "FAIL"} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.error) {
      console.log(`       Error: ${r.error}`);
    }
  }

  console.log(`
\x1b[36m━━━ Results ━━━\x1b[0m
  Tracks passed: ${passed}/6
  Tracks failed: ${failed}/6
  Total time:    ${(totalTime / 1000).toFixed(1)}s

\x1b[36m━━━ What We Demonstrated ━━━\x1b[0m
  - x402 autonomous payments (HTTP 402 -> sign -> pay -> retry)
  - Budget-aware spending with daily limits
  - AP2 structured authorization (intent -> cart -> payment -> receipt)
  - AP2 graceful failure handling (authorization denied)
  - DeFi trading with risk engine guardrails
  - BITE v2 threshold encryption with conditional execution
  - On-chain verification of all transactions
  - Complete audit trail for every payment
  - Gemini 3 agentic vision: analyze visuals -> reason -> pay

\x1b[36m━━━ Tech Stack ━━━\x1b[0m
  Agent:     Wispy AI (TypeScript, Gemini 3 Pro)
  Chain:     SKALE BITE V2 Sandbox (gasless, encrypted)
  Payments:  x402 protocol (EIP-3009, Kobaru facilitator)
  Auth:      AP2 protocol (Google mandate system)
  Privacy:   BITE v2 BLS threshold encryption
  Thinking:  Gemini 3 Deep Think (HIGH mode)

Built by Wispy AI -- github.com/brn-mwai/wispy
`);

  // Collect all tx hashes from track outputs for aggregate proof
  const allHashes: string[] = [];
  for (const r of results) {
    const matches = r.output.matchAll(/Explorer: [^\n]*\/tx\/(0x[a-fA-F0-9]+)/g);
    for (const m of matches) allHashes.push(m[1]);
  }

  if (allHashes.length > 0) {
    console.log(`\x1b[36m━━━ On-Chain Proof (${allHashes.length} transactions) ━━━\x1b[0m`);
    for (const hash of allHashes) {
      console.log(`  ${SKALE_BITE_SANDBOX.explorerUrl}/tx/${hash}`);
    }
    console.log(``);
  }
}

// CLI entry
runAllTracks().catch((err) => {
  console.error("Demo runner failed:", err);
  process.exit(1);
});
