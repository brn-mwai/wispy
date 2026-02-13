/**
 * Mock x402 Seller Services — Express.js servers with x402 payment middleware.
 *
 * Creates 3 paywalled API services for demo:
 * - Weather API ($0.001/call)
 * - Sentiment Analysis API ($0.002/call)
 * - Report Generator API ($0.001/call)
 *
 * Each uses @x402/express middleware + Kobaru facilitator on SKALE.
 */

import express from "express";
import type { Express, Request, Response } from "express";
import type http from "node:http";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  SKALE_BITE_SANDBOX,
  SERVICE_PRICING,
  DEMO_PORTS,
} from "../config.js";

// ─── Types ──────────────────────────────────────────────────

type Network = `${string}:${string}`;

interface ServiceConfig {
  name: string;
  port: number;
  payTo: string;
  price: string;
  network: Network;
}

interface RunningService {
  name: string;
  port: number;
  server: http.Server;
}

// ─── Module State ───────────────────────────────────────────

const runningServices: RunningService[] = [];

// ─── Route Config Helper ────────────────────────────────────

function makeRouteConfig(payTo: string, price: string, network: Network, description: string) {
  return {
    accepts: [
      {
        scheme: "exact",
        network,
        payTo,
        price: {
          amount: price,
          asset: SKALE_BITE_SANDBOX.usdc,
          extra: { name: "USDC", version: "1" },
        },
        maxTimeoutSeconds: 300,
      },
    ],
    description,
  };
}

// ─── Weather Service ────────────────────────────────────────

function createWeatherApp(config: ServiceConfig): Express {
  const app = express();
  app.use(express.json());

  const middleware = paymentMiddlewareFromConfig(
    {
      "/weather": makeRouteConfig(
        config.payTo,
        config.price,
        config.network,
        "Weather data API",
      ),
    },
    new HTTPFacilitatorClient({ url: SKALE_BITE_SANDBOX.facilitatorUrl }),
    [{ network: config.network, server: new ExactEvmScheme() }],
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "weather", price: SERVICE_PRICING.weather.display });
  });

  app.use(middleware);

  app.get("/weather", (req: Request, res: Response) => {
    const city = (req.query.city as string) ?? "Nairobi";
    // Paid weather request served
    res.json({
      city,
      temperature: 24 + Math.round(Math.random() * 6),
      condition: ["Partly Cloudy", "Sunny", "Light Rain", "Overcast"][
        Math.floor(Math.random() * 4)
      ],
      humidity: 55 + Math.round(Math.random() * 20),
      wind: { speed: 8 + Math.round(Math.random() * 10), direction: "NE" },
      timestamp: new Date().toISOString(),
      source: "Wispy Weather Service (x402-paywalled)",
    });
  });

  return app;
}

// ─── Sentiment Service ──────────────────────────────────────

function createSentimentApp(config: ServiceConfig): Express {
  const app = express();
  app.use(express.json());

  const middleware = paymentMiddlewareFromConfig(
    {
      "/analyze": makeRouteConfig(
        config.payTo,
        config.price,
        config.network,
        "Sentiment analysis API",
      ),
    },
    new HTTPFacilitatorClient({ url: SKALE_BITE_SANDBOX.facilitatorUrl }),
    [{ network: config.network, server: new ExactEvmScheme() }],
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "sentiment", price: SERVICE_PRICING.sentiment.display });
  });

  app.use(middleware);

  app.post("/analyze", (req: Request, res: Response) => {
    const text = (req.body as { text?: string })?.text ?? "No text provided";
    // Paid sentiment analysis served

    const sentiments = ["positive", "negative", "neutral"] as const;
    const sentiment = sentiments[Math.floor(Math.random() * 3)];
    const score = sentiment === "positive" ? 0.7 + Math.random() * 0.3
      : sentiment === "negative" ? -(0.7 + Math.random() * 0.3)
      : -0.2 + Math.random() * 0.4;

    res.json({
      sentiment,
      score: Math.round(score * 100) / 100,
      keywords: text.split(/\s+/).slice(0, 5),
      confidence: 0.85 + Math.random() * 0.15,
      timestamp: new Date().toISOString(),
      source: "Wispy Sentiment Service (x402-paywalled)",
    });
  });

  return app;
}

// ─── Report Service ─────────────────────────────────────────

function createReportApp(config: ServiceConfig): Express {
  const app = express();
  app.use(express.json());

  const middleware = paymentMiddlewareFromConfig(
    {
      "/report": makeRouteConfig(
        config.payTo,
        config.price,
        config.network,
        "Report generation API",
      ),
    },
    new HTTPFacilitatorClient({ url: SKALE_BITE_SANDBOX.facilitatorUrl }),
    [{ network: config.network, server: new ExactEvmScheme() }],
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "report", price: SERVICE_PRICING.report.display });
  });

  app.use(middleware);

  app.post("/report", (req: Request, res: Response) => {
    const body = req.body as { data?: unknown[]; format?: string };
    const format = body?.format ?? "summary";
    // Paid report generation served

    res.json({
      title: "Agent-Generated Report",
      format,
      summary: "This report was generated by combining weather and sentiment data from paid x402 API services.",
      sections: [
        {
          heading: "Data Sources",
          content: "Weather API ($0.001) + Sentiment API ($0.002)",
        },
        {
          heading: "Key Findings",
          content: "All data sources were accessed via x402 micro-payments on SKALE BITE V2 Sandbox.",
        },
        {
          heading: "Cost Analysis",
          content: `Total cost: $0.004 USDC across 3 API calls. All transactions settled on-chain.`,
        },
      ],
      generatedAt: new Date().toISOString(),
      source: "Wispy Report Service (x402-paywalled)",
    });
  });

  return app;
}

// ─── Service Lifecycle ──────────────────────────────────────

/**
 * Try to close a port by connecting and immediately closing.
 * Returns true if port was freed.
 */
async function ensurePortFree(port: number): Promise<void> {
  // Close any existing services we're tracking
  const existing = runningServices.filter((s) => s.port === port);
  for (const svc of existing) {
    await new Promise<void>((resolve) => svc.server.close(() => resolve()));
  }
  // Remove from tracking
  const remaining = runningServices.filter((s) => s.port !== port);
  runningServices.length = 0;
  runningServices.push(...remaining);
}

/**
 * Start all mock x402 services.
 * @param sellerAddress - Wallet address to receive payments
 */
export async function startAllServices(sellerAddress: string): Promise<void> {
  // Clean up any running services from previous demo runs
  if (runningServices.length > 0) {
    await stopAllServices();
  }

  const services: Array<{ name: string; port: number; app: Express }> = [
    {
      name: "weather",
      port: DEMO_PORTS.weather,
      app: createWeatherApp({
        name: "weather",
        port: DEMO_PORTS.weather,
        payTo: sellerAddress,
        price: SERVICE_PRICING.weather.price,
        network: SKALE_BITE_SANDBOX.network,
      }),
    },
    {
      name: "sentiment",
      port: DEMO_PORTS.sentiment,
      app: createSentimentApp({
        name: "sentiment",
        port: DEMO_PORTS.sentiment,
        payTo: sellerAddress,
        price: SERVICE_PRICING.sentiment.price,
        network: SKALE_BITE_SANDBOX.network,
      }),
    },
    {
      name: "report",
      port: DEMO_PORTS.report,
      app: createReportApp({
        name: "report",
        port: DEMO_PORTS.report,
        payTo: sellerAddress,
        price: SERVICE_PRICING.report.price,
        network: SKALE_BITE_SANDBOX.network,
      }),
    },
  ];

  for (const svc of services) {
    await ensurePortFree(svc.port);
    await new Promise<void>((resolve, reject) => {
      const server = svc.app.listen(svc.port, () => {
        runningServices.push({ name: svc.name, port: svc.port, server });
        resolve();
      });
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          // Port still in use from a crashed previous run — skip this service
          console.log(`[seller:${svc.name}] Port ${svc.port} in use, trying to recover...`);
          // Try to kill the port and retry once
          const net = require("net") as typeof import("net");
          const probe = net.createConnection({ port: svc.port }, () => {
            probe.end();
            // Port is genuinely in use by another process
            reject(new Error(`Port ${svc.port} is already in use. Kill the process using it or restart Wispy.`));
          });
          probe.on("error", () => {
            // Port was in TIME_WAIT, retry after a short delay
            setTimeout(() => {
              const retryServer = svc.app.listen(svc.port, () => {
                runningServices.push({ name: svc.name, port: svc.port, server: retryServer });
                resolve();
              });
              retryServer.on("error", reject);
            }, 500);
          });
        } else {
          reject(err);
        }
      });
    });
  }

  console.log(`\n=== Wispy x402 Agentic Commerce Demo Services ===\n`);
  console.log(`Seller wallet: ${sellerAddress}`);
  console.log(`Network: SKALE BITE V2 Sandbox (chain ${SKALE_BITE_SANDBOX.chainId})`);
  console.log(`Facilitator: ${SKALE_BITE_SANDBOX.facilitatorUrl}\n`);
  console.log(`Services running:`);
  console.log(`  Weather API:    http://127.0.0.1:${DEMO_PORTS.weather}/weather?city=Nairobi  (${SERVICE_PRICING.weather.display}/call)`);
  console.log(`  Sentiment API:  http://127.0.0.1:${DEMO_PORTS.sentiment}/analyze               (${SERVICE_PRICING.sentiment.display}/call)`);
  console.log(`  Report API:     http://127.0.0.1:${DEMO_PORTS.report}/report                (${SERVICE_PRICING.report.display}/call)\n`);
  console.log(`Ready for agent testing.\n`);
}

/** Stop all running mock services */
export async function stopAllServices(): Promise<void> {
  for (const svc of runningServices) {
    await new Promise<void>((resolve) => {
      svc.server.close(() => {
        // Service stopped
        resolve();
      });
    });
  }
  runningServices.length = 0;
}

/** Get URLs for all services (use 127.0.0.1 to avoid IPv6 issues on Windows) */
export function getServiceUrls(): Record<string, string> {
  return {
    weather: `http://127.0.0.1:${DEMO_PORTS.weather}/weather`,
    sentiment: `http://127.0.0.1:${DEMO_PORTS.sentiment}/analyze`,
    report: `http://127.0.0.1:${DEMO_PORTS.report}/report`,
  };
}
