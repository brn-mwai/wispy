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

/** Start all demo services with a fresh or provided seller key */
export async function startDemoServices(
  sellerPrivateKey?: string,
): Promise<{ sellerAddress: string; sellerKey: string }> {
  const key = sellerPrivateKey ?? generatePrivateKey();
  const account = privateKeyToAccount(key as `0x${string}`);
  const sellerAddress = account.address;

  await startAllServices(sellerAddress);

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
