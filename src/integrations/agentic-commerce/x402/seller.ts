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
    console.log(`[seller:weather] Paid request for city=${city}`);
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
    console.log(`[seller:sentiment] Paid analysis for: "${text.slice(0, 50)}..."`);

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
    console.log(`[seller:report] Paid report generation (format=${format})`);

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
 * Start all mock x402 services.
 * @param sellerAddress - Wallet address to receive payments
 */
export async function startAllServices(sellerAddress: string): Promise<void> {
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
    await new Promise<void>((resolve, reject) => {
      const server = svc.app.listen(svc.port, () => {
        console.log(`[seller:${svc.name}] Listening on http://localhost:${svc.port}`);
        runningServices.push({ name: svc.name, port: svc.port, server });
        resolve();
      });
      server.on("error", reject);
    });
  }

  console.log(`\n=== Wispy x402 Agentic Commerce Demo Services ===\n`);
  console.log(`Seller wallet: ${sellerAddress}`);
  console.log(`Network: SKALE BITE V2 Sandbox (chain ${SKALE_BITE_SANDBOX.chainId})`);
  console.log(`Facilitator: ${SKALE_BITE_SANDBOX.facilitatorUrl}\n`);
  console.log(`Services running:`);
  console.log(`  Weather API:    http://localhost:${DEMO_PORTS.weather}/weather?city=Nairobi  (${SERVICE_PRICING.weather.display}/call)`);
  console.log(`  Sentiment API:  http://localhost:${DEMO_PORTS.sentiment}/analyze               (${SERVICE_PRICING.sentiment.display}/call)`);
  console.log(`  Report API:     http://localhost:${DEMO_PORTS.report}/report                (${SERVICE_PRICING.report.display}/call)\n`);
  console.log(`Ready for agent testing.\n`);
}

/** Stop all running mock services */
export async function stopAllServices(): Promise<void> {
  for (const svc of runningServices) {
    await new Promise<void>((resolve) => {
      svc.server.close(() => {
        console.log(`[seller:${svc.name}] Stopped`);
        resolve();
      });
    });
  }
  runningServices.length = 0;
}

/** Get URLs for all services */
export function getServiceUrls(): Record<string, string> {
  return {
    weather: `http://localhost:${DEMO_PORTS.weather}/weather`,
    sentiment: `http://localhost:${DEMO_PORTS.sentiment}/analyze`,
    report: `http://localhost:${DEMO_PORTS.report}/report`,
  };
}
