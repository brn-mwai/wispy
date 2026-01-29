/**
 * WhatsApp Cloud API Integration
 *
 * Sends messages and templates via the Meta WhatsApp Business Cloud API.
 *
 * @requires WHATSAPP_TOKEN - Permanent or temporary access token from Meta.
 * @requires WHATSAPP_PHONE_ID - The phone number ID registered in your Meta app.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";

const API_BASE = "https://graph.facebook.com/v18.0";

export default class WhatsAppIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "whatsapp",
    name: "WhatsApp",
    category: "chat",
    version: "1.0.0",
    description: "Send messages and templates via the WhatsApp Cloud API.",
    auth: {
      type: "token",
      envVars: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID"],
    },
    tools: [
      {
        name: "whatsapp_send_message",
        description: "Send a text message to a WhatsApp number.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient phone number in E.164 format (e.g. +1234567890)." },
            text: { type: "string", description: "Message text to send." },
          },
          required: ["to", "text"],
        },
      },
      {
        name: "whatsapp_send_template",
        description: "Send an approved message template.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient phone number in E.164 format." },
            templateName: { type: "string", description: "The template name as registered in Meta Business." },
          },
          required: ["to", "templateName"],
        },
      },
    ],
  };

  private async getCreds() {
    const creds = await this.getCredentials<{ WHATSAPP_TOKEN: string; WHATSAPP_PHONE_ID: string }>();
    if (!creds?.WHATSAPP_TOKEN || !creds?.WHATSAPP_PHONE_ID) {
      throw new Error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID");
    }
    return creds;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "whatsapp_send_message":
          return await this.sendMessage(args.to as string, args.text as string);
        case "whatsapp_send_template":
          return await this.sendTemplate(args.to as string, args.templateName as string);
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`WhatsApp error: ${(err as Error).message}`);
    }
  }

  private async sendMessage(to: string, text: string): Promise<ToolResult> {
    const creds = await this.getCreds();
    const res = await fetch(`${API_BASE}/${creds.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) return this.error(`Send failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const messageId = data.messages?.[0]?.id ?? "unknown";
    return this.ok(`Message sent to ${to} (id: ${messageId})`, { messageId });
  }

  private async sendTemplate(to: string, templateName: string): Promise<ToolResult> {
    const creds = await this.getCreds();
    const res = await fetch(`${API_BASE}/${creds.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: templateName, language: { code: "en_US" } },
      }),
    });

    if (!res.ok) return this.error(`Template send failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const messageId = data.messages?.[0]?.id ?? "unknown";
    return this.ok(`Template "${templateName}" sent to ${to} (id: ${messageId})`, { messageId });
  }
}
