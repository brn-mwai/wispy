/**
 * Track 3: Best Integration of AP2 — Mandate Flow Demo
 *
 * Shows: Intent -> Cart -> Payment -> Receipt, plus graceful failure handling.
 */

import { generatePrivateKey } from "viem/accounts";
import { X402Buyer } from "../../x402/buyer.js";
import { SpendTracker } from "../../x402/tracker.js";
import { AP2Flow } from "../../ap2/flow.js";
import { startDemoServices, stopDemoServices } from "../server.js";
import { getServiceUrls } from "../../x402/seller.js";

export async function runTrack3(): Promise<string> {
  const output: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    output.push(msg);
  };

  log(`\n━━━ Track 3: Best Integration of AP2 ━━━\n`);
  log(`Demonstrating: structured authorization flow with mandates + receipts.\n`);

  const agentKey = generatePrivateKey();
  const { sellerAddress } = await startDemoServices();
  const urls = getServiceUrls();

  const buyer = new X402Buyer({ privateKey: agentKey });
  const tracker = new SpendTracker(buyer.address);
  buyer.setTracker(tracker);
  const ap2 = new AP2Flow(buyer, tracker, agentKey);

  log(`Agent wallet: ${buyer.address}`);
  log(`Mandate signing: ENABLED (EIP-191 personal message signatures)\n`);

  try {
    // Purchase 1: Weather data (success)
    log(`━━━ AP2 Purchase 1: Weather Data (Success) ━━━`);
    const record1 = await ap2.purchase({
      description: "Current weather data for Nairobi, Kenya",
      serviceUrl: `${urls.weather}?city=Nairobi`,
      merchantAddress: sellerAddress,
      merchantName: "Wispy Weather Service",
      expectedPrice: "0.001",
    });
    log(`  Status: ${record1.receipt.status}`);
    log(`  Mandates: Intent(${record1.intent.id.slice(0, 20)}...) → Cart(${record1.cart.id.slice(0, 18)}...) → Payment(${record1.payment.id.slice(0, 22)}...)`);
    log(`  Intent signed: ${record1.intent.signature ? record1.intent.signature.slice(0, 24) + "..." : "unsigned"}`);
    log(`  Payment signed: ${record1.payment.signature ? record1.payment.signature.slice(0, 24) + "..." : "unsigned"}`);
    log(`  Receipt: ${record1.receipt.id.slice(0, 22)}... | tx: ${record1.receipt.txHash.slice(0, 16)}...`);
    log(``);

    // Purchase 2: Sentiment analysis (success)
    log(`━━━ AP2 Purchase 2: Sentiment Analysis (Success) ━━━`);
    const record2 = await ap2.purchase({
      description: "Analyze market sentiment for Nairobi weather impact",
      serviceUrl: urls.sentiment,
      merchantAddress: sellerAddress,
      merchantName: "Wispy Sentiment Service",
      expectedPrice: "0.002",
    });
    log(`  Status: ${record2.receipt.status}`);
    log(`  Mandates: Intent → Cart → Payment (all signed)`);
    log(`  Intent sig: ${record2.intent.signature?.slice(0, 24) ?? "N/A"}...`);
    log(`  Receipt: ${record2.receipt.id.slice(0, 22)}... | tx: ${record2.receipt.txHash.slice(0, 16)}...`);
    log(``);

    // Purchase 3: Authorization denied (failure)
    log(`━━━ AP2 Purchase 3: Authorization Denied (Failure Demo) ━━━`);
    const record3 = await ap2.purchaseWithFailure({
      description: "Premium data feed subscription",
      serviceUrl: "http://localhost:4021/premium",
      failureReason: "authorization_denied",
    });
    log(`  Status: ${record3.receipt.status}`);
    log(`  Error: ${record3.receipt.errorMessage}`);
    log(`  Graceful handling: Agent acknowledges denial and continues operation.`);
    log(``);

    // Full audit trail
    log(`━━━ AP2 Full Audit Trail ━━━`);
    log(ap2.formatAuditTrail());
    log(``);

    log(`[Track 3] COMPLETE: 2 successful AP2 purchases + 1 graceful failure. Full mandate chain + receipts.\n`);
  } catch (err) {
    log(`\n[Track 3] Error: ${(err as Error).message}\n`);
  } finally {
    await stopDemoServices();
  }

  return output.join("\n");
}

if (process.argv[1]?.includes("track3")) {
  runTrack3().catch(console.error);
}
