/**
 * SKALE BITE V2 Sandbox chain configuration for x402 hackathon.
 * All constants match the official hackathon docs.
 */

import { defineChain, parseAbi } from "viem";

// ─── SKALE Network Config ────────────────────────────────────

export const SKALE_BITE_SANDBOX = {
  rpcUrl:
    "https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox" as const,
  chainId: 103698795,
  chainIdHex: "0x62e516b" as const,
  explorerUrl:
    "https://base-sepolia-testnet-explorer.skalenodes.com:10032" as const,
  usdc: "0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8" as const,
  facilitatorUrl: "https://gateway.kobaru.io" as const,
  evmVersion: "istanbul" as const,
  /** CAIP-2 network identifier for x402 */
  network: "eip155:103698795" as `${string}:${string}`,
  /** BITE magic address — encrypted txs are sent here */
  biteAddress: "0x42495445204D452049274d20454e435259505444" as const,
};

// ─── Viem Chain Definition ──────────────────────────────────

export const skaleBiteSandbox = defineChain({
  id: SKALE_BITE_SANDBOX.chainId,
  name: "SKALE BITE V2 Sandbox",
  nativeCurrency: { name: "sFUEL", symbol: "sFUEL", decimals: 18 },
  rpcUrls: {
    default: { http: [SKALE_BITE_SANDBOX.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: SKALE_BITE_SANDBOX.explorerUrl },
  },
});

// ─── Algebra DEX Contracts (deployed on sandbox) ────────────

export const ALGEBRA_CONTRACTS = {
  factory: "0x10253594A832f967994b44f33411940533302ACb" as const,
  poolDeployer: "0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A" as const,
  swapRouter: "0x3012E9049d05B4B5369D690114D5A5861EbB85cb" as const,
  quoterV2: "0x03f8B4b140249Dc7B2503C928E7258CCe1d91F1A" as const,
  nonfungiblePositionManager: "0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F" as const,
  limitOrderManager: "0xE94de02e52Eaf9F0f6Bf7f16E4927FcBc2c09bC7" as const,
  communityVault: "0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04" as const,
  eternalFarming: "0x50FCbF85d23aF7C91f94842FeCd83d16665d27bA" as const,
  farmingCenter: "0x658E287E9C820484f5808f687dC4863B552de37D" as const,
  tickLens: "0x13fcE0acbe6Fb11641ab753212550574CaD31415" as const,
  multicall: "0xB4F9b6b019E75CBe51af4425b2Fc12797e2Ee2a1" as const,
} as const;

export const ALGEBRA_SUBGRAPHS = {
  analytics: "https://skale-sandbox-graph.algebra.finance/subgraphs/name/analytics",
  farmings: "https://skale-sandbox-graph.algebra.finance/subgraphs/name/farmings",
  limits: "https://skale-sandbox-graph.algebra.finance/subgraphs/name/limits",
} as const;

// ─── Algebra ABIs (minimal, for SwapRouter + QuoterV2) ──────

export const ALGEBRA_SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "deployer", type: "address" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "limitSqrtPrice", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export const ALGEBRA_QUOTER_V2_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "deployer", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "limitSqrtPrice", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
      { name: "fee", type: "uint16" },
    ],
  },
] as const;

export const ALGEBRA_FACTORY_ABI = parseAbi([
  "function createPool(address tokenA, address tokenB) external returns (address pool)",
  "function poolByPair(address tokenA, address tokenB) external view returns (address pool)",
]);

// ─── ERC-20 ABI (shared) ────────────────────────────────────

export const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// ─── Mock Service Pricing (atomic USDC, 6 decimals) ─────────

export const SERVICE_PRICING = {
  weather: { price: "1000", display: "$0.001" },
  sentiment: { price: "2000", display: "$0.002" },
  report: { price: "1000", display: "$0.001" },
  priceData: { price: "1500", display: "$0.0015" },
} as const;

// ─── Commerce Policy ────────────────────────────────────────

export const COMMERCE_DEFAULTS = {
  maxPerTransaction: 10.0,
  dailyLimit: 100.0,
  autoApproveBelow: 1.0,
  requireApprovalAbove: 1.0,
} as const;

// ─── Demo Server Ports ──────────────────────────────────────

export const DEMO_PORTS = {
  weather: 4021,
  sentiment: 4022,
  report: 4023,
  defi: 4024,
} as const;

// ─── Helpers ────────────────────────────────────────────────

/** Convert atomic USDC (6 decimals) to human-readable */
export function atomicToUsdc(atomic: string | number): number {
  return Number(atomic) / 1_000_000;
}

/** Convert human-readable USDC to atomic (6 decimals) */
export function usdcToAtomic(usdc: number): string {
  return Math.round(usdc * 1_000_000).toString();
}

/** Format a SKALE explorer link for a transaction hash */
export function explorerTxLink(txHash: string): string {
  return `${SKALE_BITE_SANDBOX.explorerUrl}/tx/${txHash}`;
}

/** Format a SKALE explorer link for an address */
export function explorerAddressLink(address: string): string {
  return `${SKALE_BITE_SANDBOX.explorerUrl}/address/${address}`;
}
