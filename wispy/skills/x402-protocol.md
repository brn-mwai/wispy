# x402 Payment Protocol Expert Skill

You are an expert in the x402 payment protocol. You produce production-ready TypeScript code for HTTP-native agent payments.

## Protocol Overview

x402 revives HTTP 402 "Payment Required" for autonomous agent payments. Developed by Coinbase and Cloudflare, it enables pay-per-request without accounts or subscriptions.

## Payment Flow

1. Client requests resource
2. Server responds with `402 Payment Required` + `X-PAYMENT` header
3. Client signs payment, resends with `X-PAYMENT-RESPONSE` header
4. Server verifies via facilitator, returns resource

## Production Code Templates

### x402 Client
```typescript
import { createX402Client, type PaymentConfig } from "@x402/fetch";
import { createEvmPaymentHandler } from "@x402/evm";
import { ethers } from "ethers";

export class WispyX402Client {
  private client: ReturnType<typeof createX402Client>;
  private signer: ethers.Signer;

  constructor(signer: ethers.Signer) {
    this.signer = signer;

    const paymentHandler = createEvmPaymentHandler({
      signer,
      chainId: 8453, // Base mainnet
    });

    this.client = createX402Client({
      paymentHandler,
      maxPaymentAmount: "1.00", // Max 1 USDC per request
      autoApprove: false, // Require manual approval for each payment
    });
  }

  async fetch(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    return this.client.fetch(url, options);
  }

  async payForAPI<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await this.fetch(url, options);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }

  // Pay with approval callback for Trust Controls integration
  async payWithApproval<T>(
    url: string,
    options: RequestInit,
    onApprovalNeeded: (details: PaymentDetails) => Promise<boolean>
  ): Promise<T> {
    // First, make request to get payment requirements
    const initialResponse = await fetch(url, options);

    if (initialResponse.status !== 402) {
      return initialResponse.json();
    }

    // Parse payment requirements
    const paymentHeader = initialResponse.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      throw new Error("No payment details in 402 response");
    }

    const paymentDetails = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString()
    );

    // Request approval via Trust Controls
    const approved = await onApprovalNeeded(paymentDetails);
    if (!approved) {
      throw new Error("Payment not approved by user");
    }

    // Make payment and retry request
    return this.payForAPI(url, options);
  }
}

interface PaymentDetails {
  amount: string;
  currency: string;
  recipient: string;
  network: string;
  description?: string;
}
```

### x402 Server Middleware
```typescript
import express from "express";
import { createX402Middleware } from "@x402/express";
import { createFacilitatorConfig } from "@coinbase/x402";

export function createPaywallMiddleware(options: {
  price: string;
  currency?: string;
  recipientAddress: string;
}): express.RequestHandler {
  const facilitator = createFacilitatorConfig(
    process.env.CDP_API_KEY_ID!,
    process.env.CDP_API_KEY_SECRET!
  );

  return createX402Middleware({
    facilitator,
    paymentRequirements: {
      amount: options.price,
      asset: options.currency || "USDC",
      recipient: options.recipientAddress,
      network: "base", // or "base-sepolia" for testnet
    },
    onPaymentVerified: async (payment) => {
      console.log(`Payment verified: ${payment.txHash}`);
    },
    onPaymentFailed: async (error) => {
      console.error(`Payment failed: ${error.message}`);
    },
  });
}

// Usage in Express app
export function setupPaywallRoutes(app: express.Express) {
  const paywall = createPaywallMiddleware({
    price: "0.001",
    recipientAddress: process.env.WISPY_WALLET_ADDRESS!,
  });

  // Protected API endpoints
  app.get("/api/premium/*", paywall, (req, res) => {
    res.json({ data: "Premium content" });
  });

  // Tiered pricing
  app.get("/api/analytics/basic",
    createPaywallMiddleware({ price: "0.001", recipientAddress: "0x..." }),
    analyticsHandler
  );

  app.get("/api/analytics/detailed",
    createPaywallMiddleware({ price: "0.01", recipientAddress: "0x..." }),
    detailedAnalyticsHandler
  );
}
```

### Integration with Trust Controls
```typescript
import { TrustController } from "../trust/controller";

export class TrustedX402Client extends WispyX402Client {
  constructor(
    signer: ethers.Signer,
    private trustController: TrustController
  ) {
    super(signer);
  }

  async payForAPIWithTrust<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    return this.payWithApproval(
      url,
      options || {},
      async (details) => {
        // Request approval via Trust Controls
        const approved = await this.trustController.requestApproval({
          action: "x402_payment",
          description: `Pay ${details.amount} ${details.currency} to ${details.recipient}`,
          metadata: {
            url,
            amount: details.amount,
            currency: details.currency,
            recipient: details.recipient,
            network: details.network,
          },
        });

        return approved;
      }
    );
  }
}
```

### Wallet Setup for x402
```typescript
import { ethers } from "ethers";
import { readJSON, writeJSON, ensureDir } from "../utils/file";
import { encryptCredential, decryptCredential } from "../security/encryption";

const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export class X402Wallet {
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;
  private usdc: ethers.Contract;

  constructor(privateKey: string, rpcUrl: string = "https://mainnet.base.org") {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.usdc = new ethers.Contract(USDC_BASE_ADDRESS, USDC_ABI, this.wallet);
  }

  get address(): string {
    return this.wallet.address;
  }

  get signer(): ethers.Signer {
    return this.wallet;
  }

  async getUSDCBalance(): Promise<string> {
    const balance = await this.usdc.balanceOf(this.wallet.address);
    return ethers.formatUnits(balance, 6); // USDC has 6 decimals
  }

  async getETHBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  async ensureAllowance(
    spender: string,
    amount: string
  ): Promise<void> {
    const amountWei = ethers.parseUnits(amount, 6);
    const currentAllowance = await this.usdc.allowance(
      this.wallet.address,
      spender
    );

    if (currentAllowance < amountWei) {
      const tx = await this.usdc.approve(spender, ethers.MaxUint256);
      await tx.wait();
    }
  }

  async transfer(to: string, amount: string): Promise<string> {
    const amountWei = ethers.parseUnits(amount, 6);
    const tx = await this.usdc.transfer(to, amountWei);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  static async create(runtimeDir: string): Promise<X402Wallet> {
    const walletPath = `${runtimeDir}/wallet/x402.json`;

    // Check for existing wallet
    const existing = readJSON<{ encryptedKey: string }>(walletPath);
    if (existing) {
      const privateKey = decryptCredential(existing.encryptedKey);
      return new X402Wallet(privateKey);
    }

    // Create new wallet
    const wallet = ethers.Wallet.createRandom();
    ensureDir(`${runtimeDir}/wallet`);
    writeJSON(walletPath, {
      address: wallet.address,
      encryptedKey: encryptCredential(wallet.privateKey),
      createdAt: new Date().toISOString(),
    });

    return new X402Wallet(wallet.privateKey);
  }
}
```

### Payment Verification
```typescript
import { verifyPayment, type PaymentProof } from "@x402/core";

export async function verifyX402Payment(
  paymentHeader: string,
  expectedAmount: string,
  expectedRecipient: string
): Promise<{ valid: boolean; txHash?: string; error?: string }> {
  try {
    const proof: PaymentProof = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString()
    );

    const result = await verifyPayment(proof, {
      facilitatorUrl: process.env.X402_FACILITATOR_URL,
    });

    if (!result.verified) {
      return { valid: false, error: "Payment not verified by facilitator" };
    }

    if (result.amount !== expectedAmount) {
      return { valid: false, error: `Amount mismatch: ${result.amount}` };
    }

    if (result.recipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return { valid: false, error: "Recipient mismatch" };
    }

    return { valid: true, txHash: result.txHash };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

## Configuration

```typescript
// Environment variables
const X402_CONFIG = {
  FACILITATOR_URL: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
  CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
  CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
  NETWORK: process.env.X402_NETWORK || "base-sepolia", // or "base"
  WALLET_ADDRESS: process.env.WISPY_WALLET_ADDRESS,
};
```

## Best Practices

1. **Always verify payments** via facilitator before delivering content
2. **Use testnet** (base-sepolia) for development
3. **Set max payment limits** to prevent accidental large payments
4. **Integrate with Trust Controls** for human approval on payments
5. **Log all transactions** for audit trails
6. **Handle payment failures** gracefully

## References
- Official Spec: https://x402.org
- GitHub: https://github.com/coinbase/x402
- Docs: https://docs.cdp.coinbase.com/x402
- NPM: @x402/core, @x402/evm, @x402/fetch, @coinbase/x402
