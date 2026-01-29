/**
 * Philips Hue Integration
 *
 * Controls Philips Hue smart lights via the local bridge HTTP API.
 * Supports listing lights, setting light state, and activating scenes.
 *
 * @requires HUE_BRIDGE_IP - Local IP address of the Hue Bridge.
 * @requires HUE_USERNAME - Authorized username/API key for the bridge.
 * @see https://developers.meethue.com/develop/hue-api-v2/
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

export default class HueIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "hue",
    name: "Philips Hue",
    category: "smart-home",
    version: "1.0.0",
    description: "Control Philips Hue lights -- list, toggle, adjust brightness and color.",
    auth: {
      type: "token",
      envVars: ["HUE_BRIDGE_IP", "HUE_USERNAME"],
    },
    capabilities: { offline: true },
    tools: [
      {
        name: "hue_list_lights",
        description: "List all lights connected to the Hue Bridge.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "hue_set_light",
        description: "Set the state of a light (on/off, brightness, color).",
        parameters: {
          type: "object",
          properties: {
            lightId: { type: "string", description: "Light ID." },
            on: { type: "boolean", description: "Turn light on (true) or off (false)." },
            brightness: { type: "number", description: "Brightness 0-254." },
            color: { type: "string", description: "Hex color (e.g. #ff0000). Converted to Hue xy." },
          },
          required: ["lightId"],
        },
      },
      {
        name: "hue_set_scene",
        description: "Activate a Hue scene.",
        parameters: {
          type: "object",
          properties: {
            sceneId: { type: "string", description: "Scene ID." },
          },
          required: ["sceneId"],
        },
      },
    ],
  };

  private async getCreds() {
    const creds = await this.getCredentials<{ HUE_BRIDGE_IP: string; HUE_USERNAME: string }>();
    if (!creds?.HUE_BRIDGE_IP || !creds?.HUE_USERNAME) {
      throw new Error("Missing HUE_BRIDGE_IP or HUE_USERNAME");
    }
    return creds;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const creds = await this.getCreds();
    const url = `https://${creds.HUE_BRIDGE_IP}/api/${creds.HUE_USERNAME}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    return res.json();
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "hue_list_lights":
          return await this.listLights();
        case "hue_set_light":
          return await this.setLight(args.lightId as string, args.on as boolean | undefined, args.brightness as number | undefined, args.color as string | undefined);
        case "hue_set_scene":
          return await this.setScene(args.sceneId as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Hue error: ${(err as Error).message}`);
    }
  }

  private async listLights(): Promise<ToolResult> {
    const data = await this.request("/lights");
    const lights = Object.entries(data).map(([id, light]: [string, any]) => {
      const state = light.state.on ? "ON" : "OFF";
      return `[${id}] ${light.name} - ${state}, bri=${light.state.bri}`;
    });
    return this.ok(lights.join("\n") || "No lights found.", { count: lights.length });
  }

  private async setLight(lightId: string, on?: boolean, brightness?: number, color?: string): Promise<ToolResult> {
    const state: Record<string, unknown> = {};
    if (on !== undefined) state.on = on;
    if (brightness !== undefined) state.bri = Math.max(0, Math.min(254, brightness));
    if (color) {
      const xy = this.hexToXy(color);
      state.xy = xy;
    }

    const data = await this.request(`/lights/${lightId}/state`, {
      method: "PUT",
      body: JSON.stringify(state),
    });

    const errors = (data as any[]).filter((r) => r.error);
    if (errors.length) return this.error(errors.map((e) => e.error.description).join("; "));
    return this.ok(`Light ${lightId} updated.`);
  }

  private async setScene(sceneId: string): Promise<ToolResult> {
    const data = await this.request("/groups/0/action", {
      method: "PUT",
      body: JSON.stringify({ scene: sceneId }),
    });
    const errors = (data as any[]).filter((r) => r.error);
    if (errors.length) return this.error(errors.map((e) => e.error.description).join("; "));
    return this.ok(`Scene ${sceneId} activated.`);
  }

  /** Convert a hex color string to CIE xy coordinates for Hue. */
  private hexToXy(hex: string): [number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const rr = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    const gg = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    const bb = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    const X = rr * 0.664511 + gg * 0.154324 + bb * 0.162028;
    const Y = rr * 0.283881 + gg * 0.668433 + bb * 0.047685;
    const Z = rr * 0.000088 + gg * 0.072310 + bb * 0.986039;

    const sum = X + Y + Z;
    if (sum === 0) return [0.3127, 0.3290];
    return [X / sum, Y / sum];
  }
}
