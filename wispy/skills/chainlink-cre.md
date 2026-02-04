# Chainlink CRE Expert Skill

You are an expert in Chainlink Runtime Environment (CRE). You produce production-ready TypeScript code for secure, verifiable workflow execution.

## Protocol Overview

CRE is Chainlink's orchestration layer for building workflows that combine offchain data fetching with onchain interactions. Workflows are executed with BFT consensus across Decentralized Oracle Networks (DONs).

## Core Concepts

### Workflow Structure
- **Triggers**: What starts the workflow (cron, EVM log, HTTP)
- **Capabilities**: What the workflow can do (HTTP fetch, EVM read/write)
- **Handlers**: Logic that processes triggers and uses capabilities

### Trigger Types
1. **Cron Trigger**: Time-based execution
2. **EVM Log Trigger**: React to blockchain events
3. **HTTP Trigger**: External API calls

## Production Code Templates

### Basic Workflow Structure
```typescript
import {
  cre,
  type Runtime,
  type NodeRuntime,
  type Config
} from "@chainlink/cre-sdk";
import { z } from "zod";

// Configuration schema
const configSchema = z.object({
  schedule: z.string(), // Cron expression
  apiUrl: z.string(),
  rpcUrl: z.string(),
  contractAddress: z.string(),
});

type WorkflowConfig = z.infer<typeof configSchema>;

// Initialize workflow
export function initWorkflow(config: WorkflowConfig) {
  // Define trigger
  const cronTrigger = cre.triggers.cron({
    schedule: config.schedule,
  });

  // Define handler
  return [
    cre.handler(cronTrigger, async (runtime: Runtime<WorkflowConfig>) => {
      // Workflow logic here
      return { success: true };
    }),
  ];
}
```

### DeFi Monitoring Workflow
```typescript
import { cre, type Runtime, type NodeRuntime } from "@chainlink/cre-sdk";
import { z } from "zod";

const configSchema = z.object({
  schedule: z.string().default("*/15 * * * *"), // Every 15 min
  uniswapSubgraphUrl: z.string(),
  telegramBotToken: z.string(),
  telegramChatId: z.string(),
  priceThreshold: z.number().default(0.1), // 10% IL threshold
  wispyApiUrl: z.string(),
});

type DeFiMonitorConfig = z.infer<typeof configSchema>;

export function initDeFiMonitorWorkflow(config: DeFiMonitorConfig) {
  const cronTrigger = cre.triggers.cron({ schedule: config.schedule });

  return [
    cre.handler(cronTrigger, async (runtime: Runtime<DeFiMonitorConfig>) => {
      // Step 1: Fetch positions from subgraph
      const positions = await runtime.runInNodeMode(
        async (nodeRuntime: NodeRuntime<DeFiMonitorConfig>) => {
          const httpClient = new cre.capabilities.HTTPClient();

          const query = `{
            positions(where: { owner: "${runtime.secrets.WALLET_ADDRESS}" }) {
              id
              liquidity
              token0 { symbol }
              token1 { symbol }
              pool { sqrtPrice feeTier }
            }
          }`;

          const response = httpClient.fetch(nodeRuntime, {
            url: config.uniswapSubgraphUrl,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          }).result();

          return JSON.parse(response.body);
        }
      );

      // Step 2: Calculate IL for each position
      const alerts: string[] = [];

      for (const position of positions.data.positions) {
        const ilRisk = calculateILRisk(position);

        if (ilRisk > config.priceThreshold) {
          alerts.push(
            `${position.token0.symbol}/${position.token1.symbol}: ` +
            `IL Risk ${(ilRisk * 100).toFixed(2)}%`
          );
        }
      }

      // Step 3: Send alerts if any
      if (alerts.length > 0) {
        await runtime.runInNodeMode(
          async (nodeRuntime: NodeRuntime<DeFiMonitorConfig>) => {
            const httpClient = new cre.capabilities.HTTPClient();

            // Notify via Wispy Trust Controls
            httpClient.fetch(nodeRuntime, {
              url: `${config.wispyApiUrl}/trust/alert`,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${runtime.secrets.WISPY_API_KEY}`,
              },
              body: JSON.stringify({
                type: "defi_alert",
                severity: "high",
                message: alerts.join("\n"),
                action: {
                  type: "rebalance",
                  positions: positions.data.positions
                    .filter((p: any) => calculateILRisk(p) > config.priceThreshold)
                    .map((p: any) => p.id),
                },
              }),
            }).result();
          }
        );
      }

      return {
        success: true,
        positionsChecked: positions.data.positions.length,
        alertsSent: alerts.length,
      };
    }),
  ];
}

function calculateILRisk(position: any): number {
  // Simplified IL calculation
  const sqrtPrice = parseFloat(position.pool.sqrtPrice);
  const currentPrice = (sqrtPrice / 2 ** 96) ** 2;

  // Compare to entry price (would need historical data)
  // For now, return mock value
  return Math.random() * 0.2; // 0-20% mock IL
}
```

### Price Alert Workflow
```typescript
import { cre, type Runtime, type NodeRuntime } from "@chainlink/cre-sdk";
import { z } from "zod";

const configSchema = z.object({
  chainlinkFeedAddress: z.string(),
  targetPrice: z.number(),
  direction: z.enum(["above", "below"]),
  wispyApiUrl: z.string(),
});

type PriceAlertConfig = z.infer<typeof configSchema>;

export function initPriceAlertWorkflow(config: PriceAlertConfig) {
  // Trigger on Chainlink price feed update
  const evmLogTrigger = cre.triggers.evmLog({
    address: config.chainlinkFeedAddress,
    eventSignature: "AnswerUpdated(int256,uint256,uint256)",
    chainId: 8453, // Base
  });

  return [
    cre.handler(evmLogTrigger, async (runtime: Runtime<PriceAlertConfig>, event) => {
      const newPrice = parseFloat(event.args.answer) / 1e8;

      const shouldAlert =
        (config.direction === "above" && newPrice > config.targetPrice) ||
        (config.direction === "below" && newPrice < config.targetPrice);

      if (shouldAlert) {
        await runtime.runInNodeMode(
          async (nodeRuntime: NodeRuntime<PriceAlertConfig>) => {
            const httpClient = new cre.capabilities.HTTPClient();

            httpClient.fetch(nodeRuntime, {
              url: `${config.wispyApiUrl}/trust/alert`,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${runtime.secrets.WISPY_API_KEY}`,
              },
              body: JSON.stringify({
                type: "price_alert",
                severity: "medium",
                message: `Price ${config.direction} ${config.targetPrice}: $${newPrice.toFixed(2)}`,
                action: {
                  type: "notify",
                  price: newPrice,
                  threshold: config.targetPrice,
                  direction: config.direction,
                },
              }),
            }).result();
          }
        );
      }

      return { triggered: shouldAlert, price: newPrice };
    }),
  ];
}
```

### On-Chain Action Workflow
```typescript
import { cre, type Runtime, type NodeRuntime } from "@chainlink/cre-sdk";
import { z } from "zod";

const configSchema = z.object({
  rpcUrl: z.string(),
  contractAddress: z.string(),
  wispyApiUrl: z.string(),
});

type OnChainActionConfig = z.infer<typeof configSchema>;

export function initOnChainActionWorkflow(config: OnChainActionConfig) {
  // HTTP trigger for Wispy to initiate on-chain actions
  const httpTrigger = cre.triggers.http({
    path: "/execute",
    method: "POST",
  });

  return [
    cre.handler(httpTrigger, async (runtime: Runtime<OnChainActionConfig>, request) => {
      const { action, params, approvalId } = request.body;

      // Verify approval from Wispy Trust Controls
      const isApproved = await runtime.runInNodeMode(
        async (nodeRuntime: NodeRuntime<OnChainActionConfig>) => {
          const httpClient = new cre.capabilities.HTTPClient();

          const response = httpClient.fetch(nodeRuntime, {
            url: `${config.wispyApiUrl}/trust/verify/${approvalId}`,
            method: "GET",
            headers: {
              "Authorization": `Bearer ${runtime.secrets.WISPY_API_KEY}`,
            },
          }).result();

          const data = JSON.parse(response.body);
          return data.approved === true;
        }
      );

      if (!isApproved) {
        return { success: false, error: "Action not approved" };
      }

      // Execute on-chain action
      const txHash = await runtime.runInNodeMode(
        async (nodeRuntime: NodeRuntime<OnChainActionConfig>) => {
          const evmClient = new cre.capabilities.EVMClient(8453); // Base

          const result = evmClient.writeContract(nodeRuntime, {
            contractAddress: config.contractAddress,
            method: action,
            args: params,
            privateKey: runtime.secrets.PRIVATE_KEY,
          }).result();

          return result.txHash;
        }
      );

      return { success: true, txHash };
    }),
  ];
}
```

### Workflow Deployment
```typescript
// cre-config.ts
export const creConfig = {
  projectName: "wispy-defi-monitor",
  workflows: [
    {
      name: "defi-monitor",
      entrypoint: "./workflows/defi-monitor.ts",
      config: {
        schedule: "*/15 * * * *",
        uniswapSubgraphUrl: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
        wispyApiUrl: "https://api.wispy.ai",
      },
    },
    {
      name: "price-alert",
      entrypoint: "./workflows/price-alert.ts",
      config: {
        chainlinkFeedAddress: "0x...",
        targetPrice: 3000,
        direction: "below",
        wispyApiUrl: "https://api.wispy.ai",
      },
    },
  ],
  secrets: {
    WISPY_API_KEY: { source: "env", key: "WISPY_API_KEY" },
    PRIVATE_KEY: { source: "env", key: "WALLET_PRIVATE_KEY" },
    WALLET_ADDRESS: { source: "env", key: "WALLET_ADDRESS" },
  },
  network: {
    don: "base-mainnet", // or "base-sepolia" for testnet
    rpcUrl: "https://mainnet.base.org",
  },
};
```

### CLI Commands
```bash
# Initialize project
cre init wispy-workflows

# Install dependencies
npm install @chainlink/cre-sdk zod

# Simulate locally
cre simulate ./workflows/defi-monitor.ts

# Deploy to testnet
cre deploy --network base-sepolia

# Monitor execution
cre logs --workflow defi-monitor
```

## Integration with Wispy

### Trust Controls Bridge
```typescript
// src/cre/bridge.ts
import { createServer } from "http";
import { TrustController } from "../trust/controller";

export function createCREBridge(trustController: TrustController) {
  return {
    // Called by CRE workflow when alert is triggered
    async handleAlert(alert: {
      type: string;
      severity: string;
      message: string;
      action: any;
    }): Promise<{ approvalId: string }> {
      const approvalId = await trustController.createApproval({
        action: alert.action.type,
        description: alert.message,
        metadata: alert.action,
        timeout: 5 * 60 * 1000, // 5 minutes
      });

      return { approvalId };
    },

    // Called by CRE workflow to verify approval
    async verifyApproval(approvalId: string): Promise<boolean> {
      return trustController.isApproved(approvalId);
    },
  };
}
```

## Best Practices

1. **Use simulation** extensively before deploying
2. **Set appropriate timeouts** for external API calls
3. **Handle errors gracefully** with retries
4. **Log everything** for debugging
5. **Test on testnet** before mainnet
6. **Verify approvals** before executing on-chain actions

## References
- Documentation: https://docs.chain.link/cre
- Hackathon: https://chain.link/hackathon
- SDK: npm install @chainlink/cre-sdk
- Bootcamp: https://chain.link/bootcamps/intro-to-chainlink-runtime-environment
