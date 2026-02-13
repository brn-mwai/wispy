/**
 * ERC-8004 Agent Identity Registration for Agentic Commerce.
 *
 * Provides on-chain agent identity using the ERC-8004 Trustless Agents spec:
 * - Register agent URI on-chain (identity NFT)
 * - Build `.well-known/agent.json` registration file
 * - Sign identity proofs with agent wallet (viem)
 * - Query agent metadata from the registry
 *
 * Uses viem (matches rest of agentic-commerce module).
 * Falls back to local signed identity when no registry is deployed.
 */

import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount, signMessage } from "viem/accounts";
import { SKALE_BITE_SANDBOX, skaleBiteSandbox } from "../config.js";

// ─── ERC-8004 Identity Registry ABI (minimal) ──────────────

const IDENTITY_REGISTRY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

// ─── Types ──────────────────────────────────────────────────

/** ERC-8004 compliant agent registration file (`.well-known/agent.json`) */
export interface AgentRegistrationFile {
  type: string;
  name: string;
  description: string;
  version: string;
  services: Array<{
    type: "a2a" | "x402" | "mcp" | "web" | "did";
    serviceEndpoint: string;
  }>;
  x402Support: boolean;
  active: boolean;
  walletAddress: string;
  registrations: Array<{
    agentId: string;
    agentRegistry: string;
    network: string;
  }>;
  supportedTrust: string[];
  capabilities: string[];
  createdAt: string;
}

export interface AgentIdentity {
  address: string;
  agentId?: string;
  registryAddress?: string;
  registrationFile: AgentRegistrationFile;
  identityProof: {
    message: string;
    signature: string;
    signer: string;
    timestamp: string;
  };
  onChain: boolean;
}

// ─── Known ERC-8004 Registry Addresses ──────────────────────

const ERC8004_REGISTRIES: Record<string, string> = {
  // SKALE BITE V2 Sandbox — deploy your own or use when available
  "103698795": "0x0000000000000000000000000000000000000000",
};

// ─── Agent Identity Manager ─────────────────────────────────

export class AgentIdentityManager {
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly publicClient;
  private readonly walletClient;
  private readonly registryAddress: string;
  private identity?: AgentIdentity;

  constructor(privateKey: string) {
    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain: skaleBiteSandbox,
      transport: http(SKALE_BITE_SANDBOX.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: skaleBiteSandbox,
      transport: http(SKALE_BITE_SANDBOX.rpcUrl),
    });

    this.registryAddress =
      ERC8004_REGISTRIES[SKALE_BITE_SANDBOX.chainId.toString()] ??
      "0x0000000000000000000000000000000000000000";
  }

  get address(): string {
    return this.account.address;
  }

  /**
   * Check if an ERC-8004 identity registry is deployed on the current chain.
   */
  async isRegistryDeployed(): Promise<boolean> {
    if (
      this.registryAddress ===
      "0x0000000000000000000000000000000000000000"
    ) {
      return false;
    }
    try {
      const code = await this.publicClient.getCode({
        address: this.registryAddress as `0x${string}`,
      });
      return !!code && code !== "0x";
    } catch {
      return false;
    }
  }

  /**
   * Build a `.well-known/agent.json` ERC-8004 registration file.
   */
  buildRegistrationFile(config: {
    name: string;
    description: string;
    gatewayUrl?: string;
    capabilities?: string[];
  }): AgentRegistrationFile {
    const baseUrl = config.gatewayUrl ?? "https://wispy.cc";
    return {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: config.name,
      description: config.description,
      version: "1.0.0",
      services: [
        { type: "a2a", serviceEndpoint: `${baseUrl}/a2a` },
        { type: "x402", serviceEndpoint: `${baseUrl}/x402` },
        { type: "mcp", serviceEndpoint: `${baseUrl}/mcp` },
        { type: "web", serviceEndpoint: baseUrl },
      ],
      x402Support: true,
      active: true,
      walletAddress: this.account.address,
      registrations: [],
      supportedTrust: ["reputation", "erc-8004"],
      capabilities: config.capabilities ?? [
        "x402-payments",
        "ap2-mandates",
        "bite-encryption",
        "defi-trading",
        "a2a-delegation",
      ],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Sign an identity proof message with the agent wallet.
   * This proves the agent controls the wallet address without on-chain registration.
   */
  async signIdentityProof(name: string): Promise<{
    message: string;
    signature: string;
    signer: string;
    timestamp: string;
  }> {
    const timestamp = new Date().toISOString();
    const message = [
      `ERC-8004 Agent Identity Proof`,
      `Name: ${name}`,
      `Address: ${this.account.address}`,
      `Chain: ${SKALE_BITE_SANDBOX.chainId}`,
      `Timestamp: ${timestamp}`,
      `Nonce: ${randomUUID()}`,
    ].join("\n");

    const signature = await this.account.signMessage({ message });

    // Identity proof signed

    return { message, signature, signer: this.account.address, timestamp };
  }

  /**
   * Register the agent identity.
   * Attempts on-chain registration if an ERC-8004 registry is deployed,
   * otherwise creates a local signed identity.
   */
  async register(config: {
    name: string;
    description: string;
    gatewayUrl?: string;
    capabilities?: string[];
  }): Promise<AgentIdentity> {
    // Registering agent identity

    const registrationFile = this.buildRegistrationFile(config);
    const identityProof = await this.signIdentityProof(config.name);

    const deployed = await this.isRegistryDeployed();

    if (deployed) {
      // On-chain registration via ERC-8004 Identity Registry
      // Registry deployed, registering on-chain

      try {
        const agentURI = `https://wispy.cc/.well-known/agent.json`;
        const txHash = await this.walletClient.writeContract({
          address: this.registryAddress as `0x${string}`,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "register",
          args: [agentURI],
        });

        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        // Parse Registered event for agentId
        let agentId = "unknown";
        for (const log of receipt.logs) {
          try {
            if (log.topics[0] === keccak256(toHex("Registered(uint256,string,address)"))) {
              agentId = BigInt(log.topics[1] ?? "0").toString();
            }
          } catch {
            // skip non-matching logs
          }
        }

        registrationFile.registrations.push({
          agentId,
          agentRegistry: this.registryAddress,
          network: `eip155:${SKALE_BITE_SANDBOX.chainId}`,
        });

        this.identity = {
          address: this.account.address,
          agentId,
          registryAddress: this.registryAddress,
          registrationFile,
          identityProof,
          onChain: true,
        };

        // Registered on-chain
      } catch (err) {
        // On-chain registration failed, using local identity
        this.identity = {
          address: this.account.address,
          registrationFile,
          identityProof,
          onChain: false,
        };
      }
    } else {
      // Local signed identity (no registry deployed)
      // No registry on chain, creating local signed identity

      this.identity = {
        address: this.account.address,
        registrationFile,
        identityProof,
        onChain: false,
      };
    }

    return this.identity;
  }

  /**
   * Get the current identity (if registered).
   */
  getIdentity(): AgentIdentity | undefined {
    return this.identity;
  }

  /**
   * Generate a formatted identity report.
   */
  getReport(): string {
    if (!this.identity) return "No identity registered.";

    const id = this.identity;
    const lines: string[] = [
      `## ERC-8004 Agent Identity`,
      ``,
      `**Address:** \`${id.address}\``,
      `**On-chain:** ${id.onChain ? `Yes (Agent ID: ${id.agentId}, Registry: ${id.registryAddress?.slice(0, 12)}...)` : "No (local signed identity)"}`,
      `**Network:** SKALE BITE V2 Sandbox (Chain ${SKALE_BITE_SANDBOX.chainId})`,
      ``,
      `### Registration File (.well-known/agent.json)`,
      `- **Type:** ${id.registrationFile.type}`,
      `- **Name:** ${id.registrationFile.name}`,
      `- **x402 Support:** ${id.registrationFile.x402Support}`,
      `- **Services:** ${id.registrationFile.services.map((s) => s.type).join(", ")}`,
      `- **Capabilities:** ${id.registrationFile.capabilities.join(", ")}`,
      `- **Trust:** ${id.registrationFile.supportedTrust.join(", ")}`,
      ``,
      `### Identity Proof`,
      `- **Signer:** \`${id.identityProof.signer}\``,
      `- **Signature:** \`${id.identityProof.signature.slice(0, 32)}...\``,
      `- **Timestamp:** ${id.identityProof.timestamp}`,
    ];

    return lines.join("\n");
  }
}
