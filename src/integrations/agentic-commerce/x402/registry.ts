/**
 * x402 Service Registry — discovers and catalogs x402-paywalled services.
 *
 * Provides:
 * - Local demo services (weather, sentiment, report)
 * - Known external x402 services (CoinGecko, Bazaar)
 * - Service discovery by category
 */

import { DEMO_PORTS, SERVICE_PRICING } from "../config.js";

// ─── Types ──────────────────────────────────────────────────

export interface X402Service {
  name: string;
  url: string;
  description: string;
  price: string;
  priceDisplay: string;
  method: "GET" | "POST";
  category: "data" | "analytics" | "defi" | "infrastructure" | "ai";
  provider: "local" | "external";
  exampleBody?: string;
  exampleParams?: string;
}

export interface ServiceDiscoveryResult {
  services: X402Service[];
  total: number;
  categories: string[];
}

// ─── Local Demo Services ────────────────────────────────────

export function getLocalServices(sellerAddress: string): X402Service[] {
  const baseUrl = "http://127.0.0.1";
  return [
    {
      name: "Weather API",
      url: `${baseUrl}:${DEMO_PORTS.weather}/weather`,
      description: "Real-time weather data for any city. Returns temperature, humidity, conditions, and wind data.",
      price: SERVICE_PRICING.weather.price,
      priceDisplay: SERVICE_PRICING.weather.display,
      method: "GET",
      category: "data",
      provider: "local",
      exampleParams: "?city=Nairobi",
    },
    {
      name: "Sentiment Analysis",
      url: `${baseUrl}:${DEMO_PORTS.sentiment}/sentiment`,
      description: "AI-powered text sentiment analysis. Returns sentiment score, label, and key phrases.",
      price: SERVICE_PRICING.sentiment.price,
      priceDisplay: SERVICE_PRICING.sentiment.display,
      method: "POST",
      category: "analytics",
      provider: "local",
      exampleBody: '{"text":"Your text to analyze"}',
    },
    {
      name: "Report Generator",
      url: `${baseUrl}:${DEMO_PORTS.report}/report`,
      description: "Generates structured reports from input data. Returns formatted analysis with insights.",
      price: SERVICE_PRICING.report.price,
      priceDisplay: SERVICE_PRICING.report.display,
      method: "POST",
      category: "analytics",
      provider: "local",
      exampleBody: '{"data":[],"format":"summary"}',
    },
  ];
}

// ─── External x402 Services ─────────────────────────────────

export function getExternalServices(): X402Service[] {
  return [
    {
      name: "CoinGecko Pro API",
      url: "https://pro-api.coingecko.com/api/v3/simple/price",
      description: "Premium crypto price data with 1-min granularity. Supports 10K+ tokens.",
      price: "5000",
      priceDisplay: "$0.005",
      method: "GET",
      category: "defi",
      provider: "external",
      exampleParams: "?ids=bitcoin,ethereum&vs_currencies=usd",
    },
    {
      name: "Bazaar Marketplace",
      url: "https://bazaar.computer/api/services",
      description: "x402 service marketplace. Browse and discover paid AI and data services.",
      price: "0",
      priceDisplay: "Free (browsing)",
      method: "GET",
      category: "infrastructure",
      provider: "external",
    },
    {
      name: "Cloudflare AI Gateway",
      url: "https://gateway.ai.cloudflare.com/v1",
      description: "AI inference endpoints with x402 billing. Access LLMs, image models, and embeddings.",
      price: "10000",
      priceDisplay: "$0.01",
      method: "POST",
      category: "ai",
      provider: "external",
    },
  ];
}

// ─── Discovery ──────────────────────────────────────────────

export function discoverServices(
  sellerAddress: string,
  category?: string,
): ServiceDiscoveryResult {
  const local = getLocalServices(sellerAddress);
  const external = getExternalServices();
  let all = [...local, ...external];

  if (category) {
    all = all.filter((s) => s.category === category);
  }

  const categories = [...new Set(all.map((s) => s.category))];

  return {
    services: all,
    total: all.length,
    categories,
  };
}

/** Format services for agent consumption */
export function formatServiceCatalog(result: ServiceDiscoveryResult): string {
  const lines: string[] = [
    `x402 Service Catalog (${result.total} services)`,
    `Categories: ${result.categories.join(", ")}`,
    "",
  ];

  for (const service of result.services) {
    lines.push(`${service.name} [${service.provider.toUpperCase()}]`);
    lines.push(`  URL: ${service.url}${service.exampleParams || ""}`);
    lines.push(`  Method: ${service.method}`);
    lines.push(`  Price: ${service.priceDisplay} USDC/call`);
    lines.push(`  Category: ${service.category}`);
    lines.push(`  Description: ${service.description}`);
    if (service.exampleBody) {
      lines.push(`  Example body: ${service.exampleBody}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
