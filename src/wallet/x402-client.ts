/**
 * x402 Payment Client
 *
 * HTTP-native payments using the x402 protocol.
 * Integrates with @coinbase/x402 SDK and TrustController for payment approvals.
 */

import { ethers } from "ethers";
import { createFacilitatorConfig } from "@coinbase/x402";
import { createLogger } from "../infra/logger.js";
import { getTrustController } from "../trust/controller.js";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { encryptCredential, decryptCredential } from "../security/encryption.js";
import type { DeviceIdentity } from "../security/device-identity.js";
import { resolve } from "path";

const log = createLogger("x402");

// Initialize Coinbase facilitator with env credentials
const facilitator = createFacilitatorConfig(
  process.env.CDP_API_KEY_ID,
  process.env.CDP_API_KEY_SECRET
);

// Base mainnet USDC
const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export interface PaymentDetails {
  amount: string;
  currency: string;
  recipient: string;
  network: string;
  description?: string;
  facilitatorUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface X402WalletState {
  address: string;
  encryptedKey: string;
  chain: string;
  createdAt: string;
}

export class X402Client {
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;
  private usdc: ethers.Contract;
  private runtimeDir: string;
  private maxPaymentAmount: number;
  private autoApproveThreshold: number;

  constructor(
    privateKey: string,
    runtimeDir: string,
    options: {
      rpcUrl?: string;
      maxPaymentAmount?: number;
      autoApproveThreshold?: number;
    } = {}
  ) {
    const rpcUrl = options.rpcUrl || "https://mainnet.base.org";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.usdc = new ethers.Contract(USDC_BASE_ADDRESS, USDC_ABI, this.wallet);
    this.runtimeDir = runtimeDir;
    this.maxPaymentAmount = options.maxPaymentAmount || 10; // Max $10 USDC
    this.autoApproveThreshold = options.autoApproveThreshold || 0.1; // Auto-approve under $0.10
  }

  get address(): string {
    return this.wallet.address;
  }

  get signer(): ethers.Signer {
    return this.wallet;
  }

  /**
   * Get USDC balance
   */
  async getUSDCBalance(): Promise<string> {
    try {
      const balance = await this.usdc.balanceOf(this.wallet.address);
      return ethers.formatUnits(balance, 6);
    } catch (err) {
      log.error({ err }, "Failed to get USDC balance");
      return "0";
    }
  }

  /**
   * Get ETH balance (for gas)
   */
  async getETHBalance(): Promise<string> {
    try {
      const balance = await this.provider.getBalance(this.wallet.address);
      return ethers.formatEther(balance);
    } catch (err) {
      log.error({ err }, "Failed to get ETH balance");
      return "0";
    }
  }

  /**
   * Make an x402 fetch request
   * Handles 402 Payment Required responses automatically
   */
  async fetch(
    url: string,
    options: RequestInit = {},
    context?: { channel?: string; userId?: string }
  ): Promise<Response> {
    // Initial request
    const initialResponse = await fetch(url, options);

    // If not 402, return as-is
    if (initialResponse.status !== 402) {
      return initialResponse;
    }

    // Parse payment requirements from header
    const paymentHeader = initialResponse.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      throw new Error("402 response missing X-PAYMENT header");
    }

    const paymentDetails: PaymentDetails = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString()
    );

    log.info("Payment required: %s %s to %s",
      paymentDetails.amount,
      paymentDetails.currency,
      paymentDetails.recipient.slice(0, 10) + "..."
    );

    // Check amount limits
    const amount = parseFloat(paymentDetails.amount);
    if (amount > this.maxPaymentAmount) {
      throw new Error(`Payment amount $${amount} exceeds max limit $${this.maxPaymentAmount}`);
    }

    // Request approval if above auto-approve threshold
    let approved = amount <= this.autoApproveThreshold;

    if (!approved) {
      const trust = getTrustController();
      approved = await trust.requestApproval({
        action: "x402_payment",
        description: `Pay $${paymentDetails.amount} ${paymentDetails.currency} for API access`,
        metadata: {
          url,
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          recipient: paymentDetails.recipient,
          network: paymentDetails.network,
        },
        channel: context?.channel || "cli",
        userId: context?.userId || "default",
      });
    }

    if (!approved) {
      throw new Error("Payment not approved by user");
    }

    // Execute payment
    const paymentResult = await this.executePayment(paymentDetails);
    if (!paymentResult.success) {
      throw new Error(`Payment failed: ${paymentResult.error}`);
    }

    // Create payment proof
    const paymentProof = {
      txHash: paymentResult.txHash,
      amount: paymentDetails.amount,
      currency: paymentDetails.currency,
      recipient: paymentDetails.recipient,
      payer: this.wallet.address,
      timestamp: Date.now(),
    };

    // Retry request with payment proof
    const paymentResponse = Buffer.from(JSON.stringify(paymentProof)).toString("base64");

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "X-PAYMENT-RESPONSE": paymentResponse,
      },
    });
  }

  /**
   * Execute a USDC payment
   */
  async executePayment(details: PaymentDetails): Promise<PaymentResult> {
    try {
      const amountWei = ethers.parseUnits(details.amount, 6);

      // Check balance
      const balance = await this.usdc.balanceOf(this.wallet.address);
      if (balance < amountWei) {
        return {
          success: false,
          error: `Insufficient USDC balance: ${ethers.formatUnits(balance, 6)}`,
        };
      }

      // Execute transfer
      log.info("Executing USDC transfer: %s to %s", details.amount, details.recipient);
      const tx = await this.usdc.transfer(details.recipient, amountWei);
      const receipt = await tx.wait();

      // Log transaction
      this.logTransaction({
        type: "x402_payment",
        to: details.recipient,
        amount: details.amount,
        hash: receipt.hash,
        status: "success",
      });

      log.info("Payment successful: %s", receipt.hash);
      return { success: true, txHash: receipt.hash };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ err }, "Payment execution failed");

      this.logTransaction({
        type: "x402_payment",
        to: details.recipient,
        amount: details.amount,
        status: "failed",
      });

      return { success: false, error };
    }
  }

  /**
   * Ensure USDC allowance for a spender
   */
  async ensureAllowance(spender: string, amount: string): Promise<void> {
    const amountWei = ethers.parseUnits(amount, 6);
    const currentAllowance = await this.usdc.allowance(this.wallet.address, spender);

    if (currentAllowance < amountWei) {
      log.info("Approving USDC allowance for %s", spender);
      const tx = await this.usdc.approve(spender, ethers.MaxUint256);
      await tx.wait();
      log.info("Allowance approved");
    }
  }

  /**
   * Direct USDC transfer (with approval)
   */
  async transfer(
    to: string,
    amount: string,
    context?: { channel?: string; userId?: string }
  ): Promise<PaymentResult> {
    // Request approval
    const trust = getTrustController();
    const approved = await trust.requestApproval({
      action: "wallet_pay",
      description: `Transfer $${amount} USDC to ${to.slice(0, 10)}...`,
      metadata: { to, amount, currency: "USDC" },
      channel: context?.channel || "cli",
      userId: context?.userId || "default",
    });

    if (!approved) {
      return { success: false, error: "Transfer not approved" };
    }

    return this.executePayment({
      amount,
      currency: "USDC",
      recipient: to,
      network: "base",
    });
  }

  /**
   * Log transaction to file
   */
  private logTransaction(tx: {
    type: string;
    to: string;
    amount: string;
    hash?: string;
    status: string;
  }): void {
    try {
      const txPath = resolve(this.runtimeDir, "wallet", "transactions.json");
      const txs = readJSON<unknown[]>(txPath) || [];
      txs.push({ ...tx, timestamp: new Date().toISOString() });
      writeJSON(txPath, txs);
    } catch (err) {
      log.error({ err }, "Failed to log transaction");
    }
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): unknown[] {
    const txPath = resolve(this.runtimeDir, "wallet", "transactions.json");
    return readJSON<unknown[]>(txPath) || [];
  }

  /**
   * Create or load x402 wallet
   */
  static async create(
    runtimeDir: string,
    identity: DeviceIdentity,
    options?: {
      rpcUrl?: string;
      maxPaymentAmount?: number;
      autoApproveThreshold?: number;
    }
  ): Promise<X402Client> {
    const walletPath = resolve(runtimeDir, "wallet", "x402.json");
    ensureDir(resolve(runtimeDir, "wallet"));

    // Check for existing wallet
    const existing = readJSON<X402WalletState>(walletPath);
    if (existing) {
      const privateKey = decryptCredential(identity, existing.encryptedKey);
      log.info("Loaded x402 wallet: %s", existing.address);
      return new X402Client(privateKey, runtimeDir, options);
    }

    // Create new wallet
    const wallet = ethers.Wallet.createRandom();
    const encryptedKey = encryptCredential(identity, wallet.privateKey);

    const state: X402WalletState = {
      address: wallet.address,
      encryptedKey,
      chain: "base",
      createdAt: new Date().toISOString(),
    };

    writeJSON(walletPath, state);
    log.info("Created x402 wallet: %s", wallet.address);

    return new X402Client(wallet.privateKey, runtimeDir, options);
  }
}

/**
 * Global x402 client instance
 */
let globalX402Client: X402Client | null = null;

export function getX402Client(): X402Client | null {
  return globalX402Client;
}

export function setX402Client(client: X402Client): void {
  globalX402Client = client;
}
