/**
 * Email SMTP Integration
 *
 * Sends emails via SMTP using Node.js net/tls modules directly.
 * No external dependencies required -- implements a minimal SMTP client.
 *
 * @requires SMTP_HOST - SMTP server hostname (e.g. smtp.gmail.com).
 * @requires SMTP_PORT - SMTP server port (465 for SSL, 587 for STARTTLS).
 * @requires SMTP_USER - SMTP username / email address.
 * @requires SMTP_PASS - SMTP password or app-specific password.
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";
import * as tls from "node:tls";
import * as net from "node:net";

interface SmtpCreds {
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
}

export default class EmailSmtpIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "email-smtp",
    name: "Email (SMTP)",
    category: "social",
    version: "1.0.0",
    description: "Send emails via SMTP -- supports plain text and HTML bodies.",
    auth: {
      type: "api-key",
      envVars: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"],
    },
    tools: [
      {
        name: "email_send",
        description: "Send an email.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address." },
            subject: { type: "string", description: "Email subject line." },
            body: { type: "string", description: "Plain text body." },
            cc: { type: "string", description: "CC recipients (comma-separated)." },
            bcc: { type: "string", description: "BCC recipients (comma-separated)." },
            html: { type: "string", description: "HTML body (overrides plain text body if provided)." },
          },
          required: ["to", "subject", "body"],
        },
      },
    ],
  };

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "email_send":
          return await this.sendEmail(
            args.to as string,
            args.subject as string,
            args.body as string,
            args.cc as string | undefined,
            args.bcc as string | undefined,
            args.html as string | undefined
          );
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Email error: ${(err as Error).message}`);
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
    cc?: string,
    bcc?: string,
    html?: string
  ): Promise<ToolResult> {
    const creds = await this.getCredentials<SmtpCreds>();
    if (!creds?.SMTP_HOST || !creds?.SMTP_USER || !creds?.SMTP_PASS) {
      return this.error("Missing SMTP credentials");
    }

    const port = parseInt(creds.SMTP_PORT || "465", 10);
    const useDirectTls = port === 465;

    const allRecipients = [to];
    if (cc) allRecipients.push(...cc.split(",").map((e) => e.trim()));
    if (bcc) allRecipients.push(...bcc.split(",").map((e) => e.trim()));

    // Build MIME message
    const boundary = `----wispy-${Date.now()}`;
    const headers = [
      `From: ${creds.SMTP_USER}`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      html
        ? `Content-Type: multipart/alternative; boundary="${boundary}"`
        : `Content-Type: text/plain; charset=utf-8`,
      `Date: ${new Date().toUTCString()}`,
    ]
      .filter(Boolean)
      .join("\r\n");

    let messageBody: string;
    if (html) {
      messageBody = [
        `--${boundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        html,
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      messageBody = body;
    }

    const message = `${headers}\r\n\r\n${messageBody}`;

    await this.smtpSend(creds, allRecipients, message, useDirectTls);
    return this.ok(`Email sent to ${to}`, { to, subject, cc, bcc });
  }

  /**
   * Minimal SMTP client using Node.js net/tls.
   * Handles AUTH LOGIN over a TLS connection.
   */
  private smtpSend(
    creds: SmtpCreds,
    recipients: string[],
    message: string,
    useDirectTls: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = parseInt(creds.SMTP_PORT || "465", 10);
      let socket: net.Socket | tls.TLSSocket;

      const commands: string[] = [];
      let step = 0;

      const buildCommands = () => {
        commands.push(`EHLO wispy`);
        commands.push(`AUTH LOGIN`);
        commands.push(Buffer.from(creds.SMTP_USER).toString("base64"));
        commands.push(Buffer.from(creds.SMTP_PASS).toString("base64"));
        commands.push(`MAIL FROM:<${creds.SMTP_USER}>`);
        for (const r of recipients) {
          commands.push(`RCPT TO:<${r}>`);
        }
        commands.push(`DATA`);
      };

      buildCommands();

      const onData = (data: Buffer) => {
        const response = data.toString();
        const code = parseInt(response.slice(0, 3), 10);

        if (code >= 400) {
          socket.end();
          reject(new Error(`SMTP error: ${response.trim()}`));
          return;
        }

        if (step < commands.length) {
          socket.write(`${commands[step]}\r\n`);
          step++;
        } else if (step === commands.length) {
          // After DATA command, server responds with 354, send message
          socket.write(`${message}\r\n.\r\n`);
          step++;
        } else {
          socket.write(`QUIT\r\n`);
          socket.end();
          resolve();
        }
      };

      if (useDirectTls) {
        socket = tls.connect({ host: creds.SMTP_HOST, port, rejectUnauthorized: true }, () => {
          // Wait for greeting
        });
      } else {
        socket = net.connect({ host: creds.SMTP_HOST, port });
      }

      socket.on("data", onData);
      socket.on("error", reject);
      socket.setTimeout(15000, () => {
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      });
    });
  }
}
