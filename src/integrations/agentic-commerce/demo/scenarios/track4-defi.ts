/**
 * Track 4: Best Trading/DeFi Agent — DeFi Agent with Guardrails Demo
 *
 * Shows: multi-source research, risk evaluation, swap execution,
 * guardrail enforcement (denial with reason codes).
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SpendTracker } from "../../x402/tracker.js";
import { RiskEngine } from "../../defi/risk-engine.js";
import { DeFiAgent } from "../../defi/swap.js";

export async function runTrack4(privateKey?: string): Promise<string> {
  const output: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    output.push(msg);
  };

  const isLive = !!privateKey;
  log(`\n━━━ Track 4: Best Trading / DeFi Agent ━━━\n`);
  log(`Mode: ${isLive ? "LIVE (real on-chain swaps)" : "SIMULATION (fresh wallet)"}`);
  log(`Demonstrating: multi-source research, risk evaluation, swap execution, guardrail enforcement.\n`);

  const agentKey = (privateKey ?? generatePrivateKey()) as `0x${string}`;
  const agentAddress = privateKeyToAccount(agentKey).address;
  const riskEngine = new RiskEngine({
    maxPositionSize: isLive ? 0.005 : 0.5,
    maxSlippageBps: 100,
    dailyLossLimit: isLive ? 0.02 : 2.0,
    requireHumanApproval: false,
    cooldownMs: 0, // No cooldown for demo
  });
  const tracker = new SpendTracker(agentAddress);
  const defi = new DeFiAgent(agentKey, riskEngine, tracker);

  log(`Risk Profile:`);
  const profile = riskEngine.getProfile();
  log(`  Max position: $${profile.maxPositionSize} USDC`);
  log(`  Max slippage: ${profile.maxSlippageBps}bps (${profile.maxSlippageBps / 100}%)`);
  log(`  Daily loss limit: $${profile.dailyLossLimit} USDC`);
  log(``);

  // Research phase
  log(`━━━ Research Phase ━━━`);
  const research = await defi.research("ETH");
  log(`  ETH price: $${research.price}`);
  log(`  24h change: ${research.change24h > 0 ? "+" : ""}${research.change24h}%`);
  log(`  Volume: $${research.volume.toLocaleString()}`);
  log(`  Sources: ${research.sources.join(", ")}`);
  log(`  Recommendation: ${research.recommendation}`);
  log(``);

  // Trade 1: Small swap within limits (should be approved)
  const trade1Amount = isLive ? "0.001" : "0.1";
  log(`━━━ Trade 1: Small Swap (Within Limits) ━━━`);
  const swap1 = await defi.swap({
    fromToken: "USDC",
    toToken: "ETH",
    amount: trade1Amount,
    reasoning: `Research shows ${research.change24h > 0 ? "positive" : "mixed"} movement. Small position to test market.`,
  });
  log(`  Decision: ${swap1.decision.approved ? "APPROVED" : "DENIED"}`);
  log(`  Risk score: ${swap1.decision.riskScore}/100`);
  if (swap1.success) {
    log(`  Executed: ${swap1.amountIn} USDC -> ${swap1.amountOut} ETH`);
    log(`  Tx: ${swap1.txHash?.slice(0, 20)}...`);
  } else {
    log(`  Error: ${swap1.error}`);
  }
  log(``);

  // Trade 2: Large swap exceeding position limit (should be denied)
  log(`━━━ Trade 2: Large Swap (Exceeds Position Limit) ━━━`);
  const swap2 = await defi.swap({
    fromToken: "USDC",
    toToken: "ETH",
    amount: "1.0",
    reasoning: "Want to take a larger position in ETH.",
  });
  log(`  Decision: ${swap2.decision.approved ? "APPROVED" : "DENIED"}`);
  log(`  Risk score: ${swap2.decision.riskScore}/100`);
  log(`  Denial reason: ${swap2.decision.denialReason ?? "N/A"}`);
  log(`  Agent response: Acknowledged denial, adjusting strategy to stay within risk bounds.`);
  log(``);

  // Trade 3: Another small swap (should be approved)
  const trade3Amount = isLive ? "0.002" : "0.2";
  log(`━━━ Trade 3: Adjusted Swap (Within Limits) ━━━`);
  const swap3 = await defi.swap({
    fromToken: "USDC",
    toToken: "ETH",
    amount: trade3Amount,
    reasoning: "Reduced position size after previous denial. Risk-adjusted entry.",
  });
  log(`  Decision: ${swap3.decision.approved ? "APPROVED" : "DENIED"}`);
  log(`  Risk score: ${swap3.decision.riskScore}/100`);
  if (swap3.success) {
    log(`  Executed: ${swap3.amountIn} USDC -> ${swap3.amountOut} ETH`);
  }
  log(``);

  // Trade log
  log(`━━━ Full Trade Log ━━━`);
  log(defi.getTradeLog());
  log(``);

  const approved = riskEngine.getHistory().filter((d) => d.approved).length;
  const denied = riskEngine.getHistory().filter((d) => !d.approved).length;
  log(`[Track 4] COMPLETE: ${approved} trades approved, ${denied} denied by risk engine. Full reason codes logged.\n`);

  return output.join("\n");
}

if (process.argv[1]?.includes("track4")) {
  runTrack4(process.env.AGENT_PRIVATE_KEY).catch(console.error);
}
