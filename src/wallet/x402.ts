import { ethers } from "ethers";
import { resolve } from "path";
import { existsSync } from "fs";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { encryptCredential, decryptCredential } from "../security/encryption.js";
import type { DeviceIdentity } from "../security/device-identity.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("wallet");

export interface WalletInfo {
  address: string;
  chain: string;
  createdAt: string;
}

export interface WalletState {
  info: WalletInfo;
  encryptedKey: string;
}

const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function getWalletPath(runtimeDir: string): string {
  return resolve(runtimeDir, "wallet", "wallet.json");
}

export function initWallet(
  runtimeDir: string,
  identity: DeviceIdentity,
  chain: string = "base"
): WalletInfo {
  const walletPath = getWalletPath(runtimeDir);
  ensureDir(resolve(runtimeDir, "wallet"));

  // Check existing
  const existing = readJSON<WalletState>(walletPath);
  if (existing) {
    log.info("Wallet loaded: %s", existing.info.address);
    return existing.info;
  }

  // Generate new wallet
  const wallet = ethers.Wallet.createRandom();
  const encryptedKey = encryptCredential(identity, wallet.privateKey);

  const state: WalletState = {
    info: {
      address: wallet.address,
      chain,
      createdAt: new Date().toISOString(),
    },
    encryptedKey,
  };

  writeJSON(walletPath, state);
  log.info("Wallet created: %s on %s", wallet.address, chain);
  return state.info;
}

export function getWalletAddress(runtimeDir: string): string | null {
  const state = readJSON<WalletState>(getWalletPath(runtimeDir));
  return state?.info.address || null;
}

export async function getBalance(
  runtimeDir: string,
  rpcUrl: string = "https://mainnet.base.org"
): Promise<string> {
  const state = readJSON<WalletState>(getWalletPath(runtimeDir));
  if (!state) return "0";

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // ETH balance
  const ethBal = await provider.getBalance(state.info.address);

  // USDC balance (ERC-20)
  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
  const usdc = new ethers.Contract(USDC_BASE_ADDRESS, usdcAbi, provider);

  try {
    const usdcBal = await usdc.balanceOf(state.info.address);
    return ethers.formatUnits(usdcBal, 6); // USDC has 6 decimals
  } catch {
    return "0";
  }
}

export function logTransaction(
  runtimeDir: string,
  tx: { type: string; to: string; amount: string; hash?: string; status: string }
) {
  const txPath = resolve(runtimeDir, "wallet", "transactions.json");
  const txs = readJSON<unknown[]>(txPath) || [];
  txs.push({ ...tx, timestamp: new Date().toISOString() });
  writeJSON(txPath, txs);
}

/**
 * Export the wallet's private key for MetaMask import.
 * Returns the raw hex private key (0x-prefixed).
 */
export function exportWalletPrivateKey(
  runtimeDir: string,
  identity: DeviceIdentity
): string {
  const state = readJSON<WalletState>(getWalletPath(runtimeDir));
  if (!state) throw new Error("Wallet not initialized");

  const privateKey = decryptCredential(identity, state.encryptedKey);
  log.warn("Private key exported for address %s — keep it safe!", state.info.address);
  return privateKey;
}

/**
 * Import a wallet from a private key (e.g. exported from MetaMask).
 * Overwrites the existing wallet.
 */
export function importWalletFromKey(
  runtimeDir: string,
  identity: DeviceIdentity,
  privateKeyHex: string,
  chain: string = "base"
): WalletInfo {
  const walletPath = getWalletPath(runtimeDir);
  ensureDir(resolve(runtimeDir, "wallet"));

  // Normalize key — add 0x prefix if missing
  const key = privateKeyHex.startsWith("0x") ? privateKeyHex : `0x${privateKeyHex}`;
  const wallet = new ethers.Wallet(key);
  const encryptedKey = encryptCredential(identity, wallet.privateKey);

  const info: WalletInfo = {
    address: wallet.address,
    chain,
    createdAt: new Date().toISOString(),
  };

  const state: WalletState = { info, encryptedKey };
  writeJSON(walletPath, state);
  log.info("Wallet imported: %s on %s", wallet.address, chain);
  return info;
}
