#!/usr/bin/env node
/**
 * Post-install script — shows welcome message and guidance after install.
 */

const isGlobal = process.env.npm_config_global === "true" ||
  process.argv.includes("--global") ||
  (process.env._ && process.env._.includes("npx"));

// Colors (using ANSI escape codes for minimal dependencies)
const sky = (s: string) => `\x1b[38;2;49;204;255m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const LOGO = `
  ${sky("██╗    ██╗ ██╗ ███████╗ ██████╗  ██╗   ██╗")}
  ${sky("██║    ██║ ██║ ██╔════╝ ██╔══██╗ ╚██╗ ██╔╝")}
  ${sky("██║ █╗ ██║ ██║ ███████╗ ██████╔╝  ╚████╔╝ ")}
  ${sky("██║███╗██║ ██║ ╚════██║ ██╔═══╝    ╚██╔╝  ")}
  ${sky("╚███╔███╔╝ ██║ ███████║ ██║         ██║   ")}
  ${sky(" ╚══╝╚══╝  ╚═╝ ╚══════╝ ╚═╝         ╚═╝   ")}
`;

if (isGlobal || !process.env.npm_config_global) {
  console.log(LOGO);
  console.log(bold("  ✓ Wispy installed successfully!\n"));

  console.log(dim("  The autonomous AI agent that thinks for days,"));
  console.log(dim("  pays for services, and proves its identity on-chain.\n"));

  console.log(bold("  Quick Start:\n"));
  console.log(`  ${green("1.")} Run the setup wizard:`);
  console.log(`     ${sky("wispy setup")}\n`);

  console.log(`  ${green("2.")} Start chatting:`);
  console.log(`     ${sky("wispy chat")}\n`);

  console.log(`  ${green("3.")} Start an autonomous task:`);
  console.log(`     ${sky('/marathon "Research AI trends in 2026"')}\n`);

  console.log(bold("  What Wispy Can Do:\n"));
  console.log(`  ${sky("•")} ${bold("Marathon Mode")}  - Multi-day autonomous task execution`);
  console.log(`  ${sky("•")} ${bold("x402 Payments")}  - Agent automatically pays for premium APIs`);
  console.log(`  ${sky("•")} ${bold("ERC-8004")}       - On-chain verifiable agent identity`);
  console.log(`  ${sky("•")} ${bold("A2A Protocol")}   - Agents discover and talk to other agents`);
  console.log(`  ${sky("•")} ${bold("Telegram")}       - Control your agent from your phone\n`);

  console.log(bold("  All Commands:\n"));
  console.log(`  ${dim("wispy setup")}       Configure your agent (API keys, channels)`);
  console.log(`  ${dim("wispy chat")}        Interactive terminal chat`);
  console.log(`  ${dim("wispy gateway")}     Start full server (Telegram, A2A, REST)`);
  console.log(`  ${dim("wispy doctor")}      Check your configuration`);
  console.log(`  ${dim("wispy --help")}      See all available commands\n`);

  console.log(dim("  ─────────────────────────────────────────────────────"));
  console.log(`  ${dim("Get Gemini API Key:")} ${sky("https://aistudio.google.com/apikey")}`);
  console.log(`  ${dim("Documentation:")}      ${sky("https://github.com/brn-mwai/wispy")}`);
  console.log(`  ${dim("Need help?")}          ${sky("https://github.com/brn-mwai/wispy/issues")}`);
  console.log(dim("  ─────────────────────────────────────────────────────\n"));
}
