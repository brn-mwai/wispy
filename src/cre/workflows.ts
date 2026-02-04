/**
 * Chainlink CRE Workflows
 *
 * Runtime Environment workflows for DeFi monitoring, price alerts,
 * and on-chain actions with Wispy Trust Controls integration.
 *
 * For Chainlink Convergence Hackathon submission.
 */

import { createLogger } from "../infra/logger.js";
import { getTrustController } from "../trust/controller.js";

const log = createLogger("cre");

// ==================== CRE TYPES ====================

export interface CREConfig {
  schedule?: string; // Cron expression
  rpcUrl?: string;
  wispyApiUrl?: string;
  chainId?: number;
}

export interface CRETrigger {
  type: "cron" | "evmLog" | "http";
  config: Record<string, unknown>;
}

export interface CREHandler {
  trigger: CRETrigger;
  execute: (runtime: CRERuntime, event?: unknown) => Promise<CREResult>;
}

export interface CRERuntime {
  config: CREConfig;
  secrets: Record<string, string>;
  runInNodeMode: <T>(fn: (nodeRuntime: CRENodeRuntime) => Promise<T>) => Promise<T>;
}

export interface CRENodeRuntime {
  config: CREConfig;
  httpFetch: (params: HTTPFetchParams) => Promise<HTTPResponse>;
  evmRead: (params: EVMReadParams) => Promise<unknown>;
  evmWrite: (params: EVMWriteParams) => Promise<{ txHash: string }>;
}

export interface HTTPFetchParams {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

export interface HTTPResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface EVMReadParams {
  contractAddress: string;
  method: string;
  args?: unknown[];
  chainId?: number;
}

export interface EVMWriteParams {
  contractAddress: string;
  method: string;
  args?: unknown[];
  chainId?: number;
}

export interface CREResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ==================== WORKFLOW DEFINITIONS ====================

/**
 * DeFi Monitoring Workflow
 *
 * Monitors Uniswap positions for impermanent loss risk
 * and sends alerts through Wispy Trust Controls.
 */
export function createDeFiMonitorWorkflow(config: {
  schedule: string;
  subgraphUrl: string;
  walletAddress: string;
  ilThreshold: number;
  wispyApiUrl: string;
}): CREHandler {
  return {
    trigger: {
      type: "cron",
      config: { schedule: config.schedule },
    },
    execute: async (runtime: CRERuntime): Promise<CREResult> => {
      log.info("Running DeFi monitor workflow");

      // Fetch positions from subgraph
      const positions = await runtime.runInNodeMode(async (nodeRuntime) => {
        const query = `{
          positions(where: { owner: "${config.walletAddress}" }) {
            id
            liquidity
            token0 { symbol decimals }
            token1 { symbol decimals }
            pool { sqrtPrice feeTier }
          }
        }`;

        const response = await nodeRuntime.httpFetch({
          url: config.subgraphUrl,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        return JSON.parse(response.body);
      });

      // Calculate IL for each position
      const alerts: string[] = [];
      const positionsAtRisk: string[] = [];

      for (const position of positions.data?.positions || []) {
        const ilRisk = calculateILRisk(position);

        if (ilRisk > config.ilThreshold) {
          alerts.push(
            `${position.token0.symbol}/${position.token1.symbol}: ` +
            `IL Risk ${(ilRisk * 100).toFixed(2)}%`
          );
          positionsAtRisk.push(position.id);
        }
      }

      // Send alerts through Wispy Trust Controls
      if (alerts.length > 0) {
        const trust = getTrustController();
        const { id } = await trust.createApproval({
          action: "defi_rebalance",
          description: `DeFi Alert: ${alerts.length} positions at risk\n${alerts.join("\n")}`,
          metadata: {
            type: "defi_alert",
            severity: "high",
            positions: positionsAtRisk,
          },
          channel: "cre",
          userId: "cre_workflow",
          timeout: 10 * 60 * 1000, // 10 minutes
        });

        log.info("DeFi alert sent: %s", id);
      }

      return {
        success: true,
        data: {
          positionsChecked: positions.data?.positions?.length || 0,
          alertsSent: alerts.length,
        },
      };
    },
  };
}

/**
 * Price Alert Workflow
 *
 * Triggers on Chainlink price feed updates
 * and notifies through Wispy when thresholds are crossed.
 */
export function createPriceAlertWorkflow(config: {
  feedAddress: string;
  targetPrice: number;
  direction: "above" | "below";
  chainId: number;
  wispyApiUrl: string;
}): CREHandler {
  return {
    trigger: {
      type: "evmLog",
      config: {
        address: config.feedAddress,
        eventSignature: "AnswerUpdated(int256,uint256,uint256)",
        chainId: config.chainId,
      },
    },
    execute: async (runtime: CRERuntime, event: unknown): Promise<CREResult> => {
      const eventData = event as { args: { answer: string } };
      const newPrice = parseFloat(eventData.args.answer) / 1e8;

      log.info("Price update received: $%s", newPrice.toFixed(2));

      const shouldAlert =
        (config.direction === "above" && newPrice > config.targetPrice) ||
        (config.direction === "below" && newPrice < config.targetPrice);

      if (shouldAlert) {
        const trust = getTrustController();
        await trust.createApproval({
          action: "price_alert",
          description: `Price ${config.direction} $${config.targetPrice}: Current $${newPrice.toFixed(2)}`,
          metadata: {
            type: "price_alert",
            severity: "medium",
            price: newPrice,
            threshold: config.targetPrice,
            direction: config.direction,
          },
          channel: "cre",
          userId: "cre_workflow",
        });

        log.info("Price alert triggered: $%s %s $%s",
          newPrice.toFixed(2), config.direction, config.targetPrice);
      }

      return {
        success: true,
        data: { triggered: shouldAlert, price: newPrice },
      };
    },
  };
}

/**
 * On-Chain Action Workflow
 *
 * Executes approved on-chain actions through Wispy Trust Controls.
 */
export function createOnChainActionWorkflow(config: {
  contractAddress: string;
  chainId: number;
  wispyApiUrl: string;
}): CREHandler {
  return {
    trigger: {
      type: "http",
      config: { path: "/execute", method: "POST" },
    },
    execute: async (runtime: CRERuntime, request: unknown): Promise<CREResult> => {
      const { action, params, approvalId } = request as {
        action: string;
        params: unknown[];
        approvalId: string;
      };

      // Verify approval through Wispy Trust Controls
      const trust = getTrustController();
      const { valid, request: approvalRequest } = trust.verifyApproval(approvalId);

      if (!valid) {
        log.warn("Invalid or expired approval: %s", approvalId);
        return { success: false, error: "Action not approved" };
      }

      log.info("Executing approved action: %s", action);

      // Execute on-chain action
      const txResult = await runtime.runInNodeMode(async (nodeRuntime) => {
        return nodeRuntime.evmWrite({
          contractAddress: config.contractAddress,
          method: action,
          args: params,
          chainId: config.chainId,
        });
      });

      log.info("Transaction submitted: %s", txResult.txHash);

      return {
        success: true,
        data: { txHash: txResult.txHash },
      };
    },
  };
}

/**
 * Trust Controls Bridge Workflow
 *
 * Receives alerts from CRE workflows and creates approval requests.
 */
export function createTrustBridgeWorkflow(config: {
  wispyApiUrl: string;
}): CREHandler {
  return {
    trigger: {
      type: "http",
      config: { path: "/trust/alert", method: "POST" },
    },
    execute: async (runtime: CRERuntime, request: unknown): Promise<CREResult> => {
      const alert = request as {
        type: string;
        severity: string;
        message: string;
        action: {
          type: string;
          [key: string]: unknown;
        };
      };

      const trust = getTrustController();

      const { id, level } = await trust.createApproval({
        action: alert.action.type,
        description: alert.message,
        metadata: {
          alertType: alert.type,
          severity: alert.severity,
          ...alert.action,
        },
        channel: "cre",
        userId: "cre_bridge",
        timeout: 5 * 60 * 1000, // 5 minutes
      });

      log.info("Trust bridge alert created: %s (%s)", id, level);

      return {
        success: true,
        data: { approvalId: id, level },
      };
    },
  };
}

// ==================== CRE CONFIG GENERATOR ====================

export interface CREProjectConfig {
  projectName: string;
  workflows: Array<{
    name: string;
    entrypoint: string;
    config: Record<string, unknown>;
  }>;
  secrets: Record<string, { source: string; key: string }>;
  network: {
    don: string;
    rpcUrl: string;
  };
}

export function generateCREConfig(options: {
  projectName: string;
  wispyApiUrl: string;
  walletAddress: string;
}): CREProjectConfig {
  return {
    projectName: options.projectName,
    workflows: [
      {
        name: "defi-monitor",
        entrypoint: "./workflows/defi-monitor.ts",
        config: {
          schedule: "*/15 * * * *", // Every 15 minutes
          subgraphUrl: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
          ilThreshold: 0.1,
          wispyApiUrl: options.wispyApiUrl,
        },
      },
      {
        name: "price-alert",
        entrypoint: "./workflows/price-alert.ts",
        config: {
          feedAddress: "0x...", // ETH/USD on Base
          targetPrice: 3000,
          direction: "below",
          chainId: 8453,
          wispyApiUrl: options.wispyApiUrl,
        },
      },
      {
        name: "trust-bridge",
        entrypoint: "./workflows/trust-bridge.ts",
        config: {
          wispyApiUrl: options.wispyApiUrl,
        },
      },
    ],
    secrets: {
      WISPY_API_KEY: { source: "env", key: "WISPY_API_KEY" },
      PRIVATE_KEY: { source: "env", key: "WALLET_PRIVATE_KEY" },
      WALLET_ADDRESS: { source: "env", key: "WALLET_ADDRESS" },
    },
    network: {
      don: "base-sepolia",
      rpcUrl: "https://sepolia.base.org",
    },
  };
}

// ==================== HELPERS ====================

function calculateILRisk(position: {
  pool: { sqrtPrice: string };
  token0: { symbol: string };
  token1: { symbol: string };
}): number {
  // Simplified IL calculation
  // In production, would compare to entry price from historical data
  const sqrtPrice = parseFloat(position.pool.sqrtPrice);
  const currentPrice = (sqrtPrice / 2 ** 96) ** 2;

  // Mock IL risk based on price deviation
  // Real implementation would track entry price
  return Math.random() * 0.2; // 0-20% mock IL
}

// ==================== SIMULATION ====================

/**
 * Simulate a CRE workflow locally
 */
export async function simulateWorkflow(
  workflow: CREHandler,
  config: CREConfig,
  secrets: Record<string, string> = {},
  mockEvent?: unknown
): Promise<CREResult> {
  log.info("Simulating CRE workflow");

  const nodeRuntime: CRENodeRuntime = {
    config,
    httpFetch: async (params) => {
      log.debug("HTTP fetch: %s %s", params.method || "GET", params.url);
      const response = await fetch(params.url, {
        method: params.method,
        headers: params.headers,
        body: params.body,
      });
      const headersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      return {
        status: response.status,
        body: await response.text(),
        headers: headersObj,
      };
    },
    evmRead: async (params) => {
      log.debug("EVM read: %s.%s", params.contractAddress, params.method);
      return null; // Mock
    },
    evmWrite: async (params) => {
      log.debug("EVM write: %s.%s", params.contractAddress, params.method);
      return { txHash: `0x${Math.random().toString(16).slice(2)}` };
    },
  };

  const runtime: CRERuntime = {
    config,
    secrets,
    runInNodeMode: async (fn) => fn(nodeRuntime),
  };

  return workflow.execute(runtime, mockEvent);
}
