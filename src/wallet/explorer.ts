/**
 * Blockchain explorer URL utilities.
 *
 * Generates proof links for transactions and addresses across
 * supported networks (SKALE BITE Sandbox, Base, Base Sepolia).
 */

const EXPLORERS: Record<string, string> = {
  "skale-bite":
    "https://base-sepolia-testnet-explorer.skalenodes.com:10032",
  "base-sepolia": "https://sepolia.basescan.org",
  base: "https://basescan.org",
};

const DEFAULT_NETWORK = "skale-bite";

/** Full explorer URL for a transaction hash. */
export function txLink(hash: string, network = DEFAULT_NETWORK): string {
  const base = EXPLORERS[network] || EXPLORERS[DEFAULT_NETWORK];
  return `${base}/tx/${hash}`;
}

/** Full explorer URL for an address. */
export function addressLink(
  addr: string,
  network = DEFAULT_NETWORK,
): string {
  const base = EXPLORERS[network] || EXPLORERS[DEFAULT_NETWORK];
  return `${base}/address/${addr}`;
}

/** CLI-formatted markdown proof link for a transaction. */
export function cliTxProof(hash: string, network?: string): string {
  const short = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  return `[View Tx ${short}](${txLink(hash, network)})`;
}

/** CLI-formatted markdown proof link for an address. */
export function cliAddressProof(addr: string, network?: string): string {
  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  return `[View ${short}](${addressLink(addr, network)})`;
}

/** Telegram HTML proof link for a transaction. */
export function telegramTxProof(hash: string, network?: string): string {
  const short = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  return `<a href="${txLink(hash, network)}">View Tx ${short}</a>`;
}

/** Telegram HTML proof link for an address. */
export function telegramAddressProof(
  addr: string,
  network?: string,
): string {
  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  return `<a href="${addressLink(addr, network)}">View ${short}</a>`;
}
