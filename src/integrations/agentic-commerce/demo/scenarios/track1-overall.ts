/**
 * Track 1: Overall Best Agentic App — End-to-End Agent Workflow Demo
 *
 * Shows: discover -> decide -> pay/settle -> outcome
 * Agent chains 3 paid x402 API calls with full audit trail.
 */

import { generatePrivateKey } from "viem/accounts";
import { X402Buyer } from "../../x402/buyer.js";
import { SpendTracker } from "../../x402/tracker.js";
import { startDemoServices, stopDemoServices } from "../server.js";
import { getServiceUrls } from "../../x402/seller.js";
import { verifyTransactions, formatVerificationReport } from "../verify.js";

export async function runTrack1(): Promise<string> {
  const output: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    output.push(msg);
  };

  log(`\n━━━ Track 1: Overall Best Agentic App ━━━\n`);
  log(`Scenario: Agent receives task "Research Nairobi weather and market sentiment, compile a report"`);
  log(`The agent must autonomously discover, pay for, and chain 3 API calls.\n`);

  // Setup
  const agentKey = generatePrivateKey();
  const { sellerAddress } = await startDemoServices();
  const urls = getServiceUrls();

  const buyer = new X402Buyer({ privateKey: agentKey });
  const tracker = new SpendTracker(buyer.address);
  buyer.setTracker(tracker);

  log(`Agent wallet: ${buyer.address}`);
  log(`Budget: $${buyer.getRemainingBudget().toFixed(2)} USDC daily`);
  log(``);

  try {
    // Step 1: Weather API
    log(`[Step 1] Fetching weather data for Nairobi ($0.001)...`);
    const weatherResp = await buyer.payAndFetch(
      `${urls.weather}?city=Nairobi`,
      undefined,
      "Need weather data for Nairobi to compile research report",
    );
    const weather = await weatherResp.json();
    log(`  Result: ${weather.city} - ${weather.temperature}°C, ${weather.condition}`);
    log(``);

    // Step 2: Sentiment API
    log(`[Step 2] Analyzing market sentiment ($0.002)...`);
    const sentimentResp = await buyer.payAndFetch(
      urls.sentiment,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Nairobi weather is ${weather.condition} at ${weather.temperature}C. Markets respond to climate conditions.` }),
      },
      "Sentiment analysis of weather impact on market conditions",
    );
    const sentiment = await sentimentResp.json();
    log(`  Result: Sentiment is ${sentiment.sentiment} (score: ${sentiment.score})`);
    log(``);

    // Step 3: Report API
    log(`[Step 3] Generating compiled report ($0.001)...`);
    const reportResp = await buyer.payAndFetch(
      urls.report,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [weather, sentiment],
          format: "detailed",
        }),
      },
      "Compile weather and sentiment data into a formatted report",
    );
    const report = await reportResp.json();
    log(`  Result: "${report.title}" with ${report.sections.length} sections`);
    log(``);

    // Audit Trail
    log(`━━━ Audit Trail ━━━`);
    log(tracker.formatReport());
    log(``);

    // Budget summary
    log(`━━━ Budget Summary ━━━`);
    log(buyer.getBudgetStatus());
    log(``);

    // On-chain verification
    const txHashes = buyer
      .getPaymentHistory()
      .filter((e) => e.status === "success" && e.txHash)
      .map((e) => e.txHash!);

    if (txHashes.length > 0) {
      log(`━━━ On-Chain Verification ━━━`);
      const verification = await verifyTransactions(txHashes);
      log(formatVerificationReport(verification));
    }

    log(`\n[Track 1] COMPLETE: 3 x402 payments, full audit trail, chained workflow.\n`);
  } catch (err) {
    log(`\n[Track 1] Error: ${(err as Error).message}`);
    log(`Note: If x402 payment fails, ensure testnet USDC is funded and facilitator is reachable.\n`);
  } finally {
    await stopDemoServices();
  }

  return output.join("\n");
}

// CLI entry
if (process.argv[1]?.includes("track1")) {
  runTrack1().catch(console.error);
}
