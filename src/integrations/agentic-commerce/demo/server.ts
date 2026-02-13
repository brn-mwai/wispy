/**
 * Demo Server — starts all mock x402 services for hackathon demos.
 *
 * Usage:
 *   npx tsx src/integrations/agentic-commerce/demo/server.ts
 *
 * Or programmatically:
 *   import { startDemoServices, stopDemoServices } from "./server.js";
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { startAllServices, stopAllServices } from "../x402/seller.js";
import { DEMO_PORTS } from "../config.js";

/** Wait for a service health endpoint to respond */
async function waitForHealth(port: number, maxWaitMs = 5000): Promise<boolean> {
  const url = `http://127.0.0.1:${port}/health`;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Start all demo services with a fresh or provided seller key */
export async function startDemoServices(
  sellerPrivateKey?: string,
): Promise<{ sellerAddress: string; sellerKey: string }> {
  const key = sellerPrivateKey ?? generatePrivateKey();
  const account = privateKeyToAccount(key as `0x${string}`);
  const sellerAddress = account.address;

  await startAllServices(sellerAddress);

  // Wait for all services to be healthy before returning
  const ports = [DEMO_PORTS.weather, DEMO_PORTS.sentiment, DEMO_PORTS.report];
  for (const port of ports) {
    const healthy = await waitForHealth(port);
    if (!healthy) {
      console.warn(`[demo] Service on port ${port} did not become healthy in time`);
    }
  }

  return { sellerAddress, sellerKey: key };
}

export { stopAllServices as stopDemoServices };

// ─── CLI Entry Point ────────────────────────────────────────

const isDirectRun =
  process.argv[1]?.includes("demo/server") ||
  process.argv[1]?.includes("demo\\server");

if (isDirectRun) {
  const key = process.env.SELLER_PRIVATE_KEY ?? generatePrivateKey();
  console.log(`\nStarting demo services...\n`);

  startDemoServices(key)
    .then(({ sellerAddress }) => {
      console.log(`\nPress Ctrl+C to stop.\n`);
      process.on("SIGINT", async () => {
        console.log(`\nStopping services...`);
        await stopAllServices();
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error("Failed to start services:", err);
      process.exit(1);
    });
}
