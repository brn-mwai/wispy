import { t } from "./ui/theme.js";
import type { Agent } from "../core/agent.js";
import type { TokenManager } from "../token/estimator.js";

export interface CommandContext {
  agent: Agent;
  runtimeDir: string;
  soulDir: string;
  currentSession: string;
  setSession: (key: string) => void;
  tokenManager: TokenManager;
}

interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string, ctx: CommandContext) => Promise<void>;
}

const commands: SlashCommand[] = [
  {
    name: "help",
    description: "Show available commands",
    handler: async () => {
      const chalk = (await import("chalk")).default;

      // Group commands by category
      const categories: Record<string, string[]> = {
        "Core": ["help", "clear", "status", "quick", "exit"],
        "Session": ["session", "history", "resume", "reset", "rename", "compact", "sessions"],
        "AI & Models": ["model", "provider", "thinking", "vertex", "plan", "execute"],
        "Memory": ["memory", "memstatus"],
        "Tools & Skills": ["tools", "skills", "skill"],
        "Channels": ["channels", "connect"],
        "Marathon": ["marathon"],
        "System": ["config", "security", "logs", "tokens", "cost", "context", "stats", "doctor", "onboard"],
        "Utilities": ["export", "copy", "theme", "verbose", "checkpoints", "rewind"],
        "Advanced": ["wallet", "x402scan", "peers", "cron", "agents", "plugins", "integrations", "browser", "voice"],
      };

      console.log(chalk.bold.cyan("\n  Wispy Commands\n"));

      for (const [category, cmdNames] of Object.entries(categories)) {
        const categoryCommands = commands.filter(c => cmdNames.includes(c.name));
        if (categoryCommands.length === 0) continue;

        console.log(chalk.bold(`  ${category}`));
        for (const cmd of categoryCommands) {
          console.log(`    ${chalk.cyan("/" + cmd.name.padEnd(14))} ${chalk.dim(cmd.description)}`);
        }
        console.log();
      }

      console.log(chalk.dim("  Type / to see all commands, or /command for details.\n"));
    },
  },
  {
    name: "quick",
    description: "Quick actions [build|run|test|deploy]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const [action, ...rest] = args.trim().split(" ");
      const target = rest.join(" ");

      if (!action) {
        console.log(chalk.bold.cyan("\n  Quick Actions\n"));
        console.log("  Usage: /quick <action> [target]\n");
        console.log(chalk.dim("  Actions:"));
        console.log(`    ${chalk.cyan("build")}   Create a new project`);
        console.log(`           /quick build landing page`);
        console.log(`           /quick build react dashboard`);
        console.log(`           /quick build express api`);
        console.log();
        console.log(`    ${chalk.cyan("run")}     Run a command or script`);
        console.log(`           /quick run npm install`);
        console.log(`           /quick run dev server`);
        console.log();
        console.log(`    ${chalk.cyan("test")}    Run tests`);
        console.log(`           /quick test`);
        console.log(`           /quick test auth module`);
        console.log();
        console.log(`    ${chalk.cyan("deploy")} Deploy to production`);
        console.log(`           /quick deploy vercel`);
        console.log(`           /quick deploy netlify`);
        console.log();
        console.log(`    ${chalk.cyan("fix")}     Fix issues`);
        console.log(`           /quick fix lint errors`);
        console.log(`           /quick fix build errors`);
        console.log();
        return;
      }

      // Convert quick action to natural language and send to agent
      const prompts: Record<string, string> = {
        "build": `Create a ${target || "web application"}. Use modern frameworks and best practices.`,
        "run": `Run: ${target || "npm start"}`,
        "test": `Run tests${target ? ` for ${target}` : ""}. Show results.`,
        "deploy": `Deploy to ${target || "production"}. Guide me through the process.`,
        "fix": `Fix ${target || "all errors"}. Analyze and resolve issues.`,
        "explain": `Explain ${target || "this code"}. Be concise and clear.`,
        "refactor": `Refactor ${target || "the code"}. Improve structure and readability.`,
        "debug": `Debug ${target || "the issue"}. Find and fix the root cause.`,
      };

      const prompt = prompts[action.toLowerCase()];
      if (!prompt) {
        console.log(chalk.red(`\n  Unknown action: ${action}`));
        console.log(chalk.dim("  Use /quick to see available actions.\n"));
        return;
      }

      console.log(chalk.dim(`\n  → ${prompt}\n`));

      // Send to agent
      try {
        const { loadConfig } = await import("../config/config.js");
        const config = loadConfig(ctx.runtimeDir);

        for await (const chunk of ctx.agent.chatStream(prompt, "cli-user", "cli")) {
          if (chunk.type === "text") {
            process.stdout.write(chunk.content);
          }
        }
        console.log("\n");
      } catch (err) {
        console.log(chalk.red(`\n  Error: ${err instanceof Error ? err.message : err}\n`));
      }
    },
  },
  {
    name: "clear",
    description: "Clear the screen",
    handler: async () => {
      console.clear();
    },
  },
  {
    name: "status",
    description: "Comprehensive system status (MoltBot-style)",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { existsSync, readdirSync, statSync } = await import("fs");
      const { resolve } = await import("path");
      const { loadConfig } = await import("../config/config.js");
      const { loadRegistry } = await import("../core/session.js");
      const { loadSkills } = await import("../skills/loader.js");
      const { getWalletAddress } = await import("../wallet/x402.js");
      const os = await import("os");

      const config = loadConfig(ctx.runtimeDir);
      const reg = loadRegistry(ctx.runtimeDir, config.agent.id);
      const skills = loadSkills(ctx.soulDir);
      const walletAddr = getWalletAddress(ctx.runtimeDir);
      const dbExists = existsSync(resolve(ctx.runtimeDir, "memory", "embeddings.db"));
      const stats = ctx.tokenManager.getStats();

      const showAll = args.includes("--all") || args.includes("-a");

      // System Info
      console.log(chalk.bold.cyan("\n┌─────────────────────────────────────────────────────────────┐"));
      console.log(chalk.bold.cyan("│") + chalk.bold("                     WISPY STATUS                            ") + chalk.bold.cyan("│"));
      console.log(chalk.bold.cyan("└─────────────────────────────────────────────────────────────┘\n"));

      // OS & Environment Table
      console.log(chalk.bold("  System"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────"));
      console.log(`  OS:       ${os.type()} ${os.release()} (${os.arch()})`);
      console.log(`  Node:     ${process.version}`);
      console.log(`  Platform: ${process.platform}`);
      console.log(`  Uptime:   ${Math.floor(process.uptime() / 60)} minutes`);
      console.log(`  Memory:   ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`);
      console.log();

      // Agent Table
      console.log(chalk.bold("  Agent"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────"));
      console.log(`  Name:     ${chalk.cyan(config.agent.name)}`);
      console.log(`  ID:       ${config.agent.id}`);
      console.log(`  Mode:     ${ctx.agent.getMode() === "plan" ? chalk.yellow("PLAN") : chalk.green("EXECUTE")}`);
      console.log(`  Model:    ${chalk.magenta(config.gemini.models.pro)}`);

      // Show Vertex AI or API key mode
      const vertexEnabled = config.gemini.vertexai?.enabled;
      if (vertexEnabled) {
        const project = config.gemini.vertexai?.project || "default";
        const location = config.gemini.vertexai?.location || "us-central1";
        console.log(`  Backend:  ${chalk.green("Vertex AI")} (${project}, ${location})`);
      } else {
        console.log(`  Backend:  ${chalk.blue("Gemini API")} (API key)`);
      }
      console.log(`  Provider: ${chalk.blue(config.activeProvider || "gemini")}`);
      console.log();

      // Sessions Table
      const sessions = Object.entries(reg.sessions);
      const activeSessions = sessions.filter(([, s]) => {
        const lastActive = new Date(s.lastActiveAt || s.lastActive || s.createdAt);
        return Date.now() - lastActive.getTime() < 3600000; // active in last hour
      });
      console.log(chalk.bold("  Sessions"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────"));
      console.log(`  Current:  ${chalk.cyan(ctx.currentSession)}`);
      console.log(`  Total:    ${sessions.length}`);
      console.log(`  Active:   ${activeSessions.length} (last hour)`);
      console.log(`  Messages: ${sessions.reduce((sum, [, s]) => sum + (s.messageCount || 0), 0)}`);
      console.log();

      // Channels Table
      console.log(chalk.bold("  Channels"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────"));
      const channels = [
        { name: "Telegram", enabled: config.channels.telegram?.enabled },
        { name: "WhatsApp", enabled: config.channels.whatsapp?.enabled },
        { name: "Discord", enabled: config.channels.discord?.enabled },
        { name: "Slack", enabled: config.channels.slack?.enabled },
        { name: "Signal", enabled: config.channels.signal?.enabled },
        { name: "Matrix", enabled: config.channels.matrix?.enabled },
        { name: "Web", enabled: config.channels.web?.enabled },
        { name: "REST API", enabled: config.channels.rest?.enabled },
      ];
      const enabledChannels = channels.filter(c => c.enabled);
      const disabledChannels = channels.filter(c => !c.enabled);
      console.log(`  Enabled:  ${enabledChannels.length > 0 ? enabledChannels.map(c => chalk.green(c.name)).join(", ") : chalk.dim("none")}`);
      console.log(`  Available: ${disabledChannels.map(c => chalk.dim(c.name)).join(", ")}`);
      console.log();

      // Resources Table
      console.log(chalk.bold("  Resources"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────"));
      console.log(`  Skills:   ${skills.length > 0 ? skills.map(s => chalk.cyan(s.name)).join(", ") : chalk.dim("none")}`);
      console.log(`  Memory:   ${dbExists ? chalk.green("active") : chalk.yellow("not initialized")}`);
      console.log(`  Wallet:   ${walletAddr ? chalk.green(walletAddr.slice(0, 10) + "...") : chalk.dim("not initialized")}`);

      // MCP & Integrations
      const mcpRegistry = ctx.agent.getMcpRegistry();
      const intRegistry = ctx.agent.getIntegrationRegistry();
      const mcpToolCount = mcpRegistry?.getAllTools().length || 0;
      const intCount = intRegistry?.size || 0;
      console.log(`  MCP:      ${mcpToolCount > 0 ? chalk.green(`${mcpToolCount} tools`) : chalk.dim("no servers")}`);
      console.log(`  Integrations: ${intCount > 0 ? chalk.green(`${intCount} active`) : chalk.dim("none")}`);
      console.log();

      // Token Usage Table
      console.log(chalk.bold("  Token Usage"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────"));
      const sessionPct = Math.round((stats.sessionTokens / stats.budget.maxTokensPerSession) * 100);
      const dailyPct = Math.round((stats.dailyTokens / stats.budget.maxTokensPerDay) * 100);
      const sessionColor = sessionPct < 50 ? chalk.green : sessionPct < 80 ? chalk.yellow : chalk.red;
      const dailyColor = dailyPct < 50 ? chalk.green : dailyPct < 80 ? chalk.yellow : chalk.red;
      console.log(`  Session:  ${sessionColor(stats.sessionTokens.toLocaleString())} / ${stats.budget.maxTokensPerSession.toLocaleString()} (${sessionPct}%)`);
      console.log(`  Daily:    ${dailyColor(stats.dailyTokens.toLocaleString())} / ${stats.budget.maxTokensPerDay.toLocaleString()} (${dailyPct}%)`);
      console.log(`  Cost:     Session $${stats.sessionCost.toFixed(4)} | Daily $${stats.dailyCost.toFixed(4)}`);
      console.log(`  Requests: ${stats.requestCount}`);
      console.log();

      // Extended info with --all
      if (showAll) {
        console.log(chalk.bold("  Configuration"));
        console.log(chalk.dim("  ───────────────────────────────────────────────────"));
        console.log(`  Runtime:  ${ctx.runtimeDir}`);
        console.log(`  Soul:     ${ctx.soulDir}`);
        console.log(`  Thinking: ${config.thinking?.defaultLevel || "auto"}`);
        console.log(`  Sandbox:  ${config.security.sandbox ? chalk.yellow("enabled") : chalk.dim("disabled")}`);
        console.log(`  Approval: ${config.security.requireApprovalForExternal ? chalk.green("required") : chalk.dim("auto")}`);
        console.log();

        // Recent sessions
        console.log(chalk.bold("  Recent Sessions"));
        console.log(chalk.dim("  ───────────────────────────────────────────────────"));
        const recentSessions = sessions
          .sort(([, a], [, b]) => new Date(b.lastActiveAt || b.lastActive || b.createdAt).getTime() - new Date(a.lastActiveAt || a.lastActive || a.createdAt).getTime())
          .slice(0, 5);
        for (const [key, session] of recentSessions) {
          const active = key === ctx.currentSession ? chalk.cyan(" ←") : "";
          const time = new Date(session.lastActiveAt || session.lastActive || session.createdAt).toLocaleTimeString();
          console.log(`  ${key.padEnd(25)} ${chalk.dim(time)} ${session.messageCount || 0} msgs${active}`);
        }
        console.log();
      }

      console.log(chalk.dim(`  Use /status --all for extended info\n`));
    },
  },
  {
    name: "session",
    description: "Switch session [key]",
    handler: async (args, ctx) => {
      const key = args.trim() || "main";
      ctx.setSession(key);
      console.log(t.ok(`\nSession switched to: ${key}\n`));
    },
  },
  {
    name: "history",
    description: "Show conversation history",
    handler: async (_args, ctx) => {
      const { loadConfig } = await import("../config/config.js");
      const { loadHistory } = await import("../core/session.js");
      const config = loadConfig(ctx.runtimeDir);
      const history = loadHistory(ctx.runtimeDir, config.agent.id, ctx.currentSession);
      const msgs = history.slice(-10);
      if (msgs.length === 0) {
        console.log(t.dim("\nNo messages yet.\n"));
        return;
      }
      console.log(t.bold(`\nLast ${msgs.length} messages:\n`));
      for (const m of msgs) {
        const prefix = m.role === "user" ? t.user("You") : t.agent("Wispy");
        console.log(`  ${prefix}: ${m.content.slice(0, 200)}`);
      }
      console.log();
    },
  },
  {
    name: "memory",
    description: "Search memory [query]",
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query) { console.log(t.dim("\nUsage: /memory <query>\n")); return; }
      const { loadConfig } = await import("../config/config.js");
      const { MemoryManager } = await import("../memory/manager.js");
      const config = loadConfig(ctx.runtimeDir);
      const mm = new MemoryManager(ctx.runtimeDir, config);
      const results = await mm.search(query);
      mm.close();
      if (results.length === 0) {
        console.log(t.dim(`\nNo memories found for "${query}"\n`));
        return;
      }
      console.log(t.bold(`\nMemory results for "${query}":\n`));
      for (const r of results) {
        console.log(`  [${r.score.toFixed(2)}] ${r.text.slice(0, 150)}`);
      }
      console.log();
    },
  },
  {
    name: "skills",
    description: "List loaded skills",
    handler: async (_args, ctx) => {
      const { loadSkills } = await import("../skills/loader.js");
      const skills = loadSkills(ctx.soulDir);
      console.log(t.bold(`\n${skills.length} skill(s):\n`));
      for (const s of skills) {
        console.log(`  ${t.brand(s.name)} — ${t.dim(s.description)}`);
      }
      console.log();
    },
  },
  {
    name: "skill",
    description: "Skill commands [create]",
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase();
      if (sub === "create") {
        const { runSkillWizard } = await import("./skill-wizard.js");
        await runSkillWizard(ctx.soulDir);
      } else {
        console.log(t.dim("\nUsage: /skill create\n"));
      }
    },
  },
  {
    name: "wallet",
    description: "Wallet management [export|import|commerce|fund]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { getWalletAddress, getBalance, exportWalletPrivateKey, importWalletFromKey } = await import("../wallet/x402.js");
      const { getCommerceEngine } = await import("../wallet/commerce.js");
      const { loadOrCreateIdentity } = await import("../security/device-identity.js");

      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      // /wallet export — show private key for MetaMask
      if (subcommand === "export") {
        const addr = getWalletAddress(ctx.runtimeDir);
        if (!addr) { console.log(t.dim("\nWallet not initialized.\n")); return; }

        console.log(chalk.bold.yellow("\n  WARNING: Your private key will be displayed."));
        console.log(chalk.yellow("  Anyone with this key has full control of your wallet."));
        console.log(chalk.yellow("  Never share it. Never paste it in public.\n"));

        const identity = loadOrCreateIdentity(ctx.runtimeDir);
        const privateKey = exportWalletPrivateKey(ctx.runtimeDir, identity);

        console.log(chalk.bold("  Address:     ") + addr);
        console.log(chalk.bold("  Private Key: ") + chalk.dim(privateKey));
        console.log();
        console.log(chalk.dim("  To import into MetaMask:"));
        console.log(chalk.dim("  1. Open MetaMask -> Account menu -> Import Account"));
        console.log(chalk.dim("  2. Select 'Private Key' and paste the key above"));
        console.log(chalk.dim("  3. Add Base network (Chain ID: 8453, RPC: https://mainnet.base.org)\n"));
        return;
      }

      // /wallet import <key> — import from MetaMask
      if (subcommand === "import") {
        const key = parts[1];
        if (!key) {
          console.log(chalk.red("\n  Usage: /wallet import <private-key-hex>\n"));
          return;
        }

        try {
          const identity = loadOrCreateIdentity(ctx.runtimeDir);
          const info = importWalletFromKey(ctx.runtimeDir, identity, key);
          console.log(chalk.green(`\n  Wallet imported successfully!`));
          console.log(`  Address: ${chalk.cyan(info.address)}`);
          console.log(`  Chain:   ${info.chain}\n`);
        } catch (err: any) {
          console.log(chalk.red(`\n  Import failed: ${err.message}\n`));
        }
        return;
      }

      // /wallet commerce [set <param> <value>] — commerce policy
      if (subcommand === "commerce") {
        const commerce = getCommerceEngine();
        if (!commerce) {
          console.log(t.dim("\n  Commerce engine not initialized (enable wallet in config).\n"));
          return;
        }

        // /wallet commerce set <param> <value>
        if (parts[1]?.toLowerCase() === "set" && parts[2]) {
          const param = parts[2];
          const value = parts[3];
          if (!value) {
            console.log(chalk.red(`\n  Usage: /wallet commerce set <param> <value>`));
            console.log(chalk.dim("  Params: maxPerTransaction, dailyLimit, autoApproveBelow, requireApprovalAbove\n"));
            return;
          }

          const numericParams = ["maxPerTransaction", "dailyLimit", "autoApproveBelow", "requireApprovalAbove"];
          if (numericParams.includes(param)) {
            commerce.updatePolicy({ [param]: parseFloat(value) });
            console.log(chalk.green(`\n  Updated ${param} = ${value}\n`));
          } else if (param === "whitelist") {
            const policy = commerce.getPolicy();
            policy.whitelistedRecipients.push(value);
            commerce.updatePolicy({ whitelistedRecipients: policy.whitelistedRecipients });
            console.log(chalk.green(`\n  Added ${value.slice(0, 10)}... to whitelist\n`));
          } else if (param === "blacklist") {
            const policy = commerce.getPolicy();
            policy.blacklistedRecipients.push(value);
            commerce.updatePolicy({ blacklistedRecipients: policy.blacklistedRecipients });
            console.log(chalk.green(`\n  Added ${value.slice(0, 10)}... to blacklist\n`));
          } else {
            console.log(chalk.red(`\n  Unknown parameter: ${param}\n`));
          }
          return;
        }

        // Show commerce status
        const status = commerce.getStatus();
        console.log(chalk.bold("\n  Commerce Policy\n"));
        console.log(`  Max per tx:       ${chalk.cyan("$" + status.policy.maxPerTransaction)}`);
        console.log(`  Daily limit:      ${chalk.cyan("$" + status.policy.dailyLimit)}`);
        console.log(`  Auto-approve:     ${chalk.green("< $" + status.policy.autoApproveBelow)}`);
        console.log(`  Require approval: ${chalk.yellow("> $" + status.policy.requireApprovalAbove)}`);
        console.log(`  Whitelisted:      ${status.policy.whitelistedRecipients.length} addresses`);
        console.log(`  Blacklisted:      ${status.policy.blacklistedRecipients.length} addresses`);
        console.log();
        console.log(chalk.bold("  Today's Spending"));
        console.log(`  Total:     ${chalk.cyan("$" + status.dailySpending.total.toFixed(2))}`);
        console.log(`  Count:     ${status.dailySpending.count} payments`);
        console.log(`  Remaining: ${chalk.green("$" + status.dailySpending.remaining.toFixed(2))}`);

        if (status.recentPayments.length > 0) {
          console.log();
          console.log(chalk.bold("  Recent Payments"));
          for (const p of status.recentPayments) {
            console.log(`  $${p.amount} -> ${p.to.slice(0, 10)}... ${chalk.dim(p.txHash.slice(0, 14) + "...")}`);
          }
        }
        console.log();
        return;
      }

      // /wallet fund — show address for funding
      if (subcommand === "fund") {
        const addr = getWalletAddress(ctx.runtimeDir);
        if (!addr) { console.log(t.dim("\nWallet not initialized.\n")); return; }

        console.log(chalk.bold("\n  Fund Your Wispy Wallet\n"));
        console.log(`  Address: ${chalk.cyan(addr)}`);
        console.log(`  Network: Base (Chain ID 8453)`);
        console.log();
        console.log(chalk.dim("  From MetaMask:"));
        console.log(chalk.dim("  1. Switch to Base network"));
        console.log(chalk.dim("  2. Send USDC to the address above"));
        console.log(chalk.dim("  3. Send a small amount of ETH for gas (~$0.10)\n"));
        return;
      }

      // Default: /wallet — show status
      const addr = getWalletAddress(ctx.runtimeDir);
      if (!addr) { console.log(t.dim("\nWallet not initialized.\n")); return; }
      console.log(t.bold("\nWallet:\n"));
      console.log(`  Address: ${addr}`);
      try {
        const bal = await getBalance(ctx.runtimeDir);
        console.log(`  USDC:    ${bal}`);
      } catch {
        console.log(`  USDC:    ${t.dim("unavailable")}`);
      }

      // Show commerce summary if available
      const commerce = getCommerceEngine();
      if (commerce) {
        const spending = commerce.getDailySpending();
        console.log(`  Today:   $${spending.total.toFixed(2)} spent ($${spending.remaining.toFixed(2)} remaining)`);
      }

      console.log();
      console.log(t.dim("  Subcommands: /wallet export | import | commerce | fund\n"));
    },
  },
  {
    name: "x402scan",
    description: "Scan x402 wallet transactions [verify <txHash>]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { getWalletAddress } = await import("../wallet/x402.js");
      const { X402Scanner, formatScanSummary, formatVerification } = await import("../wallet/x402-scan.js");

      const addr = getWalletAddress(ctx.runtimeDir);
      if (!addr) {
        console.log(t.dim("\nWallet not initialized. Run /wallet first.\n"));
        return;
      }

      const scanner = new X402Scanner(ctx.runtimeDir);
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      if (subcommand === "verify" && parts[1]) {
        // Verify a specific transaction
        console.log(t.dim("\nVerifying transaction on-chain...\n"));
        const verification = await scanner.verifyTransaction(parts[1]);
        console.log(formatVerification(verification));
        console.log();
      } else if (subcommand === "reconcile") {
        // Reconcile on-chain vs local log
        console.log(t.dim("\nReconciling on-chain data with local log...\n"));
        const result = await scanner.reconcile(addr);
        console.log(`  Matched:       ${result.matched} transactions`);
        console.log(`  On-chain only: ${result.onChainOnly.length}`);
        console.log(`  Local only:    ${result.localOnly.length}`);
        if (result.onChainOnly.length > 0) {
          console.log(chalk.yellow(`\n  Missing from local log:`));
          for (const tx of result.onChainOnly.slice(0, 5)) {
            const dir = tx.direction === "out" ? "-" : "+";
            console.log(`    ${dir}$${tx.value} ${tx.hash.slice(0, 14)}... ${tx.timestamp.split("T")[0]}`);
          }
        }
        console.log();
      } else if (subcommand === "history") {
        // Show recent transactions
        console.log(t.dim("\nFetching transaction history...\n"));
        const txs = await scanner.getUSDCTransfers(addr, { pageSize: 20 });
        if (txs.length === 0) {
          console.log(t.dim("  No transactions found.\n"));
          return;
        }
        for (const tx of txs.slice(0, 15)) {
          const dir = tx.direction === "out" ? chalk.red("-") : chalk.green("+");
          const peer = tx.direction === "out"
            ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`
            : `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`;
          const date = tx.timestamp.split("T")[0];
          console.log(`  ${dir}$${parseFloat(tx.value).toFixed(6)}  ${peer}  ${date}  ${chalk.dim(tx.hash.slice(0, 10))}...`);
        }
        console.log();
      } else {
        // Default: full wallet scan
        console.log(t.dim("\nScanning wallet on Base...\n"));
        const summary = await scanner.scanWallet(addr);
        console.log(formatScanSummary(summary));
        console.log(t.dim("\n  /x402scan history    — Transaction list"));
        console.log(t.dim("  /x402scan verify <hash> — Verify tx on-chain"));
        console.log(t.dim("  /x402scan reconcile — Compare on-chain vs local\n"));
      }
    },
  },
  {
    name: "peers",
    description: "List A2A peers",
    handler: async (_args, ctx) => {
      const { listPeers } = await import("../a2a/peer.js");
      const all = listPeers(ctx.runtimeDir);
      if (all.length === 0) { console.log(t.dim("\nNo peers.\n")); return; }
      console.log(t.bold(`\n${all.length} peer(s):\n`));
      for (const p of all) {
        console.log(`  ${p.name} — ${t.dim(p.endpoint)}`);
      }
      console.log();
    },
  },
  {
    name: "model",
    description: "Switch model [name]",
    handler: async (args, ctx) => {
      const { loadConfig, saveConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);

      const MODELS: Record<string, string> = {
        // Gemini 3 (latest)
        "3": "gemini-3-pro",
        "3-pro": "gemini-3-pro",
        "3-flash": "gemini-3-flash",
        "gemini-3": "gemini-3-pro",
        "gemini-3-pro": "gemini-3-pro",
        "gemini-3-flash": "gemini-3-flash",
        // Gemini 2.5
        "pro": "gemini-2.5-pro",
        "flash": "gemini-2.5-flash",
        "2.5": "gemini-2.5-pro",
        "2.5-pro": "gemini-2.5-pro",
        "2.5-flash": "gemini-2.5-flash",
        // Gemini 2.0
        "2": "gemini-2.0-flash",
        "2-flash": "gemini-2.0-flash",
        "2-lite": "gemini-2.0-flash-lite",
        "flash2": "gemini-2.0-flash",
        "lite": "gemini-2.0-flash-lite",
        "exp": "gemini-2.0-flash-exp",
        "thinking": "gemini-2.0-flash-thinking-exp",
        // Gemini 1.5
        "1.5": "gemini-1.5-flash",
        "1.5-pro": "gemini-1.5-pro",
        "1.5-flash": "gemini-1.5-flash",
        "1.5-8b": "gemini-1.5-flash-8b",
        "8b": "gemini-1.5-flash-8b",
        // Nano / lightweight
        "nano": "gemini-nano",
        "1.0": "gemini-1.0-pro",
        // Image generation
        "imagen": "imagen-3.0-generate-002",
        "imagen-3": "imagen-3.0-generate-002",
        // Gemma free tier
        "gemma": "gemma-3-27b-it",
        "gemma-27b": "gemma-3-27b-it",
        "gemma-12b": "gemma-3-12b-it",
        "gemma-4b": "gemma-3-4b-it",
        // Full names work too
        "gemini-2.5-pro": "gemini-2.5-pro",
        "gemini-2.5-flash": "gemini-2.5-flash",
        "gemini-2.0-flash": "gemini-2.0-flash",
        "gemini-2.0-flash-exp": "gemini-2.0-flash-exp",
        "gemini-2.0-flash-lite": "gemini-2.0-flash-lite",
        "gemini-2.0-flash-thinking-exp": "gemini-2.0-flash-thinking-exp",
        "gemini-1.5-pro": "gemini-1.5-pro",
        "gemini-1.5-flash": "gemini-1.5-flash",
        "gemini-1.5-flash-8b": "gemini-1.5-flash-8b",
        "gemini-nano": "gemini-nano",
        "gemma-3-27b-it": "gemma-3-27b-it",
        "gemma-3-12b-it": "gemma-3-12b-it",
        "gemma-3-4b-it": "gemma-3-4b-it",
      };

      const input = args.trim().toLowerCase();

      if (!input) {
        const chalk = (await import("chalk")).default;
        console.log(t.bold("\nAvailable models:\n"));
        console.log(chalk.magenta("  Gemini 3 (Latest):"));
        console.log("    3          → gemini-3-pro (best quality, 2M context)");
        console.log("    3-flash    → gemini-3-flash (fast, 2M context)");
        console.log(chalk.cyan("\n  Gemini 2.5:"));
        console.log("    pro        → gemini-2.5-pro (1M context)");
        console.log("    flash      → gemini-2.5-flash (fast + cheap)");
        console.log(chalk.blue("\n  Gemini 2.0:"));
        console.log("    2          → gemini-2.0-flash");
        console.log("    lite       → gemini-2.0-flash-lite (cheapest)");
        console.log(chalk.yellow("\n  Gemini 1.5:"));
        console.log("    1.5-pro    → gemini-1.5-pro (2M context)");
        console.log("    1.5-flash  → gemini-1.5-flash");
        console.log("    8b         → gemini-1.5-flash-8b (tiny)");
        console.log(chalk.green("\n  Free / Experimental:"));
        console.log("    exp        → gemini-2.0-flash-exp");
        console.log("    thinking   → gemini-2.0-flash-thinking-exp");
        console.log("    nano       → gemini-nano (on-device)");
        console.log(chalk.red("\n  Gemma (Open Source):"));
        console.log("    gemma      → gemma-3-27b-it (best open)");
        console.log("    gemma-12b  → gemma-3-12b-it");
        console.log("    gemma-4b   → gemma-3-4b-it (smallest)");
        console.log(chalk.white("\n  Image Generation:"));
        console.log("    imagen     → imagen-3.0-generate-002");
        console.log(t.dim(`\n  Current: ${config.gemini.models.pro}`));
        console.log(t.dim(`  Image:   ${config.gemini.models.image}\n`));
        console.log(t.dim("  Usage: /model <name>\n"));
        return;
      }

      const modelId = MODELS[input as keyof typeof MODELS];
      if (!modelId) {
        console.log(t.err(`\nUnknown model: ${input}. Type /model to see options.\n`));
        return;
      }

      // Hot-swap: update the live config object so routeTask picks up the change immediately
      config.gemini.models.pro = modelId;
      config.gemini.models.flash = modelId.includes("flash") ? modelId : config.gemini.models.flash;
      saveConfig(ctx.runtimeDir, config);

      // Also update agent's internal config reference
      ctx.agent.updateConfig(config);

      const isFree = modelId.includes("exp") || modelId.includes("gemma");
      const tag = isFree ? " (free tier)" : "";
      console.log(t.ok(`\n  Switched to: ${modelId}${tag}`));
      console.log(t.dim("  Active now — no restart needed.\n"));
    },
  },
  {
    name: "export",
    description: "Export conversation as markdown",
    handler: async (_args, ctx) => {
      const { loadConfig } = await import("../config/config.js");
      const { loadHistory } = await import("../core/session.js");
      const { writeFileSync } = await import("fs");
      const { resolve } = await import("path");
      const config = loadConfig(ctx.runtimeDir);
      const history = loadHistory(ctx.runtimeDir, config.agent.id, ctx.currentSession);
      const md = history.map((m) => `**${m.role}**: ${m.content}`).join("\n\n");
      const outPath = resolve(ctx.runtimeDir, "cli", `export-${Date.now()}.md`);
      writeFileSync(outPath, md, "utf8");
      console.log(t.ok(`\nExported to: ${outPath}\n`));
    },
  },
  {
    name: "connect",
    description: "Connect a channel [telegram|whatsapp]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const channel = args.trim().toLowerCase();

      if (!channel) {
        console.log(t.bold("\nConnect a channel:\n"));
        console.log(`  ${chalk.cyan("/connect telegram")}  — Connect Telegram bot`);
        console.log(`  ${chalk.cyan("/connect whatsapp")}  — Connect WhatsApp Cloud API`);
        console.log();
        return;
      }

      if (channel === "telegram") {
        console.log(t.bold("\n📱 Telegram Setup\n"));
        console.log("  1. Open Telegram and message @BotFather");
        console.log("  2. Send /newbot and follow prompts");
        console.log("  3. Copy the bot token");
        console.log();

        const readline = (await import("readline")).default;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        const token = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan("  Enter bot token: "), (ans) => { rl.close(); resolve(ans.trim()); });
        });

        if (!token) { console.log(t.dim("\n  Cancelled.\n")); return; }

        const { loadConfig, saveConfig } = await import("../config/config.js");
        const config = loadConfig(ctx.runtimeDir);
        config.channels.telegram = { enabled: true, token };
        saveConfig(ctx.runtimeDir, config);

        console.log(t.ok("\n  ✓ Telegram configured! Run 'wispy gateway' to start the bot.\n"));
        return;
      }

      if (channel === "whatsapp") {
        console.log(t.bold("\n💬 WhatsApp Cloud API Setup\n"));
        console.log("  1. Go to developers.facebook.com");
        console.log("  2. Create an app with WhatsApp product");
        console.log("  3. Get your Phone Number ID and Access Token");
        console.log();

        const readline = (await import("readline")).default;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        const phoneId = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan("  Phone Number ID: "), (ans) => resolve(ans.trim()));
        });
        const token = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan("  Access Token: "), (ans) => { rl.close(); resolve(ans.trim()); });
        });

        if (!phoneId || !token) { console.log(t.dim("\n  Cancelled.\n")); return; }

        // Store in .env
        const { appendFileSync, existsSync } = await import("fs");
        const { resolve: resolvePath } = await import("path");
        const envPath = resolvePath(process.cwd(), ".env");
        const envLines = `\nWHATSAPP_PHONE_ID=${phoneId}\nWHATSAPP_TOKEN=${token}\n`;
        appendFileSync(envPath, envLines);

        const { loadConfig, saveConfig } = await import("../config/config.js");
        const config = loadConfig(ctx.runtimeDir);
        config.channels.whatsapp = { enabled: true };
        saveConfig(ctx.runtimeDir, config);

        console.log(t.ok("\n  ✓ WhatsApp configured! Credentials saved to .env\n"));
        console.log(t.dim("  Use the whatsapp_send_message tool to send messages.\n"));
        return;
      }

      console.log(t.err(`\n  Unknown channel: ${channel}\n`));
    },
  },
  {
    name: "integrations",
    description: "List integrations",
    handler: async (_args, ctx) => {
      const registry = ctx.agent.getIntegrationRegistry();
      if (!registry) {
        console.log(t.dim("\nIntegrations not loaded. Start gateway first.\n"));
        return;
      }
      const status = registry.getStatus();
      console.log(t.bold(`\n${status.length} integration(s):\n`));
      for (const s of status) {
        const icon = s.status === "active" ? t.ok("✓") : t.dim("○");
        console.log(`  ${icon} ${t.brand(s.id)} — ${s.name} [${s.category}]`);
      }
      console.log();
    },
  },
  {
    name: "voice",
    description: "Toggle voice mode [on|off]",
    handler: async (args, ctx) => {
      const mode = args.trim().toLowerCase();
      if (mode === "on") {
        const { VoiceMode } = await import("./voice/voice-mode.js");
        const voiceMode = new VoiceMode(ctx.agent, "cli-user");
        console.log(t.ok("\nStarting voice mode...\n"));
        await voiceMode.start();
      } else if (mode === "off") {
        console.log(t.dim("\nVoice mode stopped.\n"));
      } else {
        console.log(t.dim("\nUsage: /voice on|off\n"));
      }
    },
  },
  {
    name: "tokens",
    description: "Token usage stats",
    handler: async (_args, ctx) => {
      const stats = ctx.tokenManager.getStats();
      console.log(t.bold("\nToken Usage:\n"));
      console.log(`  Session:  ${stats.sessionTokens.toLocaleString()} tokens ($${stats.sessionCost.toFixed(4)})`);
      console.log(`  Today:    ${stats.dailyTokens.toLocaleString()} tokens ($${stats.dailyCost.toFixed(4)})`);
      console.log(`  Requests: ${stats.requestCount}`);
      console.log(`  Budget:   ${stats.budget.maxTokensPerDay.toLocaleString()} tokens/day`);
      console.log();
    },
  },
  {
    name: "theme",
    description: "Switch CLI theme [dawn|day|dusk|night]",
    handler: async (args, ctx) => {
      const theme = args.trim().toLowerCase();
      const valid = ["dawn", "day", "dusk", "night"] as const;
      if (!valid.includes(theme as any)) {
        console.log(t.dim("\nUsage: /theme dawn|day|dusk|night\n"));
        return;
      }
      const { setTheme } = await import("./ui/theme.js");
      setTheme(theme as any);
      const labels: Record<string, string> = { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };
      console.log(t.ok(`\nTheme set to ${labels[theme]}\n`));
      // Persist to config
      const { loadConfig, saveConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);
      config.theme = theme;
      saveConfig(ctx.runtimeDir, config);
    },
  },
  {
    name: "onboard",
    description: "Re-run the setup wizard",
    handler: async (_args, ctx) => {
      const { runSetupWizard } = await import("./setup/wizard.js");
      await runSetupWizard({ rootDir: process.cwd(), runtimeDir: ctx.runtimeDir, soulDir: ctx.soulDir });
    },
  },
  {
    name: "doctor",
    description: "Diagnose configuration issues",
    handler: async (args, ctx) => {
      const { runDoctor } = await import("./doctor.js");
      const fix = args.includes("--fix") || args.includes("-f");
      const verbose = args.includes("--verbose") || args.includes("-v");
      await runDoctor({
        rootDir: process.cwd(),
        runtimeDir: ctx.runtimeDir,
        soulDir: ctx.soulDir,
        fix,
        verbose,
      });
    },
  },
  {
    name: "prompts",
    description: "Browse prompt history",
    handler: async () => {
      console.log(t.dim("\nUse Ctrl+R or type /prompts in the TUI to browse history.\n"));
    },
  },
  {
    name: "recents",
    description: "Resume a recent session",
    handler: async () => {
      console.log(t.dim("\nUse /recents in the TUI to pick a session.\n"));
    },
  },
  {
    name: "context",
    description: "Show context window usage",
    handler: async (_args, ctx) => {
      const chalk = (await import("chalk")).default;
      const stats = ctx.tokenManager.getStats();
      const pct = Math.round((stats.sessionTokens / stats.budget.maxTokensPerSession) * 100);
      const dailyPct = Math.round((stats.dailyTokens / stats.budget.maxTokensPerDay) * 100);

      const barWidth = 40;
      const renderBar = (percent: number): string => {
        const filled = Math.round((percent / 100) * barWidth);
        const empty = barWidth - filled;
        const color = percent < 50 ? chalk.green : percent < 80 ? chalk.yellow : chalk.red;
        return color("█".repeat(filled)) + chalk.dim("░".repeat(empty)) + ` ${percent}%`;
      };

      console.log(t.bold("\nContext Usage:\n"));
      console.log(`  Session  ${renderBar(pct)}`);
      console.log(t.dim(`           ${stats.sessionTokens.toLocaleString()} / ${stats.budget.maxTokensPerSession.toLocaleString()} tokens`));
      console.log(`  Daily    ${renderBar(dailyPct)}`);
      console.log(t.dim(`           ${stats.dailyTokens.toLocaleString()} / ${stats.budget.maxTokensPerDay.toLocaleString()} tokens`));
      console.log();
    },
  },
  {
    name: "cost",
    description: "Detailed cost breakdown",
    handler: async (_args, ctx) => {
      const stats = ctx.tokenManager.getStats();
      const inputCost = stats.sessionCost * 0.3;
      const outputCost = stats.sessionCost * 0.7;
      const projected = stats.dailyCost * 30;
      console.log(t.bold("\nCost Breakdown:\n"));
      console.log(`  Session input:   $${inputCost.toFixed(4)}`);
      console.log(`  Session output:  $${outputCost.toFixed(4)}`);
      console.log(`  Session total:   $${stats.sessionCost.toFixed(4)}`);
      console.log(`  Today total:     $${stats.dailyCost.toFixed(4)}`);
      console.log(`  Projected/month: $${projected.toFixed(2)}`);
      console.log(`  Requests:        ${stats.requestCount}`);
      console.log();
    },
  },
  {
    name: "resume",
    description: "Resume a session [key]",
    handler: async (args, ctx) => {
      const { loadConfig } = await import("../config/config.js");
      const { loadRegistry } = await import("../core/session.js");
      const config = loadConfig(ctx.runtimeDir);
      const reg = loadRegistry(ctx.runtimeDir, config.agent.id);
      const key = args.trim();

      if (!key) {
        const sessions = Object.entries(reg.sessions)
          .sort(([, a], [, b]) => new Date(b.lastActiveAt || b.lastActive || b.createdAt).getTime() - new Date(a.lastActiveAt || a.lastActive || a.createdAt).getTime())
          .slice(0, 10);
        if (sessions.length === 0) { console.log(t.dim("\nNo sessions.\n")); return; }
        console.log(t.bold("\nRecent sessions:\n"));
        for (const [k, s] of sessions) {
          const active = k === ctx.currentSession ? t.brand(" ←") : "";
          console.log(`  ${t.brand(k.padEnd(20))} ${t.dim(s.lastActiveAt || s.lastActive || "")}${active}`);
        }
        console.log(t.dim("\n  /resume <key> to switch\n"));
        return;
      }
      ctx.setSession(key);
      console.log(t.ok(`\nResumed session: ${key}\n`));
    },
  },
  {
    name: "rename",
    description: "Rename current session [name]",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) { console.log(t.dim("\nUsage: /rename <name>\n")); return; }
      const old = ctx.currentSession;
      ctx.setSession(name);
      console.log(t.ok(`\nRenamed "${old}" → "${name}"\n`));
    },
  },
  {
    name: "compact",
    description: "Compact context [focus]",
    handler: async (args, ctx) => {
      const { loadConfig } = await import("../config/config.js");
      const { loadHistory, appendMessage, clearHistory } = await import("../core/session.js");
      const { generate } = await import("../ai/gemini.js");
      const config = loadConfig(ctx.runtimeDir);
      const agentId = config.agent.id;
      const history = loadHistory(ctx.runtimeDir, agentId, ctx.currentSession);

      if (history.length < 5) { console.log(t.dim("\nNot enough history to compact.\n")); return; }

      const splitIdx = Math.floor(history.length * 0.8);
      const toSummarize = history.slice(0, splitIdx);
      const toKeep = history.slice(splitIdx);

      const focus = args.trim();
      const focusNote = focus ? `\nFocus the summary on: ${focus}` : "";
      const summaryPrompt = `Summarize this conversation concisely, preserving key facts, decisions, and context needed to continue.${focusNote}\n\n` +
        toSummarize.map((m) => `${m.role}: ${m.content}`).join("\n\n");

      console.log(t.dim("\nCompacting..."));
      try {
        const result = await generate({
          model: config.gemini.models.flash,
          messages: [{ role: "user", content: summaryPrompt }],
          thinkingLevel: "minimal",
        });

        clearHistory(ctx.runtimeDir, agentId, ctx.currentSession);
        appendMessage(ctx.runtimeDir, agentId, ctx.currentSession, {
          role: "model",
          content: `[Compacted Summary]\n${result.text}`,
          timestamp: new Date().toISOString(),
        });
        for (const m of toKeep) {
          appendMessage(ctx.runtimeDir, agentId, ctx.currentSession, m);
        }

        console.log(t.ok(`\nCompacted ${toSummarize.length} messages into summary. Kept ${toKeep.length} recent.\n`));
      } catch (err: any) {
        console.log(t.err(`\nCompaction failed: ${err.message}\n`));
      }
    },
  },
  {
    name: "copy",
    description: "Copy last response to clipboard",
    handler: async (_args, ctx) => {
      const { loadConfig } = await import("../config/config.js");
      const { loadHistory } = await import("../core/session.js");
      const { execSync } = await import("child_process");
      const config = loadConfig(ctx.runtimeDir);
      const history = loadHistory(ctx.runtimeDir, config.agent.id, ctx.currentSession);
      const last = [...history].reverse().find((m) => m.role === "model");
      if (!last) { console.log(t.dim("\nNo response to copy.\n")); return; }
      try {
        execSync("clip.exe", { input: last.content });
        console.log(t.ok(`\nCopied ${last.content.length} chars to clipboard.\n`));
      } catch {
        console.log(t.dim("\nClipboard not available.\n"));
      }
    },
  },
  {
    name: "stats",
    description: "Usage statistics",
    handler: async (_args, ctx) => {
      const { loadConfig } = await import("../config/config.js");
      const { loadRegistry } = await import("../core/session.js");
      const config = loadConfig(ctx.runtimeDir);
      const reg = loadRegistry(ctx.runtimeDir, config.agent.id);
      const stats = ctx.tokenManager.getStats();
      const sessionCount = Object.keys(reg.sessions).length;
      console.log(t.bold("\nUsage Statistics:\n"));
      console.log(`  Sessions:       ${sessionCount}`);
      console.log(`  Requests:       ${stats.requestCount}`);
      console.log(`  Session tokens: ${stats.sessionTokens.toLocaleString()}`);
      console.log(`  Daily tokens:   ${stats.dailyTokens.toLocaleString()}`);
      console.log(`  Session cost:   $${stats.sessionCost.toFixed(4)}`);
      console.log(`  Daily cost:     $${stats.dailyCost.toFixed(4)}`);
      console.log();
    },
  },
  {
    name: "plan",
    description: "Enter plan mode (read-only tools)",
    handler: async (_args, ctx) => {
      ctx.agent.setMode("plan");
      const chalk = (await import("chalk")).default;
      console.log(chalk.yellow("\nPlan mode enabled. Only read-only tools available."));
      console.log(chalk.dim("Use /execute to switch back to execute mode.\n"));
    },
  },
  {
    name: "execute",
    description: "Exit plan mode",
    handler: async (_args, ctx) => {
      ctx.agent.setMode("execute");
      const chalk = (await import("chalk")).default;
      console.log(chalk.green("\nExecute mode enabled. All tools available.\n"));
    },
  },
  {
    name: "rewind",
    description: "Restore a checkpoint [n]",
    handler: async (args, ctx) => {
      const { listCheckpoints, restoreCheckpoint } = await import("./checkpoints.js");
      const entries = listCheckpoints(ctx.runtimeDir);
      const idx = parseInt(args.trim());

      if (entries.length === 0) { console.log(t.dim("\nNo checkpoints.\n")); return; }

      if (isNaN(idx)) {
        console.log(t.bold(`\nCheckpoints (${entries.length}):\n`));
        for (let i = 0; i < Math.min(entries.length, 10); i++) {
          const e = entries[i];
          const time = new Date(e.timestamp).toLocaleTimeString();
          console.log(`  ${t.brand(String(i).padEnd(4))} ${time} ${t.dim(e.filePath)}`);
        }
        console.log(t.dim("\n  /rewind <n> to restore\n"));
        return;
      }

      if (idx < 0 || idx >= entries.length) { console.log(t.err("\nInvalid index.\n")); return; }
      const ok = restoreCheckpoint(entries[idx]);
      console.log(ok ? t.ok(`\nRestored: ${entries[idx].filePath}\n`) : t.err("\nRestore failed.\n"));
    },
  },
  {
    name: "checkpoints",
    description: "List file checkpoints",
    handler: async (_args, ctx) => {
      const { listCheckpoints } = await import("./checkpoints.js");
      const entries = listCheckpoints(ctx.runtimeDir);
      if (entries.length === 0) { console.log(t.dim("\nNo checkpoints.\n")); return; }
      console.log(t.bold(`\nCheckpoints (${entries.length}):\n`));
      for (let i = 0; i < Math.min(entries.length, 15); i++) {
        const e = entries[i];
        const time = new Date(e.timestamp).toLocaleTimeString();
        console.log(`  ${t.brand(String(i).padEnd(4))} ${time} ${t.dim(e.filePath)}`);
      }
      console.log();
    },
  },
  {
    name: "verbose",
    description: "Toggle verbose mode",
    handler: async () => {
      verboseMode = !verboseMode;
      console.log(t.ok(`\nVerbose mode: ${verboseMode ? "ON" : "OFF"}\n`));
    },
  },
  {
    name: "provider",
    description: "Switch AI provider [gemini|openai|anthropic|ollama]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig, saveConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);
      const input = args.trim().toLowerCase();

      const PROVIDERS = {
        gemini: { name: "Google Gemini", color: chalk.blue, models: "gemini-3-pro, gemini-2.5-flash, etc." },
        openai: { name: "OpenAI", color: chalk.green, models: "gpt-4o, gpt-4-turbo, o1, etc." },
        anthropic: { name: "Anthropic", color: chalk.magenta, models: "Various models" },
        ollama: { name: "Ollama (Local)", color: chalk.yellow, models: "llama3, mistral, codellama, etc." },
        openrouter: { name: "OpenRouter", color: chalk.cyan, models: "Any model via OpenRouter" },
        groq: { name: "Groq", color: chalk.red, models: "llama-3.3-70b, mixtral-8x7b, etc." },
      };

      if (!input) {
        console.log(chalk.bold("\nAI Providers:\n"));
        for (const [key, info] of Object.entries(PROVIDERS)) {
          const current = config.activeProvider === key || (!config.activeProvider && key === "gemini");
          const indicator = current ? chalk.cyan(" ← active") : "";
          const configured = config.providers?.[key as keyof typeof config.providers]?.apiKey ? chalk.green(" [configured]") : "";
          console.log(`  ${info.color(key.padEnd(12))} ${info.name}${configured}${indicator}`);
          console.log(chalk.dim(`               ${info.models}`));
        }
        console.log(chalk.dim(`\n  Current: ${config.activeProvider || "gemini"}`));
        console.log(chalk.dim(`  Usage: /provider <name>\n`));
        return;
      }

      if (!PROVIDERS[input as keyof typeof PROVIDERS]) {
        console.log(t.err(`\nUnknown provider: ${input}. Type /provider to see options.\n`));
        return;
      }

      // Check if provider is configured
      if (input !== "gemini") {
        const providerConfig = config.providers?.[input as keyof typeof config.providers];
        if (!providerConfig?.apiKey) {
          console.log(chalk.yellow(`\nProvider ${input} not configured yet.`));
          console.log(chalk.dim(`Add to your config.yaml:`));
          console.log(chalk.dim(`  providers:`));
          console.log(chalk.dim(`    ${input}:`));
          console.log(chalk.dim(`      apiKey: your-api-key`));
          if (input === "ollama") {
            console.log(chalk.dim(`      baseUrl: http://localhost:11434`));
          }
          console.log();
          return;
        }
      }

      config.activeProvider = input as typeof config.activeProvider;
      saveConfig(ctx.runtimeDir, config);
      console.log(t.ok(`\nSwitched to ${PROVIDERS[input as keyof typeof PROVIDERS].name}\n`));
    },
  },
  {
    name: "image",
    description: "Send an image to the agent [path] [prompt]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { readFileSync, existsSync } = await import("fs");
      const { extname } = await import("path");

      const parts = args.trim().split(/\s+/);
      const filePath = parts[0];
      const prompt = parts.slice(1).join(" ") || "Describe this image in detail.";

      if (!filePath) {
        console.log(chalk.bold("\n  Image Analysis\n"));
        console.log(chalk.dim("  Usage: /image <path> [prompt]\n"));
        console.log("  Examples:");
        console.log(chalk.cyan("    /image screenshot.png") + chalk.dim(" — Describe this image"));
        console.log(chalk.cyan("    /image photo.jpg What's in this picture?"));
        console.log(chalk.cyan("    /image diagram.png Explain the architecture"));
        console.log(chalk.dim("\n  You can also paste image paths directly in your message.\n"));
        return;
      }

      if (!existsSync(filePath)) {
        console.log(chalk.red(`\n  File not found: ${filePath}\n`));
        return;
      }

      const mimeMap: Record<string, string> = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
      };
      const ext = extname(filePath).toLowerCase();
      const mimeType = mimeMap[ext];
      if (!mimeType) {
        console.log(chalk.red(`\n  Unsupported image format: ${ext}\n`));
        return;
      }

      console.log(chalk.dim(`\n  ◆ Loading ${filePath}...`));
      const data = readFileSync(filePath).toString("base64");
      const images = [{ mimeType, data }];

      console.log(chalk.dim(`  ◆ Analyzing with ${prompt.slice(0, 40)}...\n`));

      let fullResponse = "";
      for await (const chunk of ctx.agent.chatStream(prompt, "cli-user", "cli", "main", { images })) {
        if (chunk.type === "text") {
          process.stdout.write(chunk.content);
          fullResponse += chunk.content;
        }
      }
      console.log();
    },
  },
  {
    name: "browser",
    description: "Browser control [screenshot|navigate]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);

      if (!config.browser?.enabled) {
        console.log(chalk.yellow("\nBrowser control not enabled."));
        console.log(chalk.dim("Add to config.yaml:"));
        console.log(chalk.dim("  browser:"));
        console.log(chalk.dim("    enabled: true"));
        console.log(chalk.dim("    cdpUrl: http://localhost:9222  # Optional: Chrome DevTools Protocol URL"));
        console.log();
        return;
      }

      const [action, ...rest] = args.split(" ");
      const url = rest.join(" ");

      if (action === "screenshot") {
        console.log(chalk.dim("\nBrowser screenshot feature coming soon.\n"));
      } else if (action === "navigate" && url) {
        console.log(chalk.dim(`\nNavigating to ${url}...\n`));
      } else {
        console.log(chalk.bold("\nBrowser Control:\n"));
        console.log("  /browser screenshot      — Capture current page");
        console.log("  /browser navigate <url>  — Go to URL");
        console.log(chalk.dim("\n  Status: " + (config.browser.enabled ? chalk.green("enabled") : chalk.red("disabled"))));
        console.log();
      }
    },
  },
  {
    name: "approve",
    description: "Approve pending tool execution",
    handler: async () => {
      const chalk = (await import("chalk")).default;
      console.log(chalk.dim("\nNo pending approvals. Approvals appear when tools require confirmation.\n"));
    },
  },
  {
    name: "tools",
    description: "List available tools",
    handler: async (_args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { BUILT_IN_TOOLS } = await import("../ai/tools.js");

      console.log(chalk.bold("\nBuilt-in Tools:\n"));
      for (const tool of BUILT_IN_TOOLS) {
        console.log(`  ${chalk.cyan(tool.name.padEnd(18))} ${chalk.dim(tool.description)}`);
      }

      // MCP tools
      const mcpRegistry = ctx.agent.getMcpRegistry();
      const mcpTools = mcpRegistry?.getAllTools() || [];
      if (mcpTools.length > 0) {
        console.log(chalk.bold("\nMCP Tools:\n"));
        for (const tool of mcpTools.slice(0, 10)) {
          console.log(`  ${chalk.magenta(tool.name.padEnd(18))} ${chalk.dim(tool.description?.slice(0, 50) || "")}`);
        }
        if (mcpTools.length > 10) {
          console.log(chalk.dim(`  ... and ${mcpTools.length - 10} more`));
        }
      }

      // Integration tools
      const intRegistry = ctx.agent.getIntegrationRegistry();
      const intTools = intRegistry?.getToolDeclarations?.() || [];
      if (intTools.length > 0) {
        console.log(chalk.bold("\nIntegration Tools:\n"));
        for (const tool of intTools.slice(0, 10)) {
          console.log(`  ${chalk.green(tool.name.padEnd(18))} ${chalk.dim(tool.description?.slice(0, 50) || "")}`);
        }
        if (intTools.length > 10) {
          console.log(chalk.dim(`  ... and ${intTools.length - 10} more`));
        }
      }

      console.log();
    },
  },
  {
    name: "thinking",
    description: "Set thinking level [none|minimal|low|medium|high|ultra]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig, saveConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);
      const level = args.trim().toLowerCase();

      const levels = ["none", "minimal", "low", "medium", "high", "ultra"];
      if (!level) {
        console.log(chalk.bold("\nThinking Levels:\n"));
        for (const l of levels) {
          const current = config.thinking?.defaultLevel === l;
          const desc = {
            none: "No extended thinking",
            minimal: "Brief reasoning (128 tokens)",
            low: "Light reasoning (1K tokens)",
            medium: "Moderate reasoning (4K tokens)",
            high: "Deep reasoning (16K tokens)",
            ultra: "Maximum reasoning (64K tokens)",
          }[l];
          console.log(`  ${(current ? chalk.cyan("→ ") : "  ") + l.padEnd(10)} ${chalk.dim(desc)}`);
        }
        console.log(chalk.dim(`\n  Current: ${config.thinking?.defaultLevel || "auto"}`));
        console.log(chalk.dim(`  Usage: /thinking <level>\n`));
        return;
      }

      if (!levels.includes(level)) {
        console.log(t.err(`\nInvalid level. Options: ${levels.join(", ")}\n`));
        return;
      }

      config.thinking = { ...config.thinking, defaultLevel: level as any, costAware: config.thinking?.costAware ?? true };
      saveConfig(ctx.runtimeDir, config);
      console.log(t.ok(`\nThinking level set to: ${level}\n`));
    },
  },
  {
    name: "vertex",
    description: "Configure Vertex AI [enable|disable|status]",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig, saveConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);
      const sub = args.trim().toLowerCase().split(" ")[0];
      const restArgs = args.trim().split(" ").slice(1).join(" ");

      if (sub === "enable") {
        const project = restArgs || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
        if (!project) {
          console.log(chalk.red("\nError: Project ID required."));
          console.log(chalk.dim("Usage: /vertex enable <project-id>"));
          console.log(chalk.dim("Or set GOOGLE_CLOUD_PROJECT environment variable.\n"));
          return;
        }

        config.gemini.vertexai = {
          enabled: true,
          project,
          location: config.gemini.vertexai?.location || "us-central1",
        };
        saveConfig(ctx.runtimeDir, config);

        // Hot-swap: re-initialize Gemini with Vertex AI
        try {
          const { initGemini } = await import("../ai/gemini.js");
          initGemini({ vertexai: true, project, location: config.gemini.vertexai!.location || "us-central1" });
          ctx.agent.updateConfig(config);
          console.log(chalk.bold.green("\n  Vertex AI Enabled\n"));
          console.log(`  Project:  ${chalk.cyan(project)}`);
          console.log(`  Location: ${chalk.cyan(config.gemini.vertexai!.location)}`);
          console.log(chalk.dim("  Active now — no restart needed."));
          console.log(chalk.dim("  Make sure you're authenticated: gcloud auth application-default login\n"));
        } catch (err) {
          console.log(chalk.red(`\n  Failed to enable Vertex AI: ${err instanceof Error ? err.message : err}`));
          console.log(chalk.dim("  Config saved. Restart Wispy to retry.\n"));
        }
        return;
      }

      if (sub === "disable") {
        if (config.gemini.vertexai) {
          config.gemini.vertexai.enabled = false;
        }
        saveConfig(ctx.runtimeDir, config);
        console.log(chalk.yellow("\n  Vertex AI disabled. Using API key mode."));
        console.log(chalk.dim("  Restart Wispy to apply changes.\n"));
        return;
      }

      if (sub === "location") {
        const location = restArgs || "us-central1";
        if (!config.gemini.vertexai) {
          config.gemini.vertexai = { enabled: false, location };
        } else {
          config.gemini.vertexai.location = location;
        }
        saveConfig(ctx.runtimeDir, config);
        console.log(t.ok(`\n  Vertex AI location set to: ${location}\n`));
        return;
      }

      // Default: show status
      console.log(chalk.bold("\n  Vertex AI Configuration\n"));

      const vertexConfig = config.gemini.vertexai;
      const enabled = vertexConfig?.enabled || false;

      console.log(`  Status:   ${enabled ? chalk.green("Enabled") : chalk.dim("Disabled")}`);
      if (vertexConfig) {
        console.log(`  Project:  ${vertexConfig.project || chalk.dim("not set")}`);
        console.log(`  Location: ${vertexConfig.location || "us-central1"}`);
      }

      console.log(chalk.dim("\n  Commands:"));
      console.log(chalk.dim("    /vertex enable <project-id>  Enable Vertex AI"));
      console.log(chalk.dim("    /vertex disable              Disable (use API key)"));
      console.log(chalk.dim("    /vertex location <region>    Set region (us-central1, europe-west1, etc.)"));

      console.log(chalk.dim("\n  Benefits of Vertex AI:"));
      console.log(chalk.dim("    • Enterprise-grade security & compliance"));
      console.log(chalk.dim("    • Higher rate limits & quotas"));
      console.log(chalk.dim("    • VPC Service Controls support"));
      console.log(chalk.dim("    • Unified billing with Google Cloud"));
      console.log(chalk.dim("    • Access to latest preview models\n"));
    },
  },
  {
    name: "exit",
    description: "Quit Wispy",
    handler: async () => {
      console.log(t.dim("\nGoodbye!\n"));
      process.exit(0);
    },
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // MoltBot-style Enhanced Commands
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "agents",
    description: "List/manage agents",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const { existsSync, readdirSync } = await import("fs");
      const { resolve } = await import("path");
      const config = loadConfig(ctx.runtimeDir);

      const sub = args.trim().toLowerCase().split(" ")[0];

      if (sub === "list" || !sub) {
        console.log(chalk.bold("\nAgents:\n"));

        // Primary agent
        console.log(`  ${chalk.cyan("→")} ${chalk.bold(config.agent.name)} ${chalk.dim(`(${config.agent.id})`)}`);
        console.log(`    ${chalk.dim("Type:")} Primary agent`);
        console.log(`    ${chalk.dim("Mode:")} ${ctx.agent.getMode() === "plan" ? chalk.yellow("PLAN") : chalk.green("EXECUTE")}`);

        // Check for sub-agents in config
        const subAgents = config.agents || [];
        if (subAgents.length > 0) {
          console.log(chalk.dim("\n  Sub-agents:"));
          for (const agentId of subAgents) {
            const agentDir = resolve(ctx.runtimeDir, "agents", agentId);
            const exists = existsSync(agentDir);
            const status = exists ? chalk.green("active") : chalk.dim("not initialized");
            console.log(`    ${chalk.dim("○")} ${agentId} [${status}]`);
          }
        }

        // Check for agent types
        try {
          const agentTypesDir = resolve(ctx.soulDir, "..", "src", "agents", "types");
          if (existsSync(agentTypesDir)) {
            const types = readdirSync(agentTypesDir)
              .filter(f => f.endsWith(".ts"))
              .map(f => f.replace(".ts", ""));
            console.log(chalk.dim(`\n  Available types: ${types.join(", ")}`));
          }
        } catch { /* ignore */ }

        console.log();
      } else if (sub === "spawn") {
        const agentType = args.split(" ")[1];
        if (!agentType) {
          console.log(t.dim("\nUsage: /agents spawn <type>\n"));
          console.log(t.dim("Types: coder, researcher, writer, devops, designer, data, security, planner\n"));
          return;
        }
        console.log(t.ok(`\nSpawning ${agentType} agent...`));
        console.log(t.dim("Sub-agent spawning available via orchestrator in gateway mode.\n"));
      } else {
        console.log(t.dim("\nUsage: /agents [list|spawn <type>]\n"));
      }
    },
  },
  {
    name: "sessions",
    description: "List/manage sessions",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const { loadRegistry, clearHistory, getSessionsDir } = await import("../core/session.js");
      const { writeFileSync } = await import("fs");
      const { resolve } = await import("path");
      const config = loadConfig(ctx.runtimeDir);
      const reg = loadRegistry(ctx.runtimeDir, config.agent.id);

      const [sub, sessionKey] = args.trim().toLowerCase().split(" ");

      if (sub === "list" || !sub) {
        const sessions = Object.entries(reg.sessions)
          .sort(([, a], [, b]) => new Date(b.lastActiveAt || b.lastActive || b.createdAt).getTime() - new Date(a.lastActiveAt || a.lastActive || a.createdAt).getTime());

        if (sessions.length === 0) {
          console.log(t.dim("\nNo sessions.\n"));
          return;
        }

        console.log(chalk.bold(`\nSessions (${sessions.length}):\n`));
        console.log(chalk.dim("  KEY                         MSGS    CHANNEL   LAST ACTIVE"));
        console.log(chalk.dim("  ─────────────────────────────────────────────────────────────"));

        for (const [key, session] of sessions.slice(0, 20)) {
          const active = key === ctx.currentSession ? chalk.cyan(" ←") : "";
          const lastActive = new Date(session.lastActiveAt || session.lastActive || "").toLocaleString();
          const msgCount = (session.messageCount || 0).toString().padStart(4);
          const channel = (session.channel || "cli").padEnd(8);
          console.log(`  ${key.slice(0, 25).padEnd(25)} ${msgCount}    ${channel}  ${chalk.dim(lastActive)}${active}`);
        }

        if (sessions.length > 20) {
          console.log(chalk.dim(`\n  ... and ${sessions.length - 20} more`));
        }
        console.log();
      } else if (sub === "delete" && sessionKey) {
        if (reg.sessions[sessionKey]) {
          clearHistory(ctx.runtimeDir, config.agent.id, sessionKey);
          delete reg.sessions[sessionKey];
          const { writeJSON } = await import("../utils/file.js");
          writeJSON(resolve(getSessionsDir(ctx.runtimeDir, config.agent.id), "index.json"), reg);
          console.log(t.ok(`\nDeleted session: ${sessionKey}\n`));
        } else {
          console.log(t.err(`\nSession not found: ${sessionKey}\n`));
        }
      } else if (sub === "reset") {
        const targetKey = sessionKey || ctx.currentSession;
        clearHistory(ctx.runtimeDir, config.agent.id, targetKey);
        console.log(t.ok(`\nReset session: ${targetKey}\n`));
      } else if (sub === "stats") {
        const targetKey = sessionKey || ctx.currentSession;
        const session = reg.sessions[targetKey];
        if (!session) {
          console.log(t.err(`\nSession not found: ${targetKey}\n`));
          return;
        }
        const stats = ctx.tokenManager.getStats();
        console.log(chalk.bold(`\nSession: ${targetKey}\n`));
        console.log(`  Created:   ${session.createdAt || "unknown"}`);
        console.log(`  Last:      ${session.lastActiveAt || session.lastActive || "unknown"}`);
        console.log(`  Messages:  ${session.messageCount || 0}`);
        console.log(`  Channel:   ${session.channel || "cli"}`);
        console.log(`  Tokens:    ${stats.sessionTokens.toLocaleString()}`);
        console.log(`  Cost:      $${stats.sessionCost.toFixed(4)}`);
        console.log();
      } else {
        console.log(t.dim("\nUsage: /sessions [list|delete <key>|reset [key]|stats [key]]\n"));
      }
    },
  },
  {
    name: "cron",
    description: "Manage cron jobs",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { resolve } = await import("path");
      const { readJSON, writeJSON, ensureDir } = await import("../utils/file.js");

      const cronPath = resolve(ctx.runtimeDir, "cron", "jobs.json");
      const loadCronStore = () => readJSON<{ jobs: Array<{ id: string; name: string; cron: string; instruction: string; enabled: boolean; createdAt: string; lastRunAt?: string }> }>(cronPath) || { jobs: [] };
      const saveCronStore = (store: any) => { ensureDir(resolve(ctx.runtimeDir, "cron")); writeJSON(cronPath, store); };

      const parts = args.trim().split(" ");
      const sub = parts[0]?.toLowerCase();

      if (sub === "list" || !sub) {
        const store = loadCronStore();
        if (store.jobs.length === 0) {
          console.log(t.dim("\nNo cron jobs configured.\n"));
          console.log(t.dim("Add one with: /cron add <name> <cron-expression> <instruction>\n"));
          return;
        }

        console.log(chalk.bold(`\nCron Jobs (${store.jobs.length}):\n`));
        console.log(chalk.dim("  ID       NAME             SCHEDULE        ENABLED   LAST RUN"));
        console.log(chalk.dim("  ────────────────────────────────────────────────────────────────"));

        for (const job of store.jobs) {
          const enabled = job.enabled ? chalk.green("yes") : chalk.red("no ");
          const lastRun = job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : chalk.dim("never");
          console.log(`  ${job.id.padEnd(8)} ${job.name.slice(0, 15).padEnd(16)} ${job.cron.padEnd(15)} ${enabled}       ${lastRun}`);
          console.log(chalk.dim(`           → ${job.instruction.slice(0, 50)}${job.instruction.length > 50 ? "..." : ""}`));
        }
        console.log();
      } else if (sub === "add") {
        const name = parts[1];
        const cronExpr = parts[2];
        const instruction = parts.slice(3).join(" ");

        if (!name || !cronExpr || !instruction) {
          console.log(t.dim('\nUsage: /cron add <name> <cron-expression> <instruction>'));
          console.log(t.dim('Example: /cron add daily-summary "0 9 * * *" "Summarize yesterday\'s activities"\n'));
          return;
        }

        const store = loadCronStore();
        const job = {
          id: Math.random().toString(36).slice(2, 10),
          name,
          cron: cronExpr,
          instruction,
          enabled: true,
          createdAt: new Date().toISOString(),
        };
        store.jobs.push(job);
        saveCronStore(store);
        console.log(t.ok(`\nAdded cron job: ${name} (${job.id})\n`));
        console.log(t.dim("Run 'wispy gateway' to activate cron jobs.\n"));
      } else if (sub === "remove" || sub === "delete") {
        const jobId = parts[1];
        if (!jobId) {
          console.log(t.dim("\nUsage: /cron remove <job-id>\n"));
          return;
        }

        const store = loadCronStore();
        const idx = store.jobs.findIndex(j => j.id === jobId || j.name === jobId);
        if (idx < 0) {
          console.log(t.err(`\nJob not found: ${jobId}\n`));
          return;
        }

        const removed = store.jobs.splice(idx, 1)[0];
        saveCronStore(store);
        console.log(t.ok(`\nRemoved cron job: ${removed.name}\n`));
      } else if (sub === "toggle") {
        const jobId = parts[1];
        if (!jobId) {
          console.log(t.dim("\nUsage: /cron toggle <job-id>\n"));
          return;
        }

        const store = loadCronStore();
        const job = store.jobs.find(j => j.id === jobId || j.name === jobId);
        if (!job) {
          console.log(t.err(`\nJob not found: ${jobId}\n`));
          return;
        }

        job.enabled = !job.enabled;
        saveCronStore(store);
        console.log(t.ok(`\nCron job ${job.name}: ${job.enabled ? "enabled" : "disabled"}\n`));
      } else {
        console.log(t.dim("\nUsage: /cron [list|add|remove|toggle] ...\n"));
      }
    },
  },
  {
    name: "plugins",
    description: "List installed plugins",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const { existsSync, readdirSync } = await import("fs");
      const { resolve } = await import("path");
      const config = loadConfig(ctx.runtimeDir);

      console.log(chalk.bold("\nPlugins:\n"));

      // Config-defined plugins
      const configPlugins = config.plugins || [];
      if (configPlugins.length > 0) {
        console.log(chalk.dim("  From config:"));
        for (const p of configPlugins) {
          console.log(`    ${chalk.green("●")} ${p}`);
        }
      }

      // Check for plugins directory
      const pluginsDir = resolve(ctx.runtimeDir, "plugins");
      if (existsSync(pluginsDir)) {
        const plugins = readdirSync(pluginsDir);
        if (plugins.length > 0) {
          console.log(chalk.dim("\n  Installed:"));
          for (const p of plugins) {
            console.log(`    ${chalk.green("●")} ${p}`);
          }
        }
      }

      // MCP servers as "plugins"
      const mcpRegistry = ctx.agent.getMcpRegistry();
      const mcpServers = mcpRegistry?.getStatus() || [];
      if (mcpServers.length > 0) {
        console.log(chalk.dim("\n  MCP Servers:"));
        for (const s of mcpServers) {
          const statusIcon = s.status === "running" ? chalk.green("●") : chalk.yellow("○");
          console.log(`    ${statusIcon} ${s.id} (${s.tools || 0} tools)`);
        }
      }

      // Integrations
      const intRegistry = ctx.agent.getIntegrationRegistry();
      const intStatus = intRegistry?.getStatus() || [];
      const activeInts = intStatus.filter(s => s.status === "active");
      if (activeInts.length > 0) {
        console.log(chalk.dim("\n  Integrations:"));
        for (const s of activeInts) {
          console.log(`    ${chalk.green("●")} ${s.name} (${s.category})`);
        }
      }

      if (configPlugins.length === 0 && mcpServers.length === 0 && activeInts.length === 0) {
        console.log(t.dim("  No plugins installed."));
        console.log(t.dim("\n  Add plugins via config.yaml or MCP servers."));
      }

      console.log();
    },
  },
  {
    name: "channels",
    description: "Show channel status",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);

      console.log(chalk.bold("\nChannels:\n"));

      const channelList = [
        { name: "Telegram", key: "telegram", config: config.channels.telegram },
        { name: "WhatsApp", key: "whatsapp", config: config.channels.whatsapp },
        { name: "Discord", key: "discord", config: config.channels.discord },
        { name: "Slack", key: "slack", config: config.channels.slack },
        { name: "Signal", key: "signal", config: config.channels.signal },
        { name: "Matrix", key: "matrix", config: config.channels.matrix },
        { name: "Web UI", key: "web", config: config.channels.web },
        { name: "REST API", key: "rest", config: config.channels.rest },
      ];

      console.log(chalk.dim("  CHANNEL      STATUS      PORT     CONFIG"));
      console.log(chalk.dim("  ─────────────────────────────────────────────────"));

      for (const ch of channelList) {
        const enabled = ch.config?.enabled;
        const status = enabled ? chalk.green("enabled ") : chalk.dim("disabled");
        const port = (ch.config as any)?.port ? String((ch.config as any).port).padEnd(8) : chalk.dim("—".padEnd(8));
        const hasToken = (ch.config as any)?.token || (ch.config as any)?.accessToken;
        const configStatus = hasToken ? chalk.green("configured") : enabled ? chalk.yellow("needs setup") : chalk.dim("—");
        console.log(`  ${ch.name.padEnd(12)} ${status}    ${port} ${configStatus}`);
      }

      console.log(chalk.dim("\n  Use /connect <channel> to set up a channel.\n"));
    },
  },
  {
    name: "security",
    description: "Security audit",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const { existsSync } = await import("fs");
      const { resolve } = await import("path");
      const config = loadConfig(ctx.runtimeDir);

      console.log(chalk.bold("\nSecurity Audit:\n"));

      let issues = 0;
      const checkItem = (label: string, pass: boolean, detail?: string) => {
        const icon = pass ? chalk.green("✓") : chalk.red("✗");
        console.log(`  ${icon} ${label}`);
        if (detail && !pass) console.log(chalk.dim(`    → ${detail}`));
        if (!pass) issues++;
      };

      // API Key protection
      const apiKeyEnv = !!process.env.GEMINI_API_KEY;
      checkItem("API key in environment (not hardcoded)", apiKeyEnv, "Set GEMINI_API_KEY env var");

      // Sandbox mode
      checkItem("Sandbox mode", config.security.sandbox === true, "Enable in config.yaml: security.sandbox: true");

      // External approval
      checkItem("External tool approval required", config.security.requireApprovalForExternal, "Recommended for production");

      // Tool allowlist
      const hasAllowlist = config.security.toolAllowlist && config.security.toolAllowlist.length > 0;
      checkItem("Tool allowlist configured", hasAllowlist || false, "Define specific allowed tools");

      // Check for .env file exposure
      const envFileExists = existsSync(resolve(process.cwd(), ".env"));
      const gitignoreExists = existsSync(resolve(process.cwd(), ".gitignore"));
      if (envFileExists) {
        checkItem(".env file protected", gitignoreExists, "Add .env to .gitignore");
      }

      // Wallet security
      if (config.wallet?.enabled) {
        const walletKeyFile = resolve(ctx.runtimeDir, "wallet", "key.json");
        const walletExists = existsSync(walletKeyFile);
        checkItem("Wallet key file exists", walletExists);
        checkItem("Auto-pay threshold reasonable", (config.wallet.autoPayThreshold || 0) <= 10, "Consider lowering autoPayThreshold");
      }

      // REST API bearer token
      if (config.channels.rest?.enabled) {
        const hasBearer = !!config.channels.rest.bearerToken;
        checkItem("REST API protected with bearer token", hasBearer, "Set channels.rest.bearerToken");
      }

      // Allowed groups
      const hasGroups = config.security.allowedGroups.length > 0;
      if (config.channels.telegram?.enabled || config.channels.discord?.enabled) {
        checkItem("Allowed groups configured", hasGroups, "Restrict which groups can interact");
      }

      console.log();
      if (issues === 0) {
        console.log(chalk.green("  All security checks passed!\n"));
      } else {
        console.log(chalk.yellow(`  ${issues} issue(s) found. Review recommendations above.\n`));
      }
    },
  },
  {
    name: "logs",
    description: "View recent logs",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { existsSync, readdirSync, readFileSync } = await import("fs");
      const { resolve } = await import("path");

      const logsDir = resolve(ctx.runtimeDir, "logs");
      const count = parseInt(args.trim()) || 20;

      if (!existsSync(logsDir)) {
        console.log(t.dim("\nNo logs directory found.\n"));
        console.log(t.dim("Logs are created when running the gateway.\n"));
        return;
      }

      const logFiles = readdirSync(logsDir)
        .filter(f => f.endsWith(".log") || f.endsWith(".jsonl"))
        .sort()
        .reverse();

      if (logFiles.length === 0) {
        console.log(t.dim("\nNo log files found.\n"));
        return;
      }

      console.log(chalk.bold(`\nRecent Logs (last ${count} entries):\n`));

      // Read the most recent log file
      const latestLog = resolve(logsDir, logFiles[0]);
      try {
        const content = readFileSync(latestLog, "utf-8");
        const lines = content.trim().split("\n").slice(-count);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const level = entry.level || "info";
            const levelColor = level === "error" ? chalk.red : level === "warn" ? chalk.yellow : chalk.dim;
            const time = entry.time ? new Date(entry.time).toLocaleTimeString() : "";
            const msg = entry.msg || entry.message || line;
            console.log(`  ${chalk.dim(time)} ${levelColor(level.padEnd(5))} ${msg.slice(0, 80)}`);
          } catch {
            // Plain text log
            console.log(`  ${line.slice(0, 100)}`);
          }
        }
      } catch (err) {
        console.log(t.dim("  Could not read log file."));
      }

      console.log(chalk.dim(`\n  Log file: ${logFiles[0]}`));
      console.log(chalk.dim(`  Usage: /logs [count]\n`));
    },
  },
  {
    name: "reset",
    description: "Reset current session",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig } = await import("../config/config.js");
      const { clearHistory } = await import("../core/session.js");
      const config = loadConfig(ctx.runtimeDir);

      const confirm = args.trim().toLowerCase() === "--force" || args.trim().toLowerCase() === "-f";

      if (!confirm) {
        console.log(chalk.yellow(`\nThis will clear all messages in session: ${ctx.currentSession}`));
        console.log(chalk.dim("Run '/reset --force' to confirm.\n"));
        return;
      }

      clearHistory(ctx.runtimeDir, config.agent.id, ctx.currentSession);
      ctx.tokenManager.resetSession();
      console.log(t.ok(`\nSession reset: ${ctx.currentSession}\n`));
    },
  },
  {
    name: "config",
    description: "Show/edit configuration",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { loadConfig, saveConfig, getConfigPath } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);

      const parts = args.trim().split(" ");
      const sub = parts[0]?.toLowerCase();

      if (sub === "path") {
        console.log(t.dim(`\nConfig file: ${getConfigPath(ctx.runtimeDir)}\n`));
        return;
      }

      if (sub === "set" && parts.length >= 3) {
        const key = parts[1];
        const value = parts.slice(2).join(" ");

        // Handle nested keys like "gemini.models.pro"
        const keys = key.split(".");
        let obj: any = config;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!(keys[i] in obj)) obj[keys[i]] = {};
          obj = obj[keys[i]];
        }

        // Parse value
        let parsedValue: any = value;
        if (value === "true") parsedValue = true;
        else if (value === "false") parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);

        obj[keys[keys.length - 1]] = parsedValue;
        saveConfig(ctx.runtimeDir, config);
        console.log(t.ok(`\nSet ${key} = ${parsedValue}\n`));
        return;
      }

      if (sub === "get" && parts[1]) {
        const key = parts[1];
        const keys = key.split(".");
        let obj: any = config;
        for (const k of keys) {
          obj = obj?.[k];
        }
        console.log(`\n${key} = ${JSON.stringify(obj, null, 2)}\n`);
        return;
      }

      // Default: show config overview
      console.log(chalk.bold("\nConfiguration:\n"));
      console.log(chalk.dim("  Agent"));
      console.log(`    Name:     ${config.agent.name}`);
      console.log(`    ID:       ${config.agent.id}`);

      console.log(chalk.dim("\n  Models"));
      console.log(`    Pro:      ${config.gemini.models.pro}`);
      console.log(`    Flash:    ${config.gemini.models.flash}`);
      console.log(`    Provider: ${config.activeProvider || "gemini"}`);

      // Vertex AI
      const vertexConfig = config.gemini.vertexai;
      if (vertexConfig?.enabled) {
        console.log(chalk.dim("\n  Vertex AI"));
        console.log(`    Enabled:  ${chalk.green("yes")}`);
        console.log(`    Project:  ${vertexConfig.project || "default"}`);
        console.log(`    Location: ${vertexConfig.location || "us-central1"}`);
      }

      console.log(chalk.dim("\n  Thinking"));
      console.log(`    Level:    ${config.thinking?.defaultLevel || "auto"}`);
      console.log(`    Cost-aware: ${config.thinking?.costAware !== false ? "yes" : "no"}`);

      console.log(chalk.dim("\n  Sessions"));
      console.log(`    Daily reset: ${config.sessions?.dailyReset ? `yes (${config.sessions.resetHour}:00)` : "no"}`);
      console.log(`    Idle timeout: ${config.sessions?.idleWindowMinutes || 30} minutes`);

      console.log(chalk.dim("\n  Security"));
      console.log(`    Sandbox:  ${config.security.sandbox ? chalk.green("enabled") : chalk.dim("disabled")}`);
      console.log(`    Approval: ${config.security.requireApprovalForExternal ? chalk.green("required") : chalk.dim("auto")}`);

      console.log(chalk.dim(`\n  Config file: ${getConfigPath(ctx.runtimeDir)}`));
      console.log(chalk.dim("\n  Usage: /config [path|get <key>|set <key> <value>]\n"));
    },
  },
  {
    name: "memstatus",
    description: "Memory status and sync",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { existsSync, statSync } = await import("fs");
      const { resolve } = await import("path");
      const { loadConfig } = await import("../config/config.js");
      const config = loadConfig(ctx.runtimeDir);

      const dbPath = resolve(ctx.runtimeDir, "memory", "embeddings.db");

      console.log(chalk.bold("\nMemory Status:\n"));

      if (!existsSync(dbPath)) {
        console.log(t.dim("  Memory database not initialized."));
        console.log(t.dim("  It will be created on first memory operation.\n"));
        return;
      }

      const stats = statSync(dbPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      console.log(`  Database:   ${chalk.green("active")}`);
      console.log(`  Size:       ${sizeMB} MB`);
      console.log(`  Path:       ${dbPath}`);
      console.log(`  Dimensions: ${config.memory.embeddingDimensions}`);
      console.log(`  Hybrid:     ${config.memory.hybridSearch ? chalk.green("enabled") : chalk.dim("BM25+vector")}`);

      // Try to get count
      try {
        const Database = (await import("better-sqlite3")).default;
        const db = new Database(dbPath, { readonly: true });
        const row = db.prepare("SELECT COUNT(*) as count FROM embeddings").get() as { count: number };
        console.log(`  Memories:   ${row.count}`);
        db.close();
      } catch {
        console.log(`  Memories:   ${chalk.dim("unknown")}`);
      }

      console.log(chalk.dim("\n  Use /memory <query> to search memories.\n"));
    },
  },
  {
    name: "marathon",
    description: "Autonomous multi-day task execution (Durable Background Agents)",
    handler: async (args, ctx) => {
      const chalk = (await import("chalk")).default;
      const { MarathonService, displayMarathonStatus, formatDuration } = await import("../marathon/service.js");
      const { loadConfig } = await import("../config/config.js");

      const config = loadConfig(ctx.runtimeDir);
      const marathonService = new MarathonService(ctx.runtimeDir);
      const [subCmd, ...rest] = args.split(" ");
      const subArgs = rest.join(" ");

      switch (subCmd?.toLowerCase()) {
        case "start":
        case "": {
          if (!subArgs && !subCmd) {
            // Show help
            console.log(chalk.bold.cyan("\n  Marathon Agent - Durable Background Agents\n"));
            console.log(chalk.dim("  Run for minutes or days with auto-save, crash recovery, and human approval.\n"));
            console.log("  Usage:");
            console.log(chalk.dim("    /marathon start <goal>") + " - Start a durable marathon");
            console.log(chalk.dim("    /marathon status") + " - View current marathon status");
            console.log(chalk.dim("    /marathon list") + " - List all marathons");
            console.log(chalk.dim("    /marathon pause") + " - Pause active marathon");
            console.log(chalk.dim("    /marathon resume [id]") + " - Resume a paused marathon");
            console.log(chalk.dim("    /marathon abort") + " - Abort active marathon");
            console.log(chalk.dim("    /marathon logs [id]") + " - View marathon logs");
            console.log(chalk.dim("    /marathon approvals") + " - View pending approvals");
            console.log(chalk.dim("    /marathon approve <id>") + " - Approve a request");
            console.log(chalk.dim("    /marathon reject <id>") + " - Reject a request");
            console.log(chalk.dim("    /marathon watchdog") + " - Start watchdog (crash monitoring)");
            console.log();
            console.log("  Features:");
            console.log(chalk.green("    ✓ Auto-save") + " - State saved after every action");
            console.log(chalk.green("    ✓ Crash recovery") + " - Auto-resume from last checkpoint");
            console.log(chalk.green("    ✓ Human approval") + " - Pause for sensitive actions");
            console.log(chalk.green("    ✓ Real-time streaming") + " - Progress via Telegram/webhook");
            console.log(chalk.green("    ✓ Heartbeat monitoring") + " - Detect and restart crashed agents");
            console.log();
            console.log("  Example:");
            console.log(chalk.green('    /marathon start "Build a full-stack todo app with auth and deploy"'));
            console.log();
            return;
          }

          const goal = subCmd === "start" ? subArgs : args;
          if (!goal) {
            console.log(chalk.red("  Error: Please provide a goal for the marathon."));
            console.log(chalk.dim('  Example: /marathon start "Build a REST API with Express"'));
            return;
          }

          try {
            const apiKey = config.gemini.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
            if (!apiKey) {
              console.log(chalk.red("  Error: Gemini API key not configured."));
              return;
            }

            // Use durable marathon by default
            await marathonService.startDurable(goal, ctx.agent, apiKey, {
              workingDirectory: process.cwd(),
              streaming: {
                telegram: config.channels.telegram?.enabled ? undefined : undefined,
              },
            });
          } catch (error) {
            console.log(chalk.red(`  Error: ${error instanceof Error ? error.message : error}`));
          }
          break;
        }

        case "approvals": {
          const pending = marathonService.getPendingApprovals();
          if (pending.length === 0) {
            console.log(chalk.dim("\n  No pending approvals.\n"));
            return;
          }

          console.log(chalk.bold.yellow(`\n  Pending Approvals (${pending.length}):\n`));
          for (const { marathonId, request } of pending) {
            console.log(`  ${chalk.cyan(request.id)} [${chalk.yellow(request.risk)}]`);
            console.log(chalk.dim(`    Marathon: ${marathonId}`));
            console.log(`    Action: ${request.action}`);
            console.log(`    ${request.description}`);
            console.log(chalk.dim(`    Created: ${new Date(request.timestamp).toLocaleString()}`));
            console.log();
          }
          console.log(chalk.dim("  Use /marathon approve <id> or /marathon reject <id>\n"));
          break;
        }

        case "approve": {
          const requestId = subArgs.trim();
          if (!requestId) {
            console.log(chalk.red("  Usage: /marathon approve <request-id>"));
            return;
          }

          // Find the marathon that has this request
          const marathons = marathonService.listMarathons() as any[];
          let found = false;
          for (const m of marathons) {
            if (m.approvalRequests?.some((r: any) => r.id === requestId)) {
              const success = marathonService.approve(m.id, requestId, "cli-user");
              if (success) {
                console.log(chalk.green(`\n  ✓ Approved request ${requestId}\n`));
                found = true;
              }
              break;
            }
          }
          if (!found) {
            console.log(chalk.red(`  Request not found: ${requestId}`));
          }
          break;
        }

        case "reject": {
          const parts = subArgs.trim().split(" ");
          const requestId = parts[0];
          const reason = parts.slice(1).join(" ") || "Rejected via CLI";

          if (!requestId) {
            console.log(chalk.red("  Usage: /marathon reject <request-id> [reason]"));
            return;
          }

          const marathons = marathonService.listMarathons() as any[];
          let found = false;
          for (const m of marathons) {
            if (m.approvalRequests?.some((r: any) => r.id === requestId)) {
              const success = marathonService.reject(m.id, requestId, reason);
              if (success) {
                console.log(chalk.red(`\n  ✗ Rejected request ${requestId}: ${reason}\n`));
                found = true;
              }
              break;
            }
          }
          if (!found) {
            console.log(chalk.red(`  Request not found: ${requestId}`));
          }
          break;
        }

        case "watchdog": {
          const apiKey = config.gemini.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            console.log(chalk.red("  Error: Gemini API key not configured."));
            return;
          }

          console.log(chalk.bold.cyan("\n  Starting Marathon Watchdog...\n"));
          console.log("  The watchdog will:");
          console.log(chalk.dim("    • Monitor all running marathons"));
          console.log(chalk.dim("    • Detect crashed agents via heartbeat"));
          console.log(chalk.dim("    • Auto-restart from last checkpoint"));
          console.log(chalk.dim("    • Send alerts on crash detection\n"));

          const watchdog = marathonService.initWatchdog(ctx.agent, apiKey);

          watchdog.on("crash_detected", (data: any) => {
            console.log(chalk.red(`  🚨 Crash detected: ${data.id}`));
          });

          watchdog.on("marathon_restarted", (data: any) => {
            console.log(chalk.yellow(`  🔄 Restarted: ${data.id} (attempt ${data.attempt})`));
          });

          console.log(chalk.green("  ✓ Watchdog started. Press Ctrl+C to stop.\n"));

          // Keep running
          await new Promise(() => {});
          break;
        }

        case "status": {
          const state = marathonService.getStatus(subArgs || undefined);
          if (!state) {
            console.log(chalk.dim("\n  No active marathons.\n"));
            return;
          }
          displayMarathonStatus(state);
          break;
        }

        case "list": {
          const marathons = marathonService.listMarathons();
          if (marathons.length === 0) {
            console.log(chalk.dim("\n  No marathons found.\n"));
            return;
          }

          console.log(chalk.bold.cyan("\n  Marathons:\n"));
          for (const m of marathons.slice(0, 10)) {
            const statusColors: Record<string, (s: string) => string> = {
              planning: chalk.blue,
              executing: chalk.yellow,
              paused: chalk.gray,
              completed: chalk.green,
              failed: chalk.red,
            };
            const color = statusColors[m.status] || chalk.white;
            const age = formatDuration(
              Math.round((Date.now() - new Date(m.startedAt).getTime()) / 60000)
            );
            console.log(`  ${color(m.status.padEnd(10))} ${chalk.dim(m.id)} ${m.plan.goal.slice(0, 40)}... (${age} ago)`);
          }
          console.log();
          break;
        }

        case "pause": {
          marathonService.pause();
          break;
        }

        case "abort": {
          marathonService.abort();
          break;
        }

        case "resume": {
          const state = marathonService.getStatus(subArgs || undefined);
          if (!state) {
            console.log(chalk.red("  No marathon found to resume."));
            return;
          }
          if (state.status !== "paused") {
            console.log(chalk.yellow(`  Marathon is not paused (status: ${state.status})`));
            return;
          }

          const apiKey = config.gemini.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            console.log(chalk.red("  Error: Gemini API key not configured."));
            return;
          }

          await marathonService.resume(state.id, ctx.agent, apiKey);
          break;
        }

        case "logs": {
          const state = marathonService.getStatus(subArgs || undefined);
          if (!state) {
            console.log(chalk.dim("\n  No marathon found.\n"));
            return;
          }

          console.log(chalk.bold.cyan(`\n  Marathon Logs: ${state.plan.goal.slice(0, 40)}...\n`));
          for (const log of state.logs.slice(-20)) {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const levelColors: Record<string, (s: string) => string> = {
              info: chalk.blue,
              warn: chalk.yellow,
              error: chalk.red,
              success: chalk.green,
              thinking: chalk.magenta,
            };
            const color = levelColors[log.level] || chalk.white;
            console.log(`  ${chalk.dim(time)} ${color(log.level.padEnd(8))} ${log.message}`);
          }
          console.log();
          break;
        }

        case "result": {
          const result = marathonService.getResult(subArgs);
          if (!result) {
            console.log(chalk.dim("\n  Marathon not found.\n"));
            return;
          }

          console.log(chalk.bold.cyan("\n  Marathon Result\n"));
          console.log(`  Success: ${result.success ? chalk.green("Yes") : chalk.red("No")}`);
          console.log(`  Completed: ${result.completedMilestones}/${result.totalMilestones} milestones`);
          console.log(`  Time: ${formatDuration(result.totalTime)}`);
          console.log(`  Cost: $${result.totalCost.toFixed(4)}`);
          console.log(`\n  ${result.summary}\n`);
          break;
        }

        default:
          console.log(chalk.red(`  Unknown subcommand: ${subCmd}`));
          console.log(chalk.dim("  Use /marathon for help."));
      }
    },
  },
];

export let verboseMode = false;

export function getCommands(): SlashCommand[] {
  return commands;
}

export async function handleSlashCommand(input: string, ctx: CommandContext): Promise<boolean> {
  const [name, ...rest] = input.slice(1).split(" ");
  const args = rest.join(" ");
  const cmd = commands.find((c) => c.name === name.toLowerCase());
  if (!cmd) {
    console.log(t.err(`Unknown command: /${name}. Type /help for available commands.`));
    return true;
  }
  await cmd.handler(args, ctx);
  return true;
}
