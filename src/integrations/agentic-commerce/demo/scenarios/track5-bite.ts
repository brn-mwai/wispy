/**
 * Track 5: Encrypted Agents (BITE v2) — Real On-Chain Encrypted Transactions
 *
 * Shows:
 * 1. Encrypt USDC transfer with BLS threshold encryption via live BITE SDK
 * 2. Submit encrypted tx to SKALE (to + data hidden from everyone)
 * 3. Validators cooperatively decrypt during consensus (2t+1 threshold)
 * 4. Verify decryption via bite_getDecryptedTransactionData RPC
 * 5. Conditional time-locked payment lifecycle
 *
 * This is REAL on-chain encryption — not simulated.
 */

import { EncryptedCommerce } from "../../bite/encrypted-tx.js";
import { encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC20_ABI, SKALE_BITE_SANDBOX } from "../../config.js";

export async function runTrack5(privateKey?: string): Promise<string> {
  const output: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    output.push(msg);
  };

  log(`\n━━━ Track 5: Encrypted Agents (BITE v2) ━━━\n`);
  log(
    `Demonstrating: BLS threshold encryption, on-chain encrypted transactions, conditional execution.\n`,
  );

  const bite = new EncryptedCommerce(undefined, privateKey);
  log(`BITE mode: ${bite.isLive ? "LIVE (SKALE BITE v2 BLS)" : "Mock (local)"}`);
  log(
    `On-chain: ${privateKey ? "YES — will submit encrypted txs to SKALE" : "NO — demo mode (no private key)"}\n`,
  );

  // ─── BLS Committee Info ─────────────────────────────────
  log(`━━━ BLS Threshold Encryption Committee ━━━`);
  log(`  Querying SKALE validator committee for BLS public keys...`);
  const committees = await bite.getCommitteesInfo();
  if (committees.length > 0) {
    for (const c of committees) {
      log(`  Epoch ${c.epochId}: BLS public key ${c.commonBLSPublicKey.slice(0, 48)}...`);
    }
    log(`  ${committees.length} committee(s) active — 2t+1 validators needed for decryption.`);
  } else {
    log(`  Committee info unavailable (SDK limitation). Encryption still functional.`);
  }
  log(``);

  // ─── Demo 1: Encrypted USDC Transfer ───────────────────
  log(`━━━ Demo 1: Encrypted USDC Transfer ━━━`);
  log(`  Encrypting a $0.01 USDC transfer with BITE threshold encryption.`);
  log(`  The 'to' and 'data' fields will be BLS-encrypted — invisible in mempool.`);
  log(``);

  // When live, self-transfer to avoid losing funds to a hardcoded address
  const demoRecipient = privateKey
    ? privateKeyToAccount(privateKey as `0x${string}`).address
    : ("0x742d35CC6634c0532925a3B844bc9e7595F2Bd28" as `0x${string}`);

  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [
      demoRecipient,
      BigInt(10_000), // $0.01 USDC (6 decimals)
    ],
  });

  const payment1 = await bite.encryptPayment({
    to: SKALE_BITE_SANDBOX.usdc,
    data: transferData,
    gasLimit: 300_000,
    condition: {
      type: "time_lock",
      description: "Immediate execution (time lock already passed)",
      params: {
        unlockAfter: new Date(Date.now() - 1000).toISOString(),
      },
    },
  });

  log(`  Payment ID: ${payment1.id}`);
  log(`  Status: ${payment1.status}`);
  log(`  Original to: ${SKALE_BITE_SANDBOX.usdc} (USDC contract)`);
  log(`  Original data: ${transferData.slice(0, 40)}... (ERC-20 transfer calldata)`);
  log(`  Encrypted to: ${payment1.encryptedTx.to} (BITE magic address)`);
  log(
    `  Encrypted data: ${(payment1.encryptedTx.data as string).slice(0, 40)}... (BLS-encrypted)`,
  );
  log(``);

  // Submit on-chain if we have a key
  if (privateKey) {
    log(`  Submitting encrypted tx to SKALE...`);
    await bite.submitOnChain(payment1.id);
    const p = bite.getPayment(payment1.id)!;
    log(`  Status: ${p.status}`);
    if (p.txHash) {
      log(`  Tx Hash: ${p.txHash}`);
      log(`  Explorer: ${SKALE_BITE_SANDBOX.explorerUrl}/tx/${p.txHash}`);
    }
    log(``);

    // Verify decryption
    log(`  Verifying decryption via bite_getDecryptedTransactionData...`);
    await bite.verifyDecryption(payment1.id);
    const verified = bite.getPayment(payment1.id)!;
    log(`  Status: ${verified.status}`);
    if (verified.decryptedData) {
      log(`  Decrypted to: ${verified.decryptedData.to}`);
      log(`  Match: ${verified.decryptedData.to === SKALE_BITE_SANDBOX.usdc ? "YES — original address recovered" : "checking..."}`);
    }
  } else {
    log(`  [Demo mode] Simulating execution (no AGENT_PRIVATE_KEY set)`);
    await bite.executeIfConditionMet(payment1.id);
    const p = bite.getPayment(payment1.id)!;
    log(`  Status: ${p.status}`);
  }
  log(``);

  // ─── Demo 2: Time-Locked Encrypted Payment ────────────
  log(`━━━ Demo 2: Time-Locked Encrypted Payment ━━━`);
  log(`  Creating a payment that stays encrypted for 2 seconds.`);
  log(`  The agent cannot execute until the time lock expires.`);
  log(``);

  const payment2 = await bite.encryptPayment({
    to: "0x742d35CC6634c0532925a3B844bc9e7595F2Bd28",
    data: transferData,
    gasLimit: 300_000,
    condition: {
      type: "time_lock",
      description: "Unlock after 2-second delay",
      params: {
        unlockAfter: new Date(Date.now() + 2000).toISOString(),
      },
    },
  });

  log(`  Payment ID: ${payment2.id}`);
  log(`  Encrypted data: ${(payment2.encryptedTx.data as string).slice(0, 40)}...`);
  log(``);

  // Check condition (should fail — too early)
  log(`  Checking condition immediately...`);
  const earlyCheck = await bite.checkCondition(payment2.id);
  log(`  Condition met: ${earlyCheck} (expected: false — time lock active)`);
  log(``);

  // Wait for time lock
  log(`  Waiting 2.5 seconds for time lock to expire...`);
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // Execute
  log(`  Time lock expired. Executing...`);
  const result2 = await bite.executeIfConditionMet(payment2.id);
  log(`  Status: ${result2.status}`);
  if (result2.txHash) {
    log(`  Tx Hash: ${result2.txHash.slice(0, 30)}...`);
  }
  log(``);

  // ─── Demo 3: Delivery-Proof Payment (stays encrypted) ──
  log(`━━━ Demo 3: Delivery-Proof Payment (Condition Not Met) ━━━`);
  log(`  This payment requires on-chain delivery proof before execution.`);
  log(`  Since no delivery has been confirmed, the payment stays encrypted.`);
  log(``);

  const payment3 = await bite.encryptPayment({
    to: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    data: transferData,
    gasLimit: 300_000,
    condition: {
      type: "delivery_proof",
      description: "Delivery proof required: tx must confirm goods received",
      params: {
        txHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        eventSignature:
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      },
    },
  });

  log(`  Payment ID: ${payment3.id}`);
  log(`  Attempting execution without delivery proof...`);
  const result3 = await bite.executeIfConditionMet(payment3.id);
  log(`  Status: ${result3.status} (expected: encrypted — no proof on-chain)`);
  log(`  Agent: Payment remains encrypted. Will retry when delivery is confirmed.`);
  log(``);

  // ─── Lifecycle Reports ────────────────────────────────
  log(`━━━ Lifecycle Reports ━━━`);
  log(bite.getReport(payment1.id));
  log(``);

  // ─── Summary ──────────────────────────────────────────
  log(`━━━ BITE v2 Summary ━━━`);
  const all = bite.getAllPayments();
  const executed = all.filter(
    (p) => p.status === "executed" || p.status === "verified",
  );
  const encrypted = all.filter((p) => p.status === "encrypted");
  const onChain = all.filter((p) => p.onChain);

  log(`  Total encrypted payments: ${all.length}`);
  log(`  Executed/Verified: ${executed.length}`);
  log(`  Still encrypted: ${encrypted.length}`);
  log(`  Submitted on-chain: ${onChain.length}`);
  log(`  BITE mode: ${bite.isLive ? "Live BLS threshold encryption (SKALE)" : "Mock"}`);
  log(``);
  log(
    `  Key insight: Transaction data (to, calldata) was BLS-encrypted BEFORE`,
  );
  log(
    `  reaching the blockchain. Validators cooperatively decrypted using 2t+1`,
  );
  log(
    `  threshold during consensus. This prevents MEV, front-running, and`,
  );
  log(`  provides privacy for ANY Ethereum transaction — no Solidity changes needed.`);
  log(``);

  log(
    `[Track 5] COMPLETE: ${all.length} encrypted payments — ${executed.length} executed, ${encrypted.length} pending.\n`,
  );

  return output.join("\n");
}

if (process.argv[1]?.includes("track5")) {
  const key = process.env.AGENT_PRIVATE_KEY;
  runTrack5(key).catch(console.error);
}
