/**
 * OpenWeatherMap Integration
 *
 * Provides current weather and multi-day forecasts via the OpenWeatherMap API.
 *
 * @requires OPENWEATHER_API_KEY - API key from https://openweathermap.org/api
 * @see https://openweathermap.org/api
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://api.openweathermap.org/data/2.5";

export default class WeatherIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "weather",
    name: "OpenWeatherMap",
    category: "tools",
    version: "1.0.0",
    description: "Get current weather and forecasts for any city.",
    auth: {
      type: "api-key",
      envVars: ["OPENWEATHER_API_KEY"],
    },
    tools: [
      {
        name: "weather_current",
        description: "Get the current weather for a city.",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name (e.g. London, Nairobi)." },
          },
          required: ["city"],
        },
      },
      {
        name: "weather_forecast",
        description: "Get a multi-day weather forecast for a city.",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name." },
            days: { type: "number", description: "Number of days (1-5).", default: 3 },
          },
          required: ["city"],
        },
      },
    ],
  };

  private async getKey(): Promise<string> {
    const creds = await this.getCredentials<{ OPENWEATHER_API_KEY: string }>();
    if (!creds?.OPENWEATHER_API_KEY) throw new Error("Missing OPENWEATHER_API_KEY");
    return creds.OPENWEATHER_API_KEY;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "weather_current":
          return await this.current(args.city as string);
        case "weather_forecast":
          return await this.forecast(args.city as string, (args.days as number) ?? 3);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Weather error: ${(err as Error).message}`);
    }
  }

  private async current(city: string): Promise<ToolResult> {
    const key = await this.getKey();
    const res = await fetch(
      `${API_BASE}/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`
    );
    if (!res.ok) return this.error(`Weather API ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;

    const desc = data.weather?.[0]?.description ?? "unknown";
    const temp = data.main.temp;
    const feelsLike = data.main.feels_like;
    const humidity = data.main.humidity;
    const wind = data.wind.speed;

    const summary = [
      `${data.name}, ${data.sys.country}: ${desc}`,
      `Temp: ${temp}C (feels like ${feelsLike}C)`,
      `Humidity: ${humidity}% | Wind: ${wind} m/s`,
    ].join("\n");

    return this.ok(summary, { temp, feelsLike, humidity, wind, description: desc });
  }

  private async forecast(city: string, days: number): Promise<ToolResult> {
    const key = await this.getKey();
    const cnt = Math.min(Math.max(days, 1), 5) * 8; // 3-hour intervals
    const res = await fetch(
      `${API_BASE}/forecast?q=${encodeURIComponent(city)}&appid=${key}&units=metric&cnt=${cnt}`
    );
    if (!res.ok) return this.error(`Forecast API ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;

    // Group by day
    const byDay = new Map<string, any[]>();
    for (const entry of data.list) {
      const date = entry.dt_txt.split(" ")[0];
      if (!byDay.has(date)) byDay.set(date, []);
      byDay.get(date)!.push(entry);
    }

    const lines: string[] = [];
    for (const [date, entries] of byDay) {
      const temps = entries.map((e: any) => e.main.temp);
      const min = Math.min(...temps).toFixed(1);
      const max = Math.max(...temps).toFixed(1);
      const desc = entries[Math.floor(entries.length / 2)].weather[0].description;
      lines.push(`${date}: ${min}-${max}C, ${desc}`);
    }

    return this.ok(`${data.city.name} forecast:\n${lines.join("\n")}`, { days: byDay.size });
  }
}
