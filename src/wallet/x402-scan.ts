/**
 * x402scan — On-chain transaction scanner for x402 payments
 *
 * Scans the Base blockchain for USDC transfers related to the agent's wallet.
 * Uses BaseScan API for transaction history and ethers for live lookups.
 *
 * Features:
 *   - Scan wallet transaction history (USDC transfers in/out)
 *   - Verify a specific tx hash on-chain
 *   - Monitor wallet balance and estimate runway
 *   - Aggregate spending by recipient
 *   - Reconcile on-chain data with local transaction log
 */

import { ethers } from "ethers";
import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("x402scan");

// Base network constants
const BASE_RPC = "https://mainnet.base.org";
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// SKALE BITE V2 Sandbox
const SKALE_RPC = "https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox";
const USDC_SKALE = "0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8";
const SKALE_EXPLORER_API = "https://base-sepolia-testnet-explorer.skalenodes.com:10032/api";

// BaseScan API (free tier: 5 calls/sec)
const BASESCAN_API = "https://api.basescan.org/api";
const BASESCAN_SEPOLIA_API = "https://api-sepolia.basescan.org/api";

// ── Types ────────────────────────────────────────────────────────

export interface ScanTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;       // Human-readable USDC amount
  timestamp: string;   // ISO 8601
  blockNumber: number;
  direction: "in" | "out";
  status: "success" | "failed";
  gasUsed?: string;
  method?: string;     // e.g., "transfer", "approve"
}

export interface ScanSummary {
  address: string;
  network: string;
  usdcBalance: string;
  ethBalance: string;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  uniqueRecipients: number;
  topRecipients: { address: string; total: number; count: number }[];
  estimatedRunway: string; // e.g., "~45 transactions at avg $0.22"
  lastActivity: string | null;
}

export interface TxVerification {
  hash: string;
  found: boolean;
  confirmed: boolean;
  blockNumber?: number;
  from?: string;
  to?: string;
  value?: string;
  timestamp?: string;
  status?: "success" | "failed";
  confirmations?: number;
}

// ── Scanner Class ────────────────────────────────────────────────

export class X402Scanner {
  private provider: ethers.Provider;
  private network: "base" | "base-sepolia" | "skale";
  private usdcAddress: string;
  private basescanApi: string;
  private basescanApiKey: string;
  private runtimeDir: string;
  private nativeSymbol: string;

  constructor(
    runtimeDir: string,
    options: {
      network?: "base" | "base-sepolia" | "skale";
      basescanApiKey?: string;
    } = {}
  ) {
    this.runtimeDir = runtimeDir;
    this.network = options.network || "skale";
    this.basescanApiKey = options.basescanApiKey || process.env.BASESCAN_API_KEY || "";

    if (this.network === "skale") {
      this.provider = new ethers.JsonRpcProvider(SKALE_RPC);
      this.usdcAddress = USDC_SKALE;
      this.basescanApi = SKALE_EXPLORER_API;
      this.nativeSymbol = "sFUEL";
    } else if (this.network === "base-sepolia") {
      this.provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
      this.usdcAddress = USDC_BASE_SEPOLIA;
      this.basescanApi = BASESCAN_SEPOLIA_API;
      this.nativeSymbol = "ETH";
    } else {
      this.provider = new ethers.JsonRpcProvider(BASE_RPC);
      this.usdcAddress = USDC_BASE;
      this.basescanApi = BASESCAN_API;
      this.nativeSymbol = "ETH";
    }
  }

  /**
   * Get a full scan summary for a wallet address.
   */
  async scanWallet(address: string): Promise<ScanSummary> {
    const [usdcBalance, ethBalance, transactions] = await Promise.all([
      this.getUSDCBalance(address),
      this.getETHBalance(address),
      this.getUSDCTransfers(address),
    ]);

    // Aggregate stats
    let totalSent = 0;
    let totalReceived = 0;
    const recipientMap = new Map<string, { total: number; count: number }>();

    for (const tx of transactions) {
      const amount = parseFloat(tx.value);
      if (tx.direction === "out") {
        totalSent += amount;
        const existing = recipientMap.get(tx.to) || { total: 0, count: 0 };
        existing.total += amount;
        existing.count += 1;
        recipientMap.set(tx.to, existing);
      } else {
        totalReceived += amount;
      }
    }

    // Top recipients by total spend
    const topRecipients = Array.from(recipientMap.entries())
      .map(([addr, stats]) => ({ address: addr, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Estimate runway
    const outgoing = transactions.filter(t => t.direction === "out");
    const avgSpend = outgoing.length > 0 ? totalSent / outgoing.length : 0;
    const balance = parseFloat(usdcBalance);
    const runway = avgSpend > 0
      ? `~${Math.floor(balance / avgSpend)} transactions at avg $${avgSpend.toFixed(4)}`
      : "No spending history";

    const lastActivity = transactions.length > 0
      ? transactions[0].timestamp
      : null;

    return {
      address,
      network: this.network,
      usdcBalance,
      ethBalance,
      totalSent: Math.round(totalSent * 1e6) / 1e6,
      totalReceived: Math.round(totalReceived * 1e6) / 1e6,
      transactionCount: transactions.length,
      uniqueRecipients: recipientMap.size,
      topRecipients,
      estimatedRunway: runway,
      lastActivity,
    };
  }

  /**
   * Verify a specific transaction hash on-chain.
   */
  async verifyTransaction(txHash: string): Promise<TxVerification> {
    try {
      const [receipt, tx] = await Promise.all([
        this.provider.getTransactionReceipt(txHash),
        this.provider.getTransaction(txHash),
      ]);

      if (!receipt || !tx) {
        return { hash: txHash, found: false, confirmed: false };
      }

      const block = await this.provider.getBlock(receipt.blockNumber);
      const latestBlock = await this.provider.getBlockNumber();

      // Decode USDC value from transfer logs
      let value = "0";
      const transferTopic = ethers.id("Transfer(address,address,uint256)");
      for (const txLog of receipt.logs) {
        if (
          txLog.address.toLowerCase() === this.usdcAddress.toLowerCase() &&
          txLog.topics[0] === transferTopic
        ) {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["uint256"],
            txLog.data
          );
          value = ethers.formatUnits(decoded[0], 6);
          break;
        }
      }

      return {
        hash: txHash,
        found: true,
        confirmed: receipt.status === 1,
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to || undefined,
        value,
        timestamp: block ? new Date(block.timestamp * 1000).toISOString() : undefined,
        status: receipt.status === 1 ? "success" : "failed",
        confirmations: latestBlock - receipt.blockNumber,
      };
    } catch (err) {
      log.error({ err }, "Failed to verify transaction: %s", txHash);
      return { hash: txHash, found: false, confirmed: false };
    }
  }

  /**
   * Fetch USDC token transfer history for an address via BaseScan API.
   */
  async getUSDCTransfers(
    address: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<ScanTransaction[]> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 100;

    try {
      const params = new URLSearchParams({
        module: "account",
        action: "tokentx",
        contractaddress: this.usdcAddress,
        address,
        page: String(page),
        offset: String(pageSize),
        sort: "desc",
      });
      if (this.basescanApiKey) params.set("apikey", this.basescanApiKey);

      const response = await fetch(`${this.basescanApi}?${params}`);
      const data = await response.json() as {
        status: string;
        result: Array<{
          hash: string;
          from: string;
          to: string;
          value: string;
          timeStamp: string;
          blockNumber: string;
          gasUsed: string;
          functionName: string;
          isError: string;
        }>;
      };

      if (data.status !== "1" || !Array.isArray(data.result)) {
        log.debug("BaseScan returned no results for %s", address);
        return [];
      }

      const lowerAddress = address.toLowerCase();

      return data.result.map((tx) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatUnits(tx.value, 6),
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        blockNumber: parseInt(tx.blockNumber),
        direction: tx.from.toLowerCase() === lowerAddress ? "out" as const : "in" as const,
        status: tx.isError === "0" ? "success" as const : "failed" as const,
        gasUsed: tx.gasUsed,
        method: tx.functionName?.split("(")[0] || "transfer",
      }));
    } catch (err) {
      log.error({ err }, "BaseScan API error");

      // Fallback: return local transaction log converted to ScanTransaction format
      return this.getLocalTransactions(address).map((tx) => ({
        hash: tx.hash || "0x0",
        from: address,
        to: tx.to,
        value: tx.amount,
        timestamp: tx.timestamp,
        blockNumber: 0,
        direction: "out" as const,
        status: "success" as const,
      }));
    }
  }

  /**
   * Reconcile on-chain transactions with local transaction log.
   * Returns transactions found on-chain but missing from local log.
   */
  async reconcile(address: string): Promise<{
    onChainOnly: ScanTransaction[];
    localOnly: Array<{ hash?: string; to: string; amount: string; timestamp: string }>;
    matched: number;
  }> {
    const [onChain, local] = await Promise.all([
      this.getUSDCTransfers(address),
      Promise.resolve(this.getLocalTransactions(address)),
    ]);

    const localHashes = new Set(
      local.filter(t => t.hash).map(t => t.hash!.toLowerCase())
    );
    const onChainHashes = new Set(
      onChain.map(t => t.hash.toLowerCase())
    );

    const onChainOnly = onChain.filter(t => !localHashes.has(t.hash.toLowerCase()));
    const localOnly = local.filter(t => t.hash && !onChainHashes.has(t.hash.toLowerCase()));
    const matched = onChain.length - onChainOnly.length;

    return { onChainOnly, localOnly, matched };
  }

  /**
   * Get USDC balance for an address.
   */
  private async getUSDCBalance(address: string): Promise<string> {
    try {
      const usdc = new ethers.Contract(
        this.usdcAddress,
        ["function balanceOf(address) view returns (uint256)"],
        this.provider
      );
      const balance = await usdc.balanceOf(address);
      return ethers.formatUnits(balance, 6);
    } catch {
      return "0";
    }
  }

  /**
   * Get ETH balance for an address (needed for gas).
   */
  private async getETHBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch {
      return "0";
    }
  }

  /**
   * Read local transaction log as fallback.
   */
  private getLocalTransactions(
    address: string
  ): Array<{ hash?: string; to: string; amount: string; timestamp: string }> {
    try {
      const txPath = resolve(this.runtimeDir, "wallet", "transactions.json");
      const txs = readJSON<Array<{
        hash?: string;
        to: string;
        amount: string;
        timestamp: string;
      }>>(txPath);
      return txs || [];
    } catch {
      return [];
    }
  }
}

// ── Formatting Helpers ───────────────────────────────────────────

/**
 * Format a scan summary for CLI display.
 */
export function formatScanSummary(summary: ScanSummary): string {
  const lines: string[] = [];

  lines.push(`x402scan - Wallet Report`);
  lines.push(`${"─".repeat(50)}`);
  lines.push(`Address:      ${summary.address}`);
  const networkDisplay = summary.network === "skale" ? "SKALE BITE V2 Sandbox (103698795)" : summary.network;
  lines.push(`Network:      ${networkDisplay}`);
  lines.push(`USDC Balance: $${summary.usdcBalance}`);
  const nativeLabel = summary.network === "skale" ? "sFUEL" : "ETH";
  lines.push(`${nativeLabel} Balance: ${summary.ethBalance} ${nativeLabel}`);
  lines.push(``);
  lines.push(`Transactions: ${summary.transactionCount}`);
  lines.push(`Total Sent:   $${summary.totalSent.toFixed(6)}`);
  lines.push(`Total Recv:   $${summary.totalReceived.toFixed(6)}`);
  lines.push(`Recipients:   ${summary.uniqueRecipients}`);
  lines.push(`Runway:       ${summary.estimatedRunway}`);

  if (summary.lastActivity) {
    lines.push(`Last Active:  ${summary.lastActivity}`);
  }

  if (summary.topRecipients.length > 0) {
    lines.push(``);
    lines.push(`Top Recipients:`);
    for (const r of summary.topRecipients) {
      const short = `${r.address.slice(0, 6)}...${r.address.slice(-4)}`;
      lines.push(`  ${short}  $${r.total.toFixed(6)}  (${r.count} tx)`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a transaction verification for CLI display.
 */
export function formatVerification(v: TxVerification): string {
  if (!v.found) {
    return `Transaction ${v.hash.slice(0, 10)}... not found on-chain.`;
  }

  const lines: string[] = [];
  const statusIcon = v.status === "success" ? "[OK]" : "[FAIL]";

  lines.push(`${statusIcon} Transaction Verified`);
  lines.push(`Hash:          ${v.hash}`);
  lines.push(`Block:         ${v.blockNumber}`);
  lines.push(`Confirmations: ${v.confirmations}`);
  lines.push(`From:          ${v.from}`);
  lines.push(`To:            ${v.to}`);
  lines.push(`Value:         $${v.value} USDC`);
  if (v.timestamp) lines.push(`Time:          ${v.timestamp}`);

  return lines.join("\n");
}
