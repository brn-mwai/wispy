/**
 * ERC-8004 Trustless Agents Integration
 *
 * On-chain agent identity, reputation, and validation registries.
 * Uses erc-8004-js SDK for spec-compliant interactions.
 * Enables verifiable trust between autonomous agents.
 */

import { ethers } from "ethers";
import {
  ERC8004Client as SDK8004Client,
  IdentityClient as SDKIdentityClient,
  ReputationClient as SDKReputationClient,
  ValidationClient as SDKValidationClient,
  EthersAdapter,
} from "erc-8004-js";
import { createLogger } from "../infra/logger.js";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { resolve } from "path";

const log = createLogger("erc8004");

/**
 * Create an EthersAdapter from provider and signer
 * Uses 'any' to handle ESM/CJS type compatibility
 */
function createAdapter(provider: ethers.Provider, signer?: ethers.Signer): any {
  return new EthersAdapter(provider as any, signer as any);
}

// Contract ABIs
const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) external returns (uint256 agentId)",
  "function register(string agentURI, tuple(string key, bytes value)[] metadata) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function setMetadata(uint256 agentId, string key, bytes value) external",
  "function getMetadata(uint256 agentId, string key) external view returns (bytes)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external",
  "function getAgentWallet(uint256 agentId) external view returns (address)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_REGISTRY_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getClients(uint256 agentId) external view returns (address[])",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2)",
];

const VALIDATION_REGISTRY_ABI = [
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag) external",
  "function getValidationStatus(bytes32 requestHash) external view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  "function getSummary(uint256 agentId, address[] validatorAddresses, string tag) external view returns (uint64 count, uint8 averageResponse)",
];

export interface ERC8004Addresses {
  identityRegistry: string;
  reputationRegistry: string;
  validationRegistry: string;
}

// Base Sepolia testnet addresses (deploy your own or use official when available)
const DEFAULT_ADDRESSES: ERC8004Addresses = {
  identityRegistry: "0x0000000000000000000000000000000000000000", // Deploy needed
  reputationRegistry: "0x0000000000000000000000000000000000000000",
  validationRegistry: "0x0000000000000000000000000000000000000000",
};

export interface AgentRegistrationFile {
  type: string;
  name: string;
  description: string;
  image?: string;
  services: Array<{
    type: "web" | "a2a" | "mcp" | "oasf" | "ens" | "did" | "email";
    serviceEndpoint: string;
  }>;
  x402Support: boolean;
  active: boolean;
  registrations: Array<{
    agentId: string;
    agentRegistry: string;
  }>;
  supportedTrust?: ("reputation" | "crypto-economic" | "tee-attestation")[];
}

export interface ReputationSummary {
  count: number;
  averageScore: number;
  trusted: boolean;
  reason: string;
}

export interface ValidationStatus {
  validated: boolean;
  score: number;
  validator: string;
}

export class ERC8004Client {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private addresses: ERC8004Addresses;
  private identityRegistry: ethers.Contract;
  private reputationRegistry: ethers.Contract;
  private validationRegistry: ethers.Contract;
  private runtimeDir: string;

  // SDK clients for spec-compliant operations
  private sdkIdentity?: SDKIdentityClient;
  private sdkReputation?: SDKReputationClient;
  private sdkValidation?: SDKValidationClient;

  constructor(
    signer: ethers.Signer,
    runtimeDir: string,
    addresses?: Partial<ERC8004Addresses>,
    provider?: ethers.Provider
  ) {
    this.signer = signer;
    this.provider = provider || signer.provider!;
    this.runtimeDir = runtimeDir;
    this.addresses = { ...DEFAULT_ADDRESSES, ...addresses };

    this.identityRegistry = new ethers.Contract(
      this.addresses.identityRegistry,
      IDENTITY_REGISTRY_ABI,
      signer
    );

    this.reputationRegistry = new ethers.Contract(
      this.addresses.reputationRegistry,
      REPUTATION_REGISTRY_ABI,
      signer
    );

    this.validationRegistry = new ethers.Contract(
      this.addresses.validationRegistry,
      VALIDATION_REGISTRY_ABI,
      signer
    );

    // Initialize SDK clients if addresses are valid
    this.initSDKClients();
  }

  /**
   * Initialize SDK clients for spec-compliant operations
   */
  private initSDKClients() {
    try {
      const adapter = createAdapter(this.provider, this.signer);
      const zeroAddr = "0x0000000000000000000000000000000000000000";

      if (this.addresses.identityRegistry !== zeroAddr) {
        this.sdkIdentity = new SDKIdentityClient(adapter, this.addresses.identityRegistry);
        log.info("SDK Identity client initialized");
      }

      if (this.addresses.reputationRegistry !== zeroAddr) {
        this.sdkReputation = new SDKReputationClient(
          adapter,
          this.addresses.reputationRegistry,
          this.addresses.identityRegistry // ReputationClient requires identityRegistryAddress
        ) as any;
        log.info("SDK Reputation client initialized");
      }

      if (this.addresses.validationRegistry !== zeroAddr) {
        this.sdkValidation = new SDKValidationClient(
          adapter,
          this.addresses.validationRegistry
        ) as any;
        log.info("SDK Validation client initialized");
      }
    } catch (err) {
      log.warn("SDK client initialization failed, using fallback: %s", err);
    }
  }

  /**
   * Check if contracts are deployed
   */
  async isDeployed(): Promise<boolean> {
    try {
      const code = await this.provider.getCode(this.addresses.identityRegistry);
      return code !== "0x";
    } catch {
      return false;
    }
  }

  // ==================== IDENTITY REGISTRY ====================

  /**
   * Register a new agent identity
   */
  async registerAgent(agentURI: string): Promise<bigint> {
    log.info("Registering agent with URI: %s", agentURI);

    const tx = await this.identityRegistry["register(string)"](agentURI);
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log: ethers.Log) => {
        try {
          const parsed = this.identityRegistry.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "Registered";
        } catch {
          return false;
        }
      }
    );

    if (!event) {
      throw new Error("Registration event not found");
    }

    const parsed = this.identityRegistry.interface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });

    const agentId = parsed?.args?.agentId;
    log.info("Agent registered with ID: %s", agentId?.toString());

    // Save registration locally
    this.saveRegistration(agentId, agentURI);

    return agentId;
  }

  /**
   * Register agent with metadata
   */
  async registerAgentWithMetadata(
    agentURI: string,
    metadata: { key: string; value: string }[]
  ): Promise<bigint> {
    const encodedMetadata = metadata.map(m => ({
      key: m.key,
      value: ethers.toUtf8Bytes(m.value),
    }));

    const tx = await this.identityRegistry["register(string,tuple[])"](
      agentURI,
      encodedMetadata
    );
    const receipt = await tx.wait();

    // Parse event (same as above)
    const event = receipt.logs.find((log: ethers.Log) => {
      try {
        const parsed = this.identityRegistry.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === "Registered";
      } catch {
        return false;
      }
    });

    const parsed = this.identityRegistry.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data,
    });

    const agentId = parsed?.args?.agentId;
    this.saveRegistration(agentId, agentURI);

    return agentId;
  }

  /**
   * Get agent URI (metadata location)
   */
  async getAgentURI(agentId: bigint): Promise<string> {
    return this.identityRegistry.tokenURI(agentId);
  }

  /**
   * Verify an agent exists and get details
   */
  async verifyAgent(agentId: bigint): Promise<{
    valid: boolean;
    owner: string;
    uri: string;
    wallet: string;
  }> {
    try {
      const [owner, uri, wallet] = await Promise.all([
        this.identityRegistry.ownerOf(agentId),
        this.identityRegistry.tokenURI(agentId),
        this.identityRegistry.getAgentWallet(agentId),
      ]);
      return { valid: true, owner, uri, wallet };
    } catch {
      return { valid: false, owner: "", uri: "", wallet: "" };
    }
  }

  // ==================== REPUTATION REGISTRY ====================

  /**
   * Give feedback to an agent
   */
  async giveFeedback(params: {
    agentId: bigint;
    score: number; // 0-100
    tag1?: string;
    tag2?: string;
    feedbackURI?: string;
  }): Promise<void> {
    const feedbackHash = params.feedbackURI
      ? ethers.keccak256(ethers.toUtf8Bytes(params.feedbackURI))
      : ethers.ZeroHash;

    log.info("Giving feedback to agent %s: score %d", params.agentId.toString(), params.score);

    const tx = await this.reputationRegistry.giveFeedback(
      params.agentId,
      params.score,
      0, // decimals
      params.tag1 || "",
      params.tag2 || "",
      "", // endpoint
      params.feedbackURI || "",
      feedbackHash
    );
    await tx.wait();

    log.info("Feedback submitted successfully");
  }

  /**
   * Get reputation summary for an agent
   */
  async getReputation(
    agentId: bigint,
    tag1?: string,
    tag2?: string
  ): Promise<ReputationSummary> {
    const [count, summaryValue, decimals] = await this.reputationRegistry.getSummary(
      agentId,
      [], // all clients
      tag1 || "",
      tag2 || ""
    );

    const divisor = 10 ** Number(decimals);
    const averageScore = Number(summaryValue) / divisor;
    const countNum = Number(count);

    // Trust threshold: >= 70 score with >= 5 feedback
    const minScore = 70;
    const minFeedback = 5;

    let trusted = false;
    let reason = "";

    if (countNum < minFeedback) {
      reason = `Insufficient feedback: ${countNum}/${minFeedback}`;
    } else if (averageScore < minScore) {
      reason = `Low score: ${averageScore.toFixed(1)}/${minScore}`;
    } else {
      trusted = true;
      reason = "Meets trust threshold";
    }

    return { count: countNum, averageScore, trusted, reason };
  }

  /**
   * Check if an agent should be trusted
   */
  async shouldTrust(
    agentId: bigint,
    minScore: number = 70,
    minFeedback: number = 5
  ): Promise<{ trusted: boolean; reason: string }> {
    const rep = await this.getReputation(agentId);

    if (rep.count < minFeedback) {
      return {
        trusted: false,
        reason: `Insufficient feedback: ${rep.count}/${minFeedback}`,
      };
    }

    if (rep.averageScore < minScore) {
      return {
        trusted: false,
        reason: `Low score: ${rep.averageScore.toFixed(1)}/${minScore}`,
      };
    }

    return { trusted: true, reason: "Meets trust threshold" };
  }

  // ==================== VALIDATION REGISTRY ====================

  /**
   * Request validation from a validator
   */
  async requestValidation(
    validatorAddress: string,
    agentId: bigint,
    requestData: string
  ): Promise<string> {
    const requestHash = ethers.keccak256(ethers.toUtf8Bytes(requestData));

    log.info("Requesting validation from %s for agent %s",
      validatorAddress.slice(0, 10),
      agentId.toString()
    );

    const tx = await this.validationRegistry.validationRequest(
      validatorAddress,
      agentId,
      requestData,
      requestHash
    );
    await tx.wait();

    log.info("Validation request submitted: %s", requestHash);
    return requestHash;
  }

  /**
   * Get validation status
   */
  async getValidationStatus(requestHash: string): Promise<ValidationStatus> {
    const [validator, , response] = await this.validationRegistry.getValidationStatus(
      requestHash
    );

    return {
      validated: Number(response) > 0,
      score: Number(response),
      validator,
    };
  }

  // ==================== REGISTRATION FILE ====================

  /**
   * Build agent registration file for .well-known
   */
  buildRegistrationFile(config: {
    name: string;
    description: string;
    url: string;
    image?: string;
    agentId?: string;
  }): AgentRegistrationFile {
    return {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: config.name,
      description: config.description,
      image: config.image,
      services: [
        { type: "a2a", serviceEndpoint: `${config.url}/a2a` },
        { type: "web", serviceEndpoint: config.url },
      ],
      x402Support: true,
      active: true,
      registrations: config.agentId
        ? [{ agentId: config.agentId, agentRegistry: this.addresses.identityRegistry }]
        : [],
      supportedTrust: ["reputation"],
    };
  }

  // ==================== LOCAL STORAGE ====================

  /**
   * Save registration locally
   */
  private saveRegistration(agentId: bigint, agentURI: string): void {
    const regPath = resolve(this.runtimeDir, "erc8004", "registration.json");
    ensureDir(resolve(this.runtimeDir, "erc8004"));

    writeJSON(regPath, {
      agentId: agentId.toString(),
      agentURI,
      registeredAt: new Date().toISOString(),
      registry: this.addresses.identityRegistry,
    });
  }

  /**
   * Load saved registration
   */
  getLocalRegistration(): { agentId: string; agentURI: string } | null {
    const regPath = resolve(this.runtimeDir, "erc8004", "registration.json");
    return readJSON(regPath);
  }

  /**
   * Check if agent is registered
   */
  isRegistered(): boolean {
    return this.getLocalRegistration() !== null;
  }
}

// Global instance
let globalERC8004Client: ERC8004Client | null = null;

export function getERC8004Client(): ERC8004Client | null {
  return globalERC8004Client;
}

export function initERC8004Client(
  signer: ethers.Signer,
  runtimeDir: string,
  addresses?: Partial<ERC8004Addresses>
): ERC8004Client {
  globalERC8004Client = new ERC8004Client(signer, runtimeDir, addresses);
  return globalERC8004Client;
}
