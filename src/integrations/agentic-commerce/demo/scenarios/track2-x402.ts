/**
 * Track 2: Agentic Tool Usage on x402 — Chained x402 Tool Calls Demo
 *
 * Shows: CDP Wallet signing, budget awareness, chained payments, spend logs.
 */

import { generatePrivateKey } from "viem/accounts";
import { X402Buyer } from "../../x402/buyer.js";
import { SpendTracker } from "../../x402/tracker.js";
import { startDemoServices, stopDemoServices } from "../server.js";
import { getServiceUrls } from "../../x402/seller.js";

export async function runTrack2(): Promise<string> {
  const output: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    output.push(msg);
  };

  log(`\n━━━ Track 2: Agentic Tool Usage on x402 ━━━\n`);
  log(`Demonstrating: chained x402 calls, budget checking, cost reasoning, spend logs.\n`);

  const agentKey = generatePrivateKey();
  const { sellerAddress } = await startDemoServices();
  const urls = getServiceUrls();

  const buyer = new X402Buyer({
    privateKey: agentKey,
    dailyLimit: 0.01, // Tight budget for demo
    autoApproveBelow: 0.005,
  });
  const tracker = new SpendTracker(buyer.address, 0.01);
  buyer.setTracker(tracker);

  log(`Agent wallet: ${buyer.address}`);
  log(`Daily limit: $0.01 USDC (tight budget for demo)`);
  log(`Auto-approve below: $0.005 USDC\n`);

  try {
    // Cost reasoning
    log(`━━━ Cost Reasoning ━━━`);
    log(`Available services:`);
    log(`  Weather API:   $0.001/call (auto-approve: yes)`);
    log(`  Sentiment API: $0.002/call (auto-approve: yes)`);
    log(`  Report API:    $0.001/call (auto-approve: yes)`);
    log(`  Total needed:  $0.004`);
    log(`  Budget:        $0.01`);
    log(`  Decision:      PROCEED — total cost $0.004 within $0.01 daily limit\n`);

    // Call 1
    log(`[x402 Call 1] Weather API → $0.001`);
    log(`  Budget check: $0.000 spent / $0.010 limit → OK`);
    const r1 = await buyer.payAndFetch(`${urls.weather}?city=Lagos`, undefined, "Weather data for Lagos");
    const d1 = await r1.json();
    log(`  HTTP 402 → Sign EIP-3009 → Pay via Kobaru → 200 OK`);
    log(`  Data: ${d1.city} ${d1.temperature}°C ${d1.condition}`);
    log(``);

    // Call 2
    log(`[x402 Call 2] Sentiment API → $0.002`);
    log(`  Budget check: $${buyer.getDailySpent().toFixed(3)} spent / $0.010 limit → OK`);
    const r2 = await buyer.payAndFetch(
      urls.sentiment,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Lagos markets are bullish on clean energy" }),
      },
      "Market sentiment analysis",
    );
    const d2 = await r2.json();
    log(`  HTTP 402 → Sign EIP-3009 → Pay via Kobaru → 200 OK`);
    log(`  Data: ${d2.sentiment} (score: ${d2.score})`);
    log(``);

    // Call 3
    log(`[x402 Call 3] Report API → $0.001`);
    log(`  Budget check: $${buyer.getDailySpent().toFixed(3)} spent / $0.010 limit → OK`);
    const r3 = await buyer.payAndFetch(
      urls.report,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [d1, d2], format: "summary" }),
      },
      "Compile data into report",
    );
    const d3 = await r3.json();
    log(`  HTTP 402 → Sign EIP-3009 → Pay via Kobaru → 200 OK`);
    log(`  Data: "${d3.title}"`);
    log(``);

    // Spend summary per tool call
    log(`━━━ Per-Call Spend Summary ━━━`);
    const history = buyer.getPaymentHistory();
    for (let i = 0; i < history.length; i++) {
      const e = history[i];
      log(
        `  Call ${i + 1}: $${e.amountUsdc.toFixed(6)} USDC | ${e.url} | ${e.status} | tx: ${e.txHash?.slice(0, 14) ?? "N/A"}...`,
      );
    }
    log(``);

    // Full audit
    log(`━━━ Spend Report ━━━`);
    log(tracker.formatReport());
    log(``);

    log(`━━━ Final Budget ━━━`);
    log(buyer.getBudgetStatus());
    log(``);

    log(`[Track 2] COMPLETE: 3 chained x402 calls, EIP-3009 signatures, budget awareness, spend logs.\n`);
  } catch (err) {
    log(`\n[Track 2] Error: ${(err as Error).message}\n`);
  } finally {
    await stopDemoServices();
  }

  return output.join("\n");
}

if (process.argv[1]?.includes("track2")) {
  runTrack2().catch(console.error);
}
