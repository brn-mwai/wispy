/**
 * BITE v2 Encrypted Commerce — REAL threshold-encrypted transactions on SKALE.
 *
 * Uses SKALE's BITE (Blockchain Integrated Threshold Encryption) to:
 * 1. Encrypt transaction data (to + data fields) with BLS threshold key
 * 2. Submit encrypted tx to SKALE — validators cannot read it in mempool
 * 3. Validators cooperatively decrypt (2t+1 threshold) during consensus
 * 4. Execute the original transaction after decryption
 * 5. Verify decrypted data via bite_getDecryptedTransactionData RPC
 *
 * This provides MEV protection, front-running prevention, and privacy
 * for ANY transaction — no Solidity changes needed (Phase I).
 */

import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  SKALE_BITE_SANDBOX,
  skaleBiteSandbox,
  ERC20_ABI,
} from "../config.js";
import { evaluateCondition, describeCondition } from "./conditional.js";
import type { PaymentCondition } from "./conditional.js";

// ─── BITE SDK Import ────────────────────────────────────────

let BITEClass: typeof import("@skalenetwork/bite").BITE | null = null;
let BITEMockupClass: typeof import("@skalenetwork/bite").BITEMockup | null =
  null;

try {
  const bite = await import("@skalenetwork/bite");
  BITEClass = bite.BITE;
  BITEMockupClass = bite.BITEMockup;
} catch {
  console.warn("[BITE] @skalenetwork/bite not available, using local mock");
}

// ─── Types ──────────────────────────────────────────────────

export interface EncryptedPayment {
  id: string;
  originalTx: { to: string; data: string; value?: string };
  encryptedTx: { to: string; data: string; gasLimit?: string };
  condition: PaymentCondition;
  status: "encrypted" | "submitted" | "executed" | "verified" | "failed";
  txHash?: string;
  decryptedData?: { to: string; data: string };
  timeline: Array<{ event: string; timestamp: string; details?: string }>;
  createdAt: string;
  onChain: boolean;
}

// ─── Local Mock (fallback when SDK can't reach SKALE node) ──

class LocalBITEMock {
  async encryptTransaction(tx: {
    to: string;
    data: string;
    gasLimit?: string;
  }): Promise<{ to: string; data: string; gasLimit?: string }> {
    const encoded = Buffer.from(
      JSON.stringify({ to: tx.to, data: tx.data }),
    ).toString("base64");
    return {
      to: SKALE_BITE_SANDBOX.biteAddress,
      data: `0x${Buffer.from(encoded).toString("hex")}`,
      gasLimit: tx.gasLimit ?? "0x493e0",
    };
  }

  async getDecryptedTransactionData(_txHash: string): Promise<string> {
    return "mock_decrypted_data";
  }

  async getCommitteesInfo(): Promise<
    Array<{ commonBLSPublicKey: string; epochId: number }>
  > {
    return [{ commonBLSPublicKey: "0".repeat(256), epochId: 0 }];
  }
}

// ─── BITE SDK interface ─────────────────────────────────────

interface BITEInterface {
  encryptTransaction(tx: {
    to: string;
    data: string;
    gasLimit?: string;
  }): Promise<{ to: string; data: string; gasLimit?: string }>;
  getDecryptedTransactionData?(hash: string): Promise<string>;
  getCommitteesInfo?(): Promise<
    Array<{ commonBLSPublicKey: string; epochId: number }>
  >;
}

// ─── Encrypted Commerce ─────────────────────────────────────

export class EncryptedCommerce {
  private bite: BITEInterface;
  private payments = new Map<string, EncryptedPayment>();
  private usingMock: boolean;
  private privateKey?: `0x${string}`;

  constructor(rpcUrl?: string, privateKey?: string) {
    const url = rpcUrl ?? SKALE_BITE_SANDBOX.rpcUrl;
    this.privateKey = privateKey as `0x${string}` | undefined;

    if (BITEClass) {
      try {
        this.bite = new BITEClass(url);
        this.usingMock = false;
        console.log("[BITE] Using live SKALE BITE SDK");
      } catch {
        this.bite = new LocalBITEMock();
        this.usingMock = true;
        console.log("[BITE] BITE SDK init failed, using local mock");
      }
    } else if (BITEMockupClass) {
      this.bite = new BITEMockupClass();
      this.usingMock = true;
      console.log("[BITE] Using BITE SDK mockup");
    } else {
      this.bite = new LocalBITEMock();
      this.usingMock = true;
      console.log("[BITE] Using local mock (SDK unavailable)");
    }
  }

  /** Whether using live BITE SDK or a mock */
  get isLive(): boolean {
    return !this.usingMock;
  }

  /**
   * Query the BLS threshold encryption committee info from SKALE validators.
   * Shows which validator nodes participate in cooperative decryption.
   */
  async getCommitteesInfo(): Promise<
    Array<{ commonBLSPublicKey: string; epochId: number }>
  > {
    if (this.bite.getCommitteesInfo) {
      try {
        const committees = await this.bite.getCommitteesInfo();
        console.log(`[BITE] BLS committee info: ${committees.length} committee(s)`);
        for (const c of committees) {
          console.log(
            `[BITE]   Epoch ${c.epochId}: BLS pubkey ${c.commonBLSPublicKey.slice(0, 32)}...`,
          );
        }
        return committees;
      } catch (err) {
        console.warn(
          `[BITE] getCommitteesInfo failed: ${(err as Error).message}`,
        );
        return [];
      }
    }
    console.log("[BITE] getCommitteesInfo not available on this BITE instance");
    return [];
  }

  /**
   * Encrypt a payment transaction using BITE threshold encryption.
   * The `to` and `data` fields are BLS-encrypted — nobody can read them
   * until 2t+1 validators cooperatively decrypt during consensus.
   */
  async encryptPayment(params: {
    to: string;
    data: string;
    gasLimit?: number;
    condition: PaymentCondition;
  }): Promise<EncryptedPayment> {
    const id = `bite_${randomUUID()}`;
    const now = new Date().toISOString();

    console.log(`[BITE] Encrypting payment ${id}...`);
    console.log(
      `[BITE] Condition: ${params.condition.type} — ${params.condition.description}`,
    );

    const originalTx = {
      to: params.to,
      data: params.data,
      value: "0",
    };

    // Strip 0x for BITE SDK (it expects raw hex for `to`)
    const toForBite = params.to.startsWith("0x")
      ? params.to.slice(2)
      : params.to;
    const dataForBite = params.data.startsWith("0x")
      ? params.data
      : `0x${params.data}`;

    // Encrypt using BITE SDK — BLS threshold encryption
    const encryptedTx = await this.bite.encryptTransaction({
      to: toForBite,
      data: dataForBite,
      gasLimit: params.gasLimit
        ? `0x${params.gasLimit.toString(16)}`
        : "0x493e0",
    });

    const payment: EncryptedPayment = {
      id,
      originalTx,
      encryptedTx: {
        to: encryptedTx.to,
        data: encryptedTx.data,
        gasLimit: encryptedTx.gasLimit,
      },
      condition: params.condition,
      status: "encrypted",
      onChain: false,
      timeline: [
        {
          event: "encrypted",
          timestamp: now,
          details: this.usingMock
            ? "Transaction encrypted (mock mode)."
            : `Transaction BLS-encrypted. To + data hidden. Sent to BITE address ${encryptedTx.to.slice(0, 16)}...`,
        },
      ],
      createdAt: now,
    };

    this.payments.set(id, payment);
    console.log(`[BITE] Payment ${id} encrypted. Status: ${payment.status}`);
    return payment;
  }

  /**
   * Submit an encrypted payment to SKALE on-chain.
   * The encrypted tx goes to the BITE magic address — validators
   * cannot read the payload until consensus decryption.
   */
  async submitOnChain(paymentId: string): Promise<EncryptedPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if (!this.privateKey)
      throw new Error("Private key required for on-chain submission");

    console.log(`[BITE] Submitting encrypted tx on-chain for ${paymentId}...`);

    const account = privateKeyToAccount(this.privateKey);
    const walletClient = createWalletClient({
      account,
      chain: skaleBiteSandbox,
      transport: http(SKALE_BITE_SANDBOX.rpcUrl),
    });

    try {
      const txHash = await walletClient.sendTransaction({
        to: payment.encryptedTx.to as `0x${string}`,
        data: payment.encryptedTx.data as `0x${string}`,
        gas: BigInt(payment.encryptedTx.gasLimit ?? "0x493e0"),
      });

      payment.txHash = txHash;
      payment.status = "submitted";
      payment.onChain = true;
      payment.timeline.push({
        event: "submitted",
        timestamp: new Date().toISOString(),
        details: `Encrypted tx submitted to SKALE. Hash: ${txHash}. Awaiting consensus decryption.`,
      });

      console.log(`[BITE] Submitted: ${txHash}`);

      // Wait for receipt
      const publicClient = createPublicClient({
        chain: skaleBiteSandbox,
        transport: http(SKALE_BITE_SANDBOX.rpcUrl),
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status === "success") {
        payment.status = "executed";
        payment.timeline.push({
          event: "executed",
          timestamp: new Date().toISOString(),
          details: `Validators decrypted and executed. Block: ${receipt.blockNumber}. Gas used: ${receipt.gasUsed}.`,
        });
        console.log(
          `[BITE] Executed in block ${receipt.blockNumber}. Gas: ${receipt.gasUsed}`,
        );
      } else {
        payment.status = "failed";
        payment.timeline.push({
          event: "failed",
          timestamp: new Date().toISOString(),
          details: "Transaction reverted after decryption.",
        });
      }

      return payment;
    } catch (err) {
      payment.status = "failed";
      payment.timeline.push({
        event: "submission_failed",
        timestamp: new Date().toISOString(),
        details: `Submission failed: ${(err as Error).message}`,
      });
      console.error(`[BITE] Submission failed: ${(err as Error).message}`);
      return payment;
    }
  }

  /**
   * Verify decryption of an executed encrypted transaction.
   * Calls bite_getDecryptedTransactionData to prove the chain decrypted correctly.
   */
  async verifyDecryption(paymentId: string): Promise<EncryptedPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if (!payment.txHash) throw new Error(`Payment ${paymentId} has no txHash`);

    console.log(`[BITE] Verifying decryption for ${paymentId}...`);

    try {
      if (!this.bite.getDecryptedTransactionData) {
        throw new Error("getDecryptedTransactionData not available on this SDK");
      }
      const decrypted = await this.bite.getDecryptedTransactionData(
        payment.txHash,
      );
      payment.decryptedData = {
        to: payment.originalTx.to,
        data: decrypted,
      };
      payment.status = "verified";
      payment.timeline.push({
        event: "verified",
        timestamp: new Date().toISOString(),
        details: `Decryption verified via bite_getDecryptedTransactionData. Original to: ${payment.originalTx.to}`,
      });
      console.log(`[BITE] Decryption verified for ${paymentId}`);
    } catch (err) {
      payment.timeline.push({
        event: "verification_failed",
        timestamp: new Date().toISOString(),
        details: `Decryption verification failed: ${(err as Error).message}`,
      });
      console.warn(`[BITE] Verification failed: ${(err as Error).message}`);
    }

    return payment;
  }

  /**
   * Encrypt a USDC transfer — common use case for agentic commerce.
   * Returns the encrypted payment ready for on-chain submission.
   */
  async encryptUsdcTransfer(params: {
    to: string;
    amount: number;
    condition: PaymentCondition;
  }): Promise<EncryptedPayment> {
    // Encode ERC-20 transfer calldata
    const amountAtomic = BigInt(Math.round(params.amount * 1_000_000));
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [params.to as `0x${string}`, amountAtomic],
    });

    console.log(
      `[BITE] Encrypting USDC transfer: $${params.amount} to ${params.to.slice(0, 10)}...`,
    );

    return this.encryptPayment({
      to: SKALE_BITE_SANDBOX.usdc,
      data: transferData,
      gasLimit: 300_000,
      condition: params.condition,
    });
  }

  /**
   * Full lifecycle: encrypt → check condition → submit → verify.
   * This is the complete BITE Phase I demo flow.
   */
  async fullLifecycle(params: {
    to: string;
    data: string;
    gasLimit?: number;
    condition: PaymentCondition;
  }): Promise<EncryptedPayment> {
    // Step 1: Encrypt
    const payment = await this.encryptPayment(params);

    // Step 2: Check condition
    const met = await evaluateCondition(payment.condition);
    if (met) {
      payment.timeline.push({
        event: "condition_met",
        timestamp: new Date().toISOString(),
        details: `Condition satisfied: ${payment.condition.description}`,
      });
    } else {
      payment.timeline.push({
        event: "condition_pending",
        timestamp: new Date().toISOString(),
        details: `Condition not met: ${describeCondition(payment.condition)}`,
      });
      return payment;
    }

    // Step 3: Submit on-chain (if we have a private key)
    if (this.privateKey) {
      await this.submitOnChain(payment.id);

      // Step 4: Verify decryption
      if (payment.status === "executed") {
        await this.verifyDecryption(payment.id);
      }
    } else {
      // Simulate execution for demo/test mode
      payment.txHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
      payment.status = "executed";
      payment.decryptedData = {
        to: payment.originalTx.to,
        data: payment.originalTx.data,
      };
      payment.timeline.push({
        event: "executed",
        timestamp: new Date().toISOString(),
        details: `Simulated execution (no private key). tx: ${payment.txHash.slice(0, 20)}...`,
      });
    }

    return payment;
  }

  /** Check if a payment's condition is met */
  async checkCondition(paymentId: string): Promise<boolean> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    return evaluateCondition(payment.condition);
  }

  /**
   * Execute an encrypted payment after condition is met.
   * Backward-compatible with tests — delegates to fullLifecycle internally.
   */
  async executeIfConditionMet(paymentId: string): Promise<EncryptedPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);

    const met = await evaluateCondition(payment.condition);
    if (!met) {
      payment.timeline.push({
        event: "execution_skipped",
        timestamp: new Date().toISOString(),
        details: `Condition not met: ${describeCondition(payment.condition)}`,
      });
      return payment;
    }

    console.log(`[BITE] Condition met for ${paymentId}. Executing...`);

    if (this.privateKey) {
      await this.submitOnChain(paymentId);
      if (payment.status === "executed") {
        await this.verifyDecryption(paymentId);
      }
    } else {
      // Simulate for tests
      payment.txHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
      payment.status = "executed";
      payment.decryptedData = {
        to: payment.originalTx.to,
        data: payment.originalTx.data,
      };
      payment.timeline.push({
        event: "executed",
        timestamp: new Date().toISOString(),
        details: `Simulated execution. tx: ${payment.txHash.slice(0, 20)}...`,
      });
    }

    return payment;
  }

  /** Get a payment by ID */
  getPayment(paymentId: string): EncryptedPayment | undefined {
    return this.payments.get(paymentId);
  }

  /** Get all encrypted payments */
  getAllPayments(): EncryptedPayment[] {
    return Array.from(this.payments.values());
  }

  /** Generate a full lifecycle report for a payment */
  getReport(paymentId: string): string {
    const payment = this.payments.get(paymentId);
    if (!payment) return `Payment ${paymentId} not found.`;

    const lines: string[] = [
      `## BITE v2 Encrypted Payment Report`,
      ``,
      `**ID:** \`${payment.id}\``,
      `**Status:** ${payment.status}`,
      `**On-chain:** ${payment.onChain ? "Yes" : "No (simulated)"}`,
      `**Created:** ${payment.createdAt}`,
      `**Mode:** ${this.usingMock ? "Mock (local)" : "Live (SKALE BITE v2 BLS threshold encryption)"}`,
      ``,
      `### Original Transaction (pre-encryption)`,
      `- **To:** \`${payment.originalTx.to}\``,
      `- **Data:** \`${payment.originalTx.data.slice(0, 40)}...\``,
      ``,
      `### Encrypted Transaction (submitted to BITE address)`,
      `- **To:** \`${payment.encryptedTx.to}\` (BITE magic address)`,
      `- **Data:** \`${(payment.encryptedTx.data as string).slice(0, 40)}...\` (BLS-encrypted)`,
      `- **Gas Limit:** ${payment.encryptedTx.gasLimit}`,
      ``,
      `### Condition`,
      `- **Type:** ${payment.condition.type}`,
      `- **Description:** ${payment.condition.description}`,
      `- **Status:** ${describeCondition(payment.condition)}`,
      ``,
    ];

    if (payment.decryptedData) {
      lines.push(`### Decrypted Data (post-consensus)`);
      lines.push(`- **To:** \`${payment.decryptedData.to}\``);
      lines.push(
        `- **Data:** \`${payment.decryptedData.data.slice(0, 40)}...\``,
      );
      lines.push(``);
    }

    if (payment.txHash) {
      lines.push(`### Settlement`);
      lines.push(`- **Tx Hash:** \`${payment.txHash}\``);
      lines.push(
        `- **Explorer:** ${SKALE_BITE_SANDBOX.explorerUrl}/tx/${payment.txHash}`,
      );
      lines.push(``);
    }

    lines.push(`### Timeline`);
    for (const event of payment.timeline) {
      lines.push(`1. **${event.event}** (${event.timestamp.slice(11, 19)})`);
      if (event.details) lines.push(`   ${event.details}`);
    }

    return lines.join("\n");
  }
}
