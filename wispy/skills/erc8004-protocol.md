# ERC-8004 Expert Skill

You are an expert in ERC-8004: Trustless Agents. You produce production-ready TypeScript code for on-chain agent identity, reputation, and validation.

## Protocol Overview

ERC-8004 provides three on-chain registries for agent trust infrastructure:
1. **Identity Registry** - ERC-721 based agent IDs
2. **Reputation Registry** - Feedback and scores
3. **Validation Registry** - Independent verification

## Contract Addresses (Base Sepolia)
```typescript
const ERC8004_ADDRESSES = {
  identityRegistry: "0x...", // Deploy or use official
  reputationRegistry: "0x...",
  validationRegistry: "0x..."
};
```

## Production Code Templates

### Identity Registry Client
```typescript
import { ethers } from "ethers";

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
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
  "event MetadataSet(uint256 indexed agentId, string indexed indexedKey, string key, bytes value)"
];

export class IdentityRegistryClient {
  private contract: ethers.Contract;

  constructor(
    address: string,
    provider: ethers.Provider,
    signer?: ethers.Signer
  ) {
    this.contract = new ethers.Contract(
      address,
      IDENTITY_REGISTRY_ABI,
      signer || provider
    );
  }

  async registerAgent(agentURI: string): Promise<bigint> {
    const tx = await this.contract.register(agentURI);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "Registered"
    );
    return event?.args?.agentId;
  }

  async registerWithMetadata(
    agentURI: string,
    metadata: { key: string; value: string }[]
  ): Promise<bigint> {
    const encodedMetadata = metadata.map(m => ({
      key: m.key,
      value: ethers.toUtf8Bytes(m.value)
    }));
    const tx = await this.contract["register(string,tuple[])"](
      agentURI,
      encodedMetadata
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "Registered"
    );
    return event?.args?.agentId;
  }

  async getAgentURI(agentId: bigint): Promise<string> {
    return this.contract.tokenURI(agentId);
  }

  async setAgentWallet(
    agentId: bigint,
    newWallet: string,
    signer: ethers.Signer
  ): Promise<void> {
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    // Create EIP-712 signature
    const domain = {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: await signer.provider!.getNetwork().then(n => n.chainId),
      verifyingContract: await this.contract.getAddress()
    };

    const types = {
      SetWallet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const value = { agentId, newWallet, deadline };
    const signature = await signer.signTypedData(domain, types, value);

    const tx = await this.contract.setAgentWallet(
      agentId,
      newWallet,
      deadline,
      signature
    );
    await tx.wait();
  }

  async verifyAgent(agentId: bigint): Promise<{
    valid: boolean;
    owner: string;
    uri: string;
    wallet: string;
  }> {
    try {
      const [owner, uri, wallet] = await Promise.all([
        this.contract.ownerOf(agentId),
        this.contract.tokenURI(agentId),
        this.contract.getAgentWallet(agentId)
      ]);
      return { valid: true, owner, uri, wallet };
    } catch {
      return { valid: false, owner: "", uri: "", wallet: "" };
    }
  }
}
```

### Reputation Registry Client
```typescript
const REPUTATION_REGISTRY_ABI = [
  "function initialize(address identityRegistry) external",
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external",
  "function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash) external",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
  "function getClients(uint256 agentId) external view returns (address[])",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)"
];

export class ReputationRegistryClient {
  private contract: ethers.Contract;

  constructor(
    address: string,
    provider: ethers.Provider,
    signer?: ethers.Signer
  ) {
    this.contract = new ethers.Contract(
      address,
      REPUTATION_REGISTRY_ABI,
      signer || provider
    );
  }

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

    const tx = await this.contract.giveFeedback(
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
  }

  async getReputation(
    agentId: bigint,
    tag1?: string,
    tag2?: string
  ): Promise<{
    count: number;
    averageScore: number;
  }> {
    const [count, summaryValue, decimals] = await this.contract.getSummary(
      agentId,
      [], // all clients
      tag1 || "",
      tag2 || ""
    );

    const divisor = 10 ** Number(decimals);
    return {
      count: Number(count),
      averageScore: Number(summaryValue) / divisor
    };
  }

  async shouldTrust(
    agentId: bigint,
    minScore: number = 70,
    minFeedback: number = 5
  ): Promise<{ trusted: boolean; reason: string }> {
    const rep = await this.getReputation(agentId);

    if (rep.count < minFeedback) {
      return {
        trusted: false,
        reason: `Insufficient feedback: ${rep.count}/${minFeedback}`
      };
    }

    if (rep.averageScore < minScore) {
      return {
        trusted: false,
        reason: `Low score: ${rep.averageScore}/${minScore}`
      };
    }

    return { trusted: true, reason: "Meets trust threshold" };
  }
}
```

### Validation Registry Client
```typescript
const VALIDATION_REGISTRY_ABI = [
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag) external",
  "function getValidationStatus(bytes32 requestHash) external view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  "function getSummary(uint256 agentId, address[] validatorAddresses, string tag) external view returns (uint64 count, uint8 averageResponse)",
  "event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)",
  "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)"
];

export class ValidationRegistryClient {
  private contract: ethers.Contract;

  constructor(
    address: string,
    provider: ethers.Provider,
    signer?: ethers.Signer
  ) {
    this.contract = new ethers.Contract(
      address,
      VALIDATION_REGISTRY_ABI,
      signer || provider
    );
  }

  async requestValidation(
    validatorAddress: string,
    agentId: bigint,
    requestData: string
  ): Promise<string> {
    const requestHash = ethers.keccak256(ethers.toUtf8Bytes(requestData));

    const tx = await this.contract.validationRequest(
      validatorAddress,
      agentId,
      requestData,
      requestHash
    );
    await tx.wait();

    return requestHash;
  }

  async getValidationStatus(requestHash: string): Promise<{
    validated: boolean;
    score: number;
    validator: string;
  }> {
    const [validator, , response] = await this.contract.getValidationStatus(
      requestHash
    );

    return {
      validated: Number(response) > 0,
      score: Number(response),
      validator
    };
  }
}
```

### Agent Registration File Structure
```typescript
interface AgentRegistrationFile {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
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

export function buildAgentRegistrationFile(): AgentRegistrationFile {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Wispy",
    description: "Autonomous AI agent with Marathon Mode and Trust Controls",
    services: [
      { type: "a2a", serviceEndpoint: "https://wispy.ai/a2a" },
      { type: "web", serviceEndpoint: "https://wispy.ai" }
    ],
    x402Support: true,
    active: true,
    registrations: [],
    supportedTrust: ["reputation"]
  };
}
```

## Best Practices

1. **Always check reputation** before trusting another agent
2. **Submit feedback** after every interaction
3. **Use tags** for domain-specific reputation (e.g., "defi", "coding")
4. **Verify identity** matches expected wallet
5. **Request validation** for high-stakes operations

## References
- EIP Spec: https://eips.ethereum.org/EIPS/eip-8004
- Discussion: https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098
