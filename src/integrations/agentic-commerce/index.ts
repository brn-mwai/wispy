/**
 * Agentic Commerce Integration — x402 Autonomous Agent Payments on SKALE.
 *
 * Enables Wispy's AI agent to:
 * - Discover and pay for x402-paywalled APIs autonomously
 * - Follow AP2 structured authorization flows (intent -> cart -> payment -> receipt)
 * - Execute DeFi trades with risk controls
 * - Use BITE v2 threshold encryption for conditional transactions
 *
 * Hackathon: SF Agentic Commerce x402 (SKALE Labs, Feb 2026)
 */

import { Integration } from "../base.js";
import type { IntegrationManifest, ToolResult } from "../base.js";
import { X402Buyer } from "./x402/buyer.js";
import { SpendTracker } from "./x402/tracker.js";
import { AP2Flow } from "./ap2/flow.js";
import { RiskEngine } from "./defi/risk-engine.js";
import { DeFiAgent } from "./defi/swap.js";
import { EncryptedCommerce } from "./bite/encrypted-tx.js";
import type { EncryptedPayment } from "./bite/encrypted-tx.js";
import type { PaymentCondition } from "./bite/conditional.js";

export default class AgenticCommerceIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "agentic-commerce",
    name: "Agentic Commerce (x402)",
    category: "tools",
    version: "1.0.0",
    description:
      "Autonomous agent commerce via x402 protocol on SKALE. Enables paid API discovery, budget-aware spending, AP2 authorization flows, DeFi trading with risk controls, and BITE v2 encrypted conditional transactions.",

    auth: {
      type: "api-key",
      envVars: ["AGENT_PRIVATE_KEY"],
    },

    tools: [
      // ─── x402 Buyer Tools ────────────────────────────
      {
        name: "x402_pay_and_fetch",
        description:
          "Access a paid API endpoint using x402 protocol. Automatically handles HTTP 402 payment challenge, signs EIP-3009 authorization, pays USDC via facilitator, and retries with proof. Tracks spending against daily budget.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL of the x402-paywalled API endpoint",
            },
            method: {
              type: "string",
              description: "HTTP method: GET or POST. Default: GET",
            },
            body: {
              type: "string",
              description: "JSON request body for POST requests",
            },
            reason: {
              type: "string",
              description:
                "Why you are paying for this service (for audit trail)",
            },
          },
          required: ["url", "reason"],
        },
      },
      {
        name: "x402_check_budget",
        description:
          "Check remaining daily budget, total spent today, and per-recipient spending breakdown.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "x402_audit_trail",
        description:
          "Get the full audit trail of all x402 payments made in this session. Includes tx hashes, amounts, recipients, and reasons.",
        parameters: {
          type: "object",
          properties: {
            format: {
              type: "string",
              description:
                "Output format: json or markdown. Default: markdown",
            },
          },
        },
      },

      // ─── AP2 Authorization Tools ─────────────────────
      {
        name: "ap2_purchase",
        description:
          "Execute a full AP2 (Agent Payment Protocol) purchase flow: create intent mandate, receive cart from merchant, authorize payment, settle via x402, generate receipt.",
        parameters: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Natural language description of what to buy",
            },
            service_url: {
              type: "string",
              description: "URL of the paid service",
            },
            merchant_name: {
              type: "string",
              description: "Name of the service provider",
            },
            max_budget: {
              type: "string",
              description:
                "Maximum willing to pay in USDC (e.g. '0.01')",
            },
          },
          required: [
            "description",
            "service_url",
            "merchant_name",
            "max_budget",
          ],
        },
      },
      {
        name: "ap2_get_receipts",
        description:
          "Get all AP2 transaction records with full mandate chain (intent -> cart -> payment -> receipt).",
        parameters: {
          type: "object",
          properties: {
            format: {
              type: "string",
              description:
                "Output format: json or markdown. Default: markdown",
            },
          },
        },
      },

      // ─── DeFi Agent Tools ────────────────────────────
      {
        name: "defi_research",
        description:
          "Research market conditions for a token. Gathers price, 24h change, volume from multiple sources.",
        parameters: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "Token symbol or address to research",
            },
          },
          required: ["token"],
        },
      },
      {
        name: "defi_swap",
        description:
          "Execute a token swap with risk controls. Evaluates trade against risk profile before executing.",
        parameters: {
          type: "object",
          properties: {
            from_token: {
              type: "string",
              description: "Token to sell (address or symbol)",
            },
            to_token: {
              type: "string",
              description: "Token to buy (address or symbol)",
            },
            amount: {
              type: "string",
              description: "Amount to swap in USDC",
            },
            reasoning: {
              type: "string",
              description: "Why this trade should be executed",
            },
          },
          required: ["from_token", "to_token", "amount", "reasoning"],
        },
      },
      {
        name: "defi_trade_log",
        description:
          "Get the formatted trade log with all decisions, reason codes, and risk evaluations.",
        parameters: { type: "object", properties: {} },
      },

      // ─── BITE v2 Encrypted Transaction Tools ─────────
      {
        name: "bite_encrypt_payment",
        description:
          "Encrypt a payment using BITE v2 threshold encryption. Hidden until condition is met.",
        parameters: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description: "Recipient address",
            },
            data: {
              type: "string",
              description: "Transaction data (hex encoded)",
            },
            condition_type: {
              type: "string",
              description:
                "Condition type: delivery_proof, time_lock, attestation, manual_trigger",
            },
            condition_description: {
              type: "string",
              description:
                "Human-readable description of the unlock condition",
            },
            condition_params: {
              type: "string",
              description: "JSON parameters for the condition",
            },
          },
          required: ["to", "data", "condition_type", "condition_description"],
        },
      },
      {
        name: "bite_check_and_execute",
        description:
          "Check if an encrypted payment's condition is met, and execute it if so.",
        parameters: {
          type: "object",
          properties: {
            payment_id: {
              type: "string",
              description: "ID of the encrypted payment to check",
            },
          },
          required: ["payment_id"],
        },
      },
      {
        name: "bite_lifecycle_report",
        description:
          "Get the full lifecycle report of an encrypted payment.",
        parameters: {
          type: "object",
          properties: {
            payment_id: {
              type: "string",
              description: "ID of the encrypted payment",
            },
          },
          required: ["payment_id"],
        },
      },
    ],

    requires: {
      env: ["AGENT_PRIVATE_KEY"],
    },

    capabilities: {
      offline: false,
      streaming: false,
    },
  };

  // ─── Private State ──────────────────────────────────────

  private buyer?: X402Buyer;
  private tracker?: SpendTracker;
  private ap2Flow?: AP2Flow;
  private defiAgent?: DeFiAgent;
  private riskEngine?: RiskEngine;
  private encryptedCommerce?: EncryptedCommerce;

  // ─── Lifecycle ──────────────────────────────────────────

  async onEnable(): Promise<void> {
    const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
    if (!privateKey) {
      throw new Error(
        "AGENT_PRIVATE_KEY environment variable is required for agentic-commerce integration",
      );
    }

    this.buyer = new X402Buyer({ privateKey });
    this.tracker = new SpendTracker(this.buyer.address);
    this.buyer.setTracker(this.tracker);
    this.ap2Flow = new AP2Flow(this.buyer, this.tracker);
    this.riskEngine = new RiskEngine();
    this.defiAgent = new DeFiAgent(privateKey, this.riskEngine, this.tracker);
    this.encryptedCommerce = new EncryptedCommerce(undefined, privateKey);

    console.log(
      `[agentic-commerce] Enabled. Wallet: ${this.buyer.address}`,
    );
  }

  async onDisable(): Promise<void> {
    this.buyer = undefined;
    this.tracker = undefined;
    this.ap2Flow = undefined;
    this.defiAgent = undefined;
    this.riskEngine = undefined;
    this.encryptedCommerce = undefined;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.buyer) {
      return { healthy: false, message: "Not initialized — AGENT_PRIVATE_KEY missing" };
    }
    return { healthy: true, message: `Wallet: ${this.buyer.address}` };
  }

  // ─── Tool Dispatch ──────────────────────────────────────

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "x402_pay_and_fetch":
          return await this.handlePayAndFetch(args);
        case "x402_check_budget":
          return this.handleCheckBudget();
        case "x402_audit_trail":
          return this.handleAuditTrail(args);
        case "ap2_purchase":
          return await this.handleAP2Purchase(args);
        case "ap2_get_receipts":
          return this.handleAP2Receipts(args);
        case "defi_research":
          return await this.handleDeFiResearch(args);
        case "defi_swap":
          return await this.handleDeFiSwap(args);
        case "defi_trade_log":
          return this.handleTradeLog();
        case "bite_encrypt_payment":
          return await this.handleBiteEncrypt(args);
        case "bite_check_and_execute":
          return await this.handleBiteExecute(args);
        case "bite_lifecycle_report":
          return this.handleBiteReport(args);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Agentic commerce error: ${(err as Error).message}`);
    }
  }

  // ─── x402 Handlers ──────────────────────────────────────

  private async handlePayAndFetch(
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.buyer) return this.error("Not initialized");
    const url = args.url as string;
    const reason = args.reason as string;
    if (!url) return this.error("url is required");
    if (!reason) return this.error("reason is required");

    const method = (args.method as string) ?? "GET";
    const body = args.body as string | undefined;

    const options: RequestInit = { method };
    if (body && method === "POST") {
      options.body = body;
      options.headers = { "Content-Type": "application/json" };
    }

    const response = await this.buyer.payAndFetch(url, options, reason);
    const data = await response.text();

    return this.ok(data, {
      status: response.status,
      url,
      dailySpent: this.buyer.getDailySpent(),
      remaining: this.buyer.getRemainingBudget(),
    });
  }

  private handleCheckBudget(): ToolResult {
    if (!this.buyer) return this.error("Not initialized");
    return this.ok(this.buyer.getBudgetStatus());
  }

  private handleAuditTrail(args: Record<string, unknown>): ToolResult {
    if (!this.tracker) return this.error("Not initialized");
    const format = (args.format as string) ?? "markdown";
    return this.ok(
      format === "json" ? this.tracker.toJSON() : this.tracker.formatReport(),
    );
  }

  // ─── AP2 Handlers ──────────────────────────────────────

  private async handleAP2Purchase(
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.ap2Flow || !this.buyer)
      return this.error("Not initialized");

    const description = args.description as string;
    const serviceUrl = args.service_url as string;
    const merchantName = args.merchant_name as string;
    const maxBudget = args.max_budget as string;

    if (!description || !serviceUrl || !merchantName || !maxBudget) {
      return this.error(
        "All parameters required: description, service_url, merchant_name, max_budget",
      );
    }

    // Use a deterministic merchant address based on URL for demo
    const merchantAddress = `0x${Buffer.from(new URL(serviceUrl).host).toString("hex").padEnd(40, "0").slice(0, 40)}`;

    const record = await this.ap2Flow.purchase({
      description,
      serviceUrl,
      merchantAddress,
      merchantName,
      expectedPrice: maxBudget,
    });

    const { formatReceiptMarkdown } = await import("./ap2/receipts.js");
    return this.ok(formatReceiptMarkdown(record), {
      status: record.receipt.status,
      txHash: record.receipt.txHash,
      intentId: record.intent.id,
      amount: record.receipt.amount,
    });
  }

  private handleAP2Receipts(args: Record<string, unknown>): ToolResult {
    if (!this.ap2Flow) return this.error("Not initialized");
    const format = (args.format as string) ?? "markdown";
    return this.ok(this.ap2Flow.formatAuditTrail(format as "json" | "markdown"));
  }

  // ─── DeFi Handlers ─────────────────────────────────────

  private async handleDeFiResearch(
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.defiAgent) return this.error("Not initialized");
    const token = args.token as string;
    if (!token) return this.error("token is required");

    const research = await this.defiAgent.research(token);
    return this.ok(
      [
        `Token: ${token}`,
        `Price: $${research.price}`,
        `24h Change: ${research.change24h > 0 ? "+" : ""}${research.change24h}%`,
        `Volume: $${research.volume.toLocaleString()}`,
        `Sources: ${research.sources.join(", ")}`,
        `Recommendation: ${research.recommendation}`,
      ].join("\n"),
      { price: research.price, change24h: research.change24h },
    );
  }

  private async handleDeFiSwap(
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.defiAgent) return this.error("Not initialized");

    const fromToken = args.from_token as string;
    const toToken = args.to_token as string;
    const amount = args.amount as string;
    const reasoning = args.reasoning as string;

    if (!fromToken || !toToken || !amount || !reasoning) {
      return this.error(
        "All parameters required: from_token, to_token, amount, reasoning",
      );
    }

    const result = await this.defiAgent.swap({
      fromToken,
      toToken,
      amount,
      reasoning,
    });

    if (!result.success) {
      return this.ok(
        `Swap DENIED: ${result.error}\nRisk score: ${result.decision.riskScore}/100`,
        { approved: false, riskScore: result.decision.riskScore },
      );
    }

    return this.ok(
      [
        `Swap executed successfully`,
        `${result.amountIn} ${result.fromToken} -> ${result.amountOut} ${result.toToken}`,
        `Tx: ${result.txHash}`,
        `Slippage: ${result.slippage}%`,
        `Risk score: ${result.decision.riskScore}/100`,
      ].join("\n"),
      {
        txHash: result.txHash,
        riskScore: result.decision.riskScore,
        approved: true,
      },
    );
  }

  private handleTradeLog(): ToolResult {
    if (!this.defiAgent) return this.error("Not initialized");
    return this.ok(this.defiAgent.getTradeLog());
  }

  // ─── BITE v2 Handlers ──────────────────────────────────

  private async handleBiteEncrypt(
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.encryptedCommerce)
      return this.error("Not initialized");

    const to = args.to as string;
    const data = args.data as string;
    const conditionType = args.condition_type as PaymentCondition["type"];
    const conditionDescription = args.condition_description as string;
    const conditionParamsStr = args.condition_params as string | undefined;

    if (!to || !data || !conditionType || !conditionDescription) {
      return this.error(
        "Required: to, data, condition_type, condition_description",
      );
    }

    let conditionParams: Record<string, unknown> = {};
    if (conditionParamsStr) {
      try {
        conditionParams = JSON.parse(conditionParamsStr);
      } catch {
        return this.error("condition_params must be valid JSON");
      }
    }

    const payment = await this.encryptedCommerce.encryptPayment({
      to,
      data,
      condition: {
        type: conditionType,
        description: conditionDescription,
        params: conditionParams,
      },
    });

    return this.ok(this.encryptedCommerce.getReport(payment.id), {
      paymentId: payment.id,
      status: payment.status,
    });
  }

  private async handleBiteExecute(
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.encryptedCommerce)
      return this.error("Not initialized");

    const paymentId = args.payment_id as string;
    if (!paymentId) return this.error("payment_id is required");

    const payment = await this.encryptedCommerce.executeIfConditionMet(
      paymentId,
    );

    return this.ok(this.encryptedCommerce.getReport(paymentId), {
      status: payment.status,
      txHash: payment.txHash,
    });
  }

  private handleBiteReport(args: Record<string, unknown>): ToolResult {
    if (!this.encryptedCommerce)
      return this.error("Not initialized");

    const paymentId = args.payment_id as string;
    if (!paymentId) return this.error("payment_id is required");

    return this.ok(this.encryptedCommerce.getReport(paymentId));
  }
}
