/**
 * Integration Wizard
 *
 * Wizard-guided setup for all integrations.
 * When a user tries to use an integration that's not configured,
 * the wizard walks them through the setup process.
 */

import chalk from "chalk";
import { createInterface } from "readline";
import { resolve } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";

// ==================== INTEGRATION CATALOG ====================

export interface IntegrationGuide {
  id: string;
  name: string;
  icon: string;
  category: "messaging" | "productivity" | "ai" | "web3" | "media" | "smart-home" | "browser";
  description: string;
  authType: "token" | "oauth2" | "qr" | "none" | "env";
  envVars?: string[];
  setupSteps: string[];
  links?: { name: string; url: string }[];
  testCommand?: string;
}

export const INTEGRATION_GUIDES: IntegrationGuide[] = [
  // === MESSAGING ===
  {
    id: "telegram",
    name: "Telegram",
    icon: "📱",
    category: "messaging",
    description: "Full bot integration with inline keyboards, voice notes, and rich media.",
    authType: "token",
    envVars: ["TELEGRAM_BOT_TOKEN"],
    setupSteps: [
      "Open Telegram and search for @BotFather",
      "Send /newbot and follow the prompts to create a bot",
      "Copy the bot token (looks like: 123456789:ABC-DEF...)",
      "Paste the token below",
    ],
    links: [{ name: "BotFather", url: "https://t.me/BotFather" }],
    testCommand: "Send a message to your bot on Telegram",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "💬",
    category: "messaging",
    description: "Send and receive messages, media, and automate conversations.",
    authType: "qr",
    setupSteps: [
      "Run 'wispy gateway' to start the server",
      "A QR code will appear in the terminal",
      "Open WhatsApp on your phone → Settings → Linked Devices",
      "Scan the QR code to link your account",
    ],
    testCommand: "Send 'hi' to your linked number from another phone",
  },
  {
    id: "discord",
    name: "Discord",
    icon: "🎮",
    category: "messaging",
    description: "Server bots, slash commands, and rich embeds.",
    authType: "token",
    envVars: ["DISCORD_BOT_TOKEN"],
    setupSteps: [
      "Go to discord.com/developers/applications",
      "Click 'New Application' and give it a name",
      "Go to Bot → Add Bot → Copy the token",
      "Go to OAuth2 → URL Generator → Select 'bot' scope",
      "Copy the URL and use it to invite the bot to your server",
      "Paste your bot token below",
    ],
    links: [{ name: "Discord Developer Portal", url: "https://discord.com/developers/applications" }],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "💼",
    category: "messaging",
    description: "Workspace apps, workflows, and channel automation.",
    authType: "token",
    envVars: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
    setupSteps: [
      "Go to api.slack.com/apps and create a new app",
      "Choose 'From scratch' and select your workspace",
      "Go to OAuth & Permissions → Add scopes: chat:write, channels:read",
      "Install the app to your workspace",
      "Copy the Bot User OAuth Token",
      "Copy the Signing Secret from Basic Information",
    ],
    links: [{ name: "Slack API", url: "https://api.slack.com/apps" }],
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "📧",
    category: "messaging",
    description: "Read, compose, and manage emails automatically.",
    authType: "oauth2",
    setupSteps: [
      "Go to console.cloud.google.com",
      "Create a new project or select existing",
      "Enable the Gmail API",
      "Create OAuth 2.0 credentials (Desktop app)",
      "Download the credentials JSON file",
      "Place it in ~/.wispy/credentials/google-oauth.json",
      "Run 'wispy setup gmail' to complete OAuth flow",
    ],
    links: [{ name: "Google Cloud Console", url: "https://console.cloud.google.com" }],
  },

  // === PRODUCTIVITY ===
  {
    id: "notion",
    name: "Notion",
    icon: "📝",
    category: "productivity",
    description: "Create pages, update databases, and query content.",
    authType: "token",
    envVars: ["NOTION_TOKEN"],
    setupSteps: [
      "Go to notion.so/my-integrations",
      "Click 'New integration'",
      "Name it 'Wispy' and select your workspace",
      "Copy the Internal Integration Token",
      "Share the pages you want Wispy to access with the integration",
    ],
    links: [{ name: "Notion Integrations", url: "https://www.notion.so/my-integrations" }],
  },
  {
    id: "github",
    name: "GitHub",
    icon: "🐙",
    category: "productivity",
    description: "Repositories, issues, PRs, and GitHub Actions.",
    authType: "token",
    envVars: ["GITHUB_TOKEN"],
    setupSteps: [
      "Go to github.com/settings/tokens",
      "Click 'Generate new token (classic)'",
      "Select scopes: repo, workflow, read:org",
      "Copy the generated token",
    ],
    links: [{ name: "GitHub Tokens", url: "https://github.com/settings/tokens" }],
  },
  {
    id: "linear",
    name: "Linear",
    icon: "📊",
    category: "productivity",
    description: "Create issues, manage projects, and track progress.",
    authType: "token",
    envVars: ["LINEAR_API_KEY"],
    setupSteps: [
      "Go to linear.app → Settings → API",
      "Click 'Create key' under Personal API keys",
      "Name it 'Wispy' and copy the key",
    ],
    links: [{ name: "Linear Settings", url: "https://linear.app/settings/api" }],
  },
  {
    id: "calendar",
    name: "Google Calendar",
    icon: "📅",
    category: "productivity",
    description: "Schedule events, check availability, and manage calendars.",
    authType: "oauth2",
    setupSteps: [
      "Requires Google OAuth setup (same as Gmail)",
      "Enable the Google Calendar API in Cloud Console",
      "Run 'wispy setup calendar' after OAuth is configured",
    ],
    links: [{ name: "Google Cloud Console", url: "https://console.cloud.google.com" }],
  },
  {
    id: "drive",
    name: "Google Drive",
    icon: "📁",
    category: "productivity",
    description: "Upload, download, and organize files in the cloud.",
    authType: "oauth2",
    setupSteps: [
      "Requires Google OAuth setup",
      "Enable the Google Drive API in Cloud Console",
      "Run 'wispy setup drive' after OAuth is configured",
    ],
  },
  {
    id: "sheets",
    name: "Google Sheets",
    icon: "📊",
    category: "productivity",
    description: "Read and write spreadsheet data programmatically.",
    authType: "oauth2",
    setupSteps: [
      "Requires Google OAuth setup",
      "Enable the Google Sheets API in Cloud Console",
      "Run 'wispy setup sheets' after OAuth is configured",
    ],
  },
  {
    id: "obsidian",
    name: "Obsidian",
    icon: "🗃️",
    category: "productivity",
    description: "Manage notes, create links, and build knowledge graphs.",
    authType: "env",
    envVars: ["OBSIDIAN_VAULT_PATH"],
    setupSteps: [
      "Set OBSIDIAN_VAULT_PATH to your vault directory",
      "Example: OBSIDIAN_VAULT_PATH=/Users/you/Documents/MyVault",
    ],
  },

  // === AI & DEVELOPMENT ===
  {
    id: "gemini",
    name: "Gemini",
    icon: "✨",
    category: "ai",
    description: "Google's most capable AI model for multimodal tasks. Primary AI backend.",
    authType: "env",
    envVars: ["GEMINI_API_KEY"],
    setupSteps: [
      "Go to aistudio.google.com/apikey",
      "Click 'Create API key'",
      "Copy the key and paste below",
      "Or use Vertex AI: set GOOGLE_CLOUD_PROJECT",
    ],
    links: [{ name: "Google AI Studio", url: "https://aistudio.google.com/apikey" }],
  },
  {
    id: "a2a",
    name: "A2A Protocol",
    icon: "🤖",
    category: "ai",
    description: "Agent-to-agent communication and task delegation.",
    authType: "none",
    setupSteps: [
      "A2A is built-in and works automatically",
      "Your agent card is served at /.well-known/agent.json",
      "Other agents can discover and communicate with you",
    ],
  },
  {
    id: "mcp",
    name: "MCP Servers",
    icon: "🔌",
    category: "ai",
    description: "Model Context Protocol for tool integration.",
    authType: "none",
    setupSteps: [
      "MCP is built-in. Add servers with:",
      "wispy mcp add <id> <command> [args...]",
      "Example: wispy mcp add filesystem npx -y @anthropic/mcp-server-filesystem",
    ],
  },

  // === WEB3 ===
  {
    id: "ethereum",
    name: "Ethereum / Base",
    icon: "⛓️",
    category: "web3",
    description: "Smart contracts, transactions, and wallet interactions.",
    authType: "none",
    setupSteps: [
      "Wallet is auto-generated on first run",
      "Run 'wispy wallet status' to see your address",
      "Fund with testnet ETH/USDC for transactions",
    ],
  },
  {
    id: "x402",
    name: "x402 Payments",
    icon: "💳",
    category: "web3",
    description: "Automatic USDC payments for AI services.",
    authType: "env",
    envVars: ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET"],
    setupSteps: [
      "x402 uses your auto-generated wallet",
      "For Coinbase integration, set CDP credentials",
      "Get keys from portal.cdp.coinbase.com",
    ],
    links: [{ name: "Coinbase Developer Portal", url: "https://portal.cdp.coinbase.com" }],
  },

  // === MEDIA ===
  {
    id: "spotify",
    name: "Spotify",
    icon: "🎵",
    category: "media",
    description: "Control playback, manage playlists, and discover music.",
    authType: "oauth2",
    envVars: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    setupSteps: [
      "Go to developer.spotify.com/dashboard",
      "Create a new app",
      "Set redirect URI to http://localhost:8888/callback",
      "Copy Client ID and Client Secret",
    ],
    links: [{ name: "Spotify Developer", url: "https://developer.spotify.com/dashboard" }],
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    icon: "𝕏",
    category: "media",
    description: "Post tweets, threads, and manage your timeline.",
    authType: "token",
    envVars: ["TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_SECRET"],
    setupSteps: [
      "Go to developer.twitter.com/en/portal/dashboard",
      "Create a project and app",
      "Generate API keys and access tokens",
      "Make sure you have 'Read and Write' permissions",
    ],
    links: [{ name: "Twitter Developer Portal", url: "https://developer.twitter.com/en/portal/dashboard" }],
  },

  // === SMART HOME ===
  {
    id: "hue",
    name: "Philips Hue",
    icon: "💡",
    category: "smart-home",
    description: "Control lights, scenes, and room ambiance.",
    authType: "token",
    envVars: ["HUE_BRIDGE_IP", "HUE_USERNAME"],
    setupSteps: [
      "Find your bridge IP at discovery.meethue.com",
      "Press the link button on your Hue Bridge",
      "Run 'wispy setup hue' within 30 seconds",
      "A username will be generated automatically",
    ],
    links: [{ name: "Hue Bridge Discovery", url: "https://discovery.meethue.com" }],
  },

  // === BROWSER ===
  {
    id: "browser",
    name: "Browser Automation",
    icon: "🌐",
    category: "browser",
    description: "Playwright-powered browsing. Navigate, click, type, screenshot.",
    authType: "none",
    setupSteps: [
      "Browser automation is built-in",
      "Playwright will download browsers on first use",
      "No configuration required",
    ],
  },
];

// ==================== WIZARD CLASS ====================

export class IntegrationWizard {
  private runtimeDir: string;
  private rl: ReturnType<typeof createInterface> | null = null;

  constructor(runtimeDir: string) {
    this.runtimeDir = runtimeDir;
  }

  /**
   * Get integration guide by ID
   */
  getGuide(integrationId: string): IntegrationGuide | undefined {
    return INTEGRATION_GUIDES.find(g => g.id === integrationId);
  }

  /**
   * Run setup wizard for an integration
   */
  async setup(integrationId: string): Promise<boolean> {
    const guide = this.getGuide(integrationId);
    if (!guide) {
      console.log(chalk.red(`\n  ✗ Unknown integration: ${integrationId}`));
      console.log(chalk.dim(`  Available: ${INTEGRATION_GUIDES.map(g => g.id).join(", ")}\n`));
      return false;
    }

    console.log(chalk.cyan.bold(`\n  ${guide.icon} ${guide.name} Setup\n`));
    console.log(chalk.dim(`  ${guide.description}\n`));

    // Show setup steps
    console.log(chalk.white("  Steps:"));
    guide.setupSteps.forEach((step, i) => {
      console.log(chalk.dim(`  ${i + 1}. ${step}`));
    });
    console.log();

    // Show links
    if (guide.links) {
      console.log(chalk.blue("  Links:"));
      for (const link of guide.links) {
        console.log(chalk.cyan(`    ${link.name}: ${link.url}`));
      }
      console.log();
    }

    // Handle based on auth type
    if (guide.authType === "none") {
      console.log(chalk.green(`  ✓ ${guide.name} is ready to use (no configuration needed)\n`));
      return true;
    }

    if (guide.authType === "qr") {
      console.log(chalk.yellow(`  ℹ ${guide.name} requires QR code scanning.`));
      console.log(chalk.dim(`  Run 'wispy gateway' and scan the QR code.\n`));
      return true;
    }

    if (guide.authType === "oauth2") {
      console.log(chalk.yellow(`  ℹ ${guide.name} requires OAuth2 authentication.`));
      console.log(chalk.dim(`  Complete the OAuth setup steps above first.\n`));
      return true;
    }

    // Token-based setup - prompt for values
    if (guide.envVars && guide.envVars.length > 0) {
      const values = await this.promptForEnvVars(guide.envVars);
      if (values) {
        this.saveCredentials(integrationId, values);
        console.log(chalk.green(`\n  ✓ ${guide.name} configured successfully!\n`));

        if (guide.testCommand) {
          console.log(chalk.dim(`  Test: ${guide.testCommand}\n`));
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Prompt user for environment variable values
   */
  private async promptForEnvVars(envVars: string[]): Promise<Record<string, string> | null> {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const values: Record<string, string> = {};

    try {
      for (const envVar of envVars) {
        const current = process.env[envVar];
        const prompt = current
          ? `  ${envVar} [${chalk.dim(current.slice(0, 10) + "...")}]: `
          : `  ${envVar}: `;

        const value = await this.question(prompt);
        if (value.trim()) {
          values[envVar] = value.trim();
        } else if (current) {
          values[envVar] = current;
        } else {
          console.log(chalk.yellow(`\n  ○ Skipped ${envVar}\n`));
          return null;
        }
      }

      return values;
    } finally {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Promisified question
   */
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl!.question(prompt, resolve);
    });
  }

  /**
   * Save credentials to .env file and runtime config
   */
  private saveCredentials(integrationId: string, values: Record<string, string>): void {
    // Save to .env file
    const envPath = resolve(process.cwd(), ".env");
    let envContent = "";

    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }

    for (const [key, value] of Object.entries(values)) {
      // Update or append
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }

      // Also set in current process
      process.env[key] = value;
    }

    writeFileSync(envPath, envContent.trim() + "\n");

    // Save to credentials store
    const credPath = resolve(this.runtimeDir, "credentials", `${integrationId}.json`);
    const credDir = resolve(this.runtimeDir, "credentials");

    if (!existsSync(credDir)) {
      mkdirSync(credDir, { recursive: true });
    }

    writeFileSync(credPath, JSON.stringify({
      integrationId,
      configuredAt: new Date().toISOString(),
      envVars: Object.keys(values),
    }, null, 2));
  }

  /**
   * Check if integration is configured
   */
  isConfigured(integrationId: string): boolean {
    const guide = this.getGuide(integrationId);
    if (!guide) return false;

    if (guide.authType === "none") return true;
    if (!guide.envVars) return true;

    return guide.envVars.every(env => !!process.env[env]);
  }

  /**
   * Display all integrations
   */
  displayCatalog(): void {
    console.log(chalk.cyan.bold(`\n  Integrations`));
    console.log(chalk.dim(`  ${INTEGRATION_GUIDES.length} integrations to connect Wispy with your favorite tools.\n`));

    const categories = new Map<string, IntegrationGuide[]>();
    for (const guide of INTEGRATION_GUIDES) {
      const list = categories.get(guide.category) || [];
      list.push(guide);
      categories.set(guide.category, list);
    }

    for (const [category, guides] of categories) {
      console.log(chalk.white.bold(`  ${category.toUpperCase()}`));
      for (const guide of guides) {
        const configured = this.isConfigured(guide.id);
        const status = configured ? chalk.green("✓") : chalk.dim("○");
        console.log(`    ${status} ${guide.icon} ${chalk.cyan(guide.name.padEnd(20))} ${chalk.dim(guide.description.slice(0, 45))}...`);
      }
      console.log();
    }

    console.log(chalk.dim("  Commands:"));
    console.log(chalk.green("    wispy setup <integration>") + chalk.dim("  Run setup wizard"));
    console.log(chalk.green("    wispy integrations list") + chalk.dim("   Show all integrations"));
    console.log(chalk.green("    wispy integrations enable") + chalk.dim("  Enable an integration"));
    console.log();
  }

  /**
   * Get runtime prompt for missing integration
   * Called when user tries to use an unconfigured integration
   */
  getMissingPrompt(integrationId: string): string {
    const guide = this.getGuide(integrationId);
    if (!guide) return `Unknown integration: ${integrationId}`;

    let prompt = `\n${guide.icon} ${guide.name} Setup Required\n\n`;
    prompt += `${guide.description}\n\n`;

    guide.setupSteps.forEach((step, i) => {
      prompt += `${i + 1}. ${step}\n`;
    });

    if (guide.links) {
      prompt += `\nLinks:\n`;
      for (const link of guide.links) {
        prompt += `  ${link.name}: ${link.url}\n`;
      }
    }

    if (guide.envVars) {
      prompt += `\nRequired environment variables:\n`;
      for (const env of guide.envVars) {
        prompt += `  • ${env}\n`;
      }
    }

    prompt += `\nRun: wispy setup ${integrationId}\n`;

    return prompt;
  }
}

// ==================== CLI DISPLAY HELPERS ====================

export function displayIntegrationCatalog(runtimeDir: string): void {
  const wizard = new IntegrationWizard(runtimeDir);
  wizard.displayCatalog();
}
