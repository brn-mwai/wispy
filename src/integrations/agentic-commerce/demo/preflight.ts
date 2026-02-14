/**
 * Pre-flight balance checker — verifies wallet has sFUEL + USDC before demo.
 */

import { createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SKALE_BITE_SANDBOX, skaleBiteSandbox, ERC20_ABI } from "../config.js";

export interface PreflightResult {
  address: string;
  sFuelBalance: string;
  usdcBalance: number;
  ready: boolean;
  mode: "live" | "simulation";
  warnings: string[];
}

export async function runPreflight(
  privateKey?: string,
): Promise<PreflightResult> {
  if (!privateKey) {
    return {
      address: "N/A (fresh key per scenario)",
      sFuelBalance: "0",
      usdcBalance: 0,
      ready: true,
      mode: "simulation",
      warnings: [
        "No AGENT_PRIVATE_KEY set. Running in simulation mode (fresh keys, no real settlement).",
      ],
    };
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createPublicClient({
    chain: skaleBiteSandbox,
    transport: http(SKALE_BITE_SANDBOX.rpcUrl),
  });

  const [sFuelRaw, usdcRaw] = await Promise.all([
    client.getBalance({ address: account.address }),
    client.readContract({
      address: SKALE_BITE_SANDBOX.usdc as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);

  const sFuelBalance = formatEther(sFuelRaw);
  const usdcBalance = Number(usdcRaw) / 1_000_000;
  const warnings: string[] = [];

  if (sFuelRaw === 0n)
    warnings.push("sFUEL balance is 0. Request sFUEL from @TheGreatAxios.");
  if (usdcBalance < 0.01)
    warnings.push(
      `USDC balance ($${usdcBalance.toFixed(6)}) is low. Demo needs ~$0.01.`,
    );

  return {
    address: account.address,
    sFuelBalance,
    usdcBalance,
    ready: usdcBalance >= 0.004,
    mode: "live",
    warnings,
  };
}
