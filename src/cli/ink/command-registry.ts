/**
 * Slash command registry for the command palette.
 *
 * Each entry has a name, optional aliases, description, and category.
 * Used by CommandPalette.tsx for live filtering and display.
 */

export interface CommandDef {
  name: string;
  aliases?: string[];
  args?: string;
  description: string;
  category: string;
}

export const COMMANDS: CommandDef[] = [
  // ── Core ────────────────────────────────────────────────
  { name: "help",      description: "Show available commands",               category: "Core" },
  { name: "clear",     aliases: ["new"],     description: "Clear the conversation history",    category: "Core" },
  { name: "status",    description: "Comprehensive system status",           category: "Core" },
  { name: "quick",     args: "<action>",     description: "Quick actions [build|run|test|deploy|fix]", category: "Core" },
  { name: "exit",      aliases: ["quit"],    description: "Quit Wispy",                        category: "Core" },

  // ── Session ─────────────────────────────────────────────
  { name: "session",   args: "[key]",        description: "Switch session",                    category: "Session" },
  { name: "sessions",  description: "List/manage sessions",                  category: "Session" },
  { name: "history",   description: "Show conversation history",             category: "Session" },
  { name: "resume",    args: "[key]",        description: "Resume a session",                  category: "Session" },
  { name: "rename",    args: "[name]",       description: "Rename current session",             category: "Session" },
  { name: "reset",     description: "Reset current session",                 category: "Session" },
  { name: "compact",   args: "[focus]",      description: "Compact context window",             category: "Session" },
  { name: "recents",   description: "Resume a recent session",               category: "Session" },

  // ── AI & Models ─────────────────────────────────────────
  { name: "model",     args: "[name]",       description: "Select AI model to use",             category: "AI & Models" },
  { name: "provider",  args: "[name]",       description: "Switch AI provider [gemini|openai|ollama]", category: "AI & Models" },
  { name: "thinking",  args: "[level]",      description: "Set thinking level [none|low|medium|high|ultra]", category: "AI & Models" },
  { name: "vertex",    args: "[cmd]",        description: "Configure Vertex AI [enable|disable|status]", category: "AI & Models" },
  { name: "plan",      description: "Enter plan mode (read-only tools)",     category: "AI & Models" },
  { name: "execute",   description: "Exit plan mode",                        category: "AI & Models" },

  // ── Memory ──────────────────────────────────────────────
  { name: "memory",    args: "[query]",      description: "Search memory",                     category: "Memory" },
  { name: "memstatus", description: "Memory status and sync",                category: "Memory" },

  // ── Tools & Skills ──────────────────────────────────────
  { name: "tools",     description: "List available tools",                  category: "Tools & Skills" },
  { name: "skills",    description: "List loaded skills",                    category: "Tools & Skills" },
  { name: "skill",     args: "[create]",     description: "Skill commands",                    category: "Tools & Skills" },
  { name: "approve",   description: "Approve pending tool execution",        category: "Tools & Skills" },

  // ── Marathon ────────────────────────────────────────────
  { name: "marathon",  args: "<goal>",       description: "Autonomous multi-day task execution", category: "Marathon" },

  // ── Channels ────────────────────────────────────────────
  { name: "channels",  description: "Show channel status",                   category: "Channels" },
  { name: "connect",   args: "[channel]",    description: "Connect a channel [telegram|whatsapp]", category: "Channels" },

  // ── Context & Tokens ───────────────────────────────────
  { name: "context",   description: "Show context window usage",             category: "Analytics" },
  { name: "tokens",    description: "Token usage stats",                     category: "Analytics" },
  { name: "cost",      description: "Detailed cost breakdown",               category: "Analytics" },
  { name: "stats",     description: "Usage statistics",                      category: "Analytics" },

  // ── Utilities ───────────────────────────────────────────
  { name: "export",    description: "Export conversation as markdown",        category: "Utilities" },
  { name: "copy",      description: "Copy last response to clipboard",       category: "Utilities" },
  { name: "theme",     args: "[name]",       description: "Switch CLI theme [dawn|day|dusk|night]", category: "Utilities" },
  { name: "verbose",   description: "Toggle verbose mode",                   category: "Utilities" },
  { name: "image",     args: "[path]",       description: "Send an image to the agent",         category: "Utilities" },

  // ── System ──────────────────────────────────────────────
  { name: "config",    description: "Show/edit configuration",               category: "System" },
  { name: "security",  description: "Security audit",                        category: "System" },
  { name: "logs",      description: "View recent logs",                      category: "System" },
  { name: "doctor",    description: "Diagnose configuration issues",         category: "System" },
  { name: "onboard",   description: "Re-run the setup wizard",               category: "System" },

  // ── Advanced ────────────────────────────────────────────
  { name: "wallet",    args: "[cmd]",        description: "Wallet management [export|import|commerce]", category: "Advanced" },
  { name: "x402scan",  args: "[cmd]",        description: "Scan x402 wallet transactions",      category: "Advanced" },
  { name: "x402demo",  args: "[track]",      description: "Run x402 hackathon demo [1-6|all]",  category: "Advanced" },
  { name: "deploy",    args: "[contract]",   description: "Deploy ERC-8004 identity contracts on-chain", category: "Advanced" },
  { name: "commerce",  description: "Agentic commerce integration status",    category: "Advanced" },
  { name: "peers",     description: "List A2A peers",                        category: "Advanced" },
  { name: "agents",    description: "List/manage agents",                    category: "Advanced" },
  { name: "cron",      description: "Manage cron jobs",                      category: "Advanced" },
  { name: "plugins",   description: "List installed plugins",                category: "Advanced" },
  { name: "integrations", description: "List integrations",                  category: "Advanced" },
  { name: "browser",   args: "[cmd]",        description: "Browser control [screenshot|navigate]", category: "Advanced" },
  { name: "voice",     args: "[on|off]",     description: "Toggle voice mode",                  category: "Advanced" },
  { name: "checkpoints", description: "List file checkpoints",               category: "Advanced" },
  { name: "rewind",    args: "[n]",          description: "Restore a checkpoint",                category: "Advanced" },
  { name: "prompts",   description: "Browse prompt history",                 category: "Advanced" },
];

/**
 * Filter commands by a query string (without the leading /).
 * Matches against name, aliases, and description.
 */
export function filterCommands(query: string): CommandDef[] {
  if (!query) return COMMANDS;

  const q = query.toLowerCase();
  return COMMANDS.filter((cmd) => {
    if (cmd.name.startsWith(q)) return true;
    if (cmd.aliases?.some((a) => a.startsWith(q))) return true;
    if (cmd.description.toLowerCase().includes(q)) return true;
    return false;
  }).sort((a, b) => {
    // Exact prefix matches first
    const aExact = a.name.startsWith(q) ? 0 : 1;
    const bExact = b.name.startsWith(q) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.name.localeCompare(b.name);
  });
}
