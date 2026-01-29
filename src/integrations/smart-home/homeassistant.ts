/**
 * Home Assistant Integration
 *
 * Provides access to a Home Assistant instance -- list entities, get state,
 * and call services via the HA REST API.
 *
 * @requires HA_URL - Base URL of the Home Assistant instance (e.g. http://homeassistant.local:8123).
 * @requires HA_TOKEN - Long-lived access token.
 * @see https://developers.home-assistant.io/docs/api/rest
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

export default class HomeAssistantIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "homeassistant",
    name: "Home Assistant",
    category: "smart-home",
    version: "1.0.0",
    description: "Control smart home devices via Home Assistant -- list entities, get state, call services.",
    auth: {
      type: "token",
      envVars: ["HA_URL", "HA_TOKEN"],
    },
    capabilities: { offline: true },
    tools: [
      {
        name: "ha_list_entities",
        description: "List entities, optionally filtered by domain (e.g. light, switch, sensor).",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Entity domain filter (e.g. light, switch)." },
          },
        },
      },
      {
        name: "ha_get_state",
        description: "Get the current state of an entity.",
        parameters: {
          type: "object",
          properties: {
            entityId: { type: "string", description: "Entity ID (e.g. light.living_room)." },
          },
          required: ["entityId"],
        },
      },
      {
        name: "ha_call_service",
        description: "Call a Home Assistant service on an entity.",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Service domain (e.g. light, switch, media_player)." },
            service: { type: "string", description: "Service name (e.g. turn_on, turn_off, toggle)." },
            entityId: { type: "string", description: "Target entity ID." },
            data: { type: "object", description: "Additional service data (optional)." },
          },
          required: ["domain", "service", "entityId"],
        },
      },
    ],
  };

  private async getCreds() {
    const creds = await this.getCredentials<{ HA_URL: string; HA_TOKEN: string }>();
    if (!creds?.HA_URL || !creds?.HA_TOKEN) throw new Error("Missing HA_URL or HA_TOKEN");
    return creds;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const creds = await this.getCreds();
    const url = `${creds.HA_URL.replace(/\/$/, "")}/api${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${creds.HA_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) throw new Error(`Home Assistant ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "ha_list_entities":
          return await this.listEntities(args.domain as string | undefined);
        case "ha_get_state":
          return await this.getState(args.entityId as string);
        case "ha_call_service":
          return await this.callService(
            args.domain as string,
            args.service as string,
            args.entityId as string,
            args.data as Record<string, unknown> | undefined
          );
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Home Assistant error: ${(err as Error).message}`);
    }
  }

  private async listEntities(domain?: string): Promise<ToolResult> {
    const states: any[] = await this.request("/states");
    const filtered = domain
      ? states.filter((s) => s.entity_id.startsWith(`${domain}.`))
      : states;
    const summary = filtered
      .map((s) => `${s.entity_id}: ${s.state} (${s.attributes.friendly_name ?? ""})`)
      .join("\n");
    return this.ok(summary || "No entities found.", { count: filtered.length });
  }

  private async getState(entityId: string): Promise<ToolResult> {
    const data = await this.request(`/states/${entityId}`);
    const attrs = Object.entries(data.attributes)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return this.ok(`${entityId}: ${data.state}\n${attrs}`, {
      state: data.state,
      attributes: data.attributes,
    });
  }

  private async callService(domain: string, service: string, entityId: string, data?: Record<string, unknown>): Promise<ToolResult> {
    const body = { entity_id: entityId, ...data };
    await this.request(`/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return this.ok(`Called ${domain}.${service} on ${entityId}.`);
  }
}
