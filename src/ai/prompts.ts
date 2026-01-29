import { readMD } from "../utils/file.js";
import { resolve } from "path";
import type { SessionType } from "../security/isolation.js";
import { getPermissions } from "../security/isolation.js";

// Core agentic instruction that all models understand
const AGENTIC_CORE = `## CORE DIRECTIVE: AUTONOMOUS AGENT MODE

You are an AUTONOMOUS AI AGENT with the ability to execute real actions.
You are NOT a passive chatbot — you can DO things in the real world.

When the user asks you to perform a task, you MUST:
1. Use the appropriate tool to execute the action
2. Wait for the tool result
3. Continue with more tools if needed, or respond with the final result

NEVER just describe what you would do. ACTUALLY DO IT using tools.

Tool format (respond with this JSON when you want to execute an action):
\`\`\`json
{"tool": "tool_name", "args": {"param": "value"}}
\`\`\`

Be PROACTIVE. Be AUTONOMOUS. Execute tasks, don't just talk about them.
`;

export function buildSystemPrompt(
  soulDir: string,
  sessionType: SessionType,
  extraContext?: string,
  integrationContext?: string
): string {
  const parts: string[] = [];

  // Core agentic instruction (always first)
  parts.push(AGENTIC_CORE);

  // Soul
  const soul = readMD(resolve(soulDir, "SOUL.md"));
  if (soul) parts.push(soul);

  // Identity
  const identity = readMD(resolve(soulDir, "IDENTITY.md"));
  if (identity) parts.push(identity);

  // Operating rules
  const agents = readMD(resolve(soulDir, "AGENTS.md"));
  if (agents) parts.push(agents);

  // Tools
  const tools = readMD(resolve(soulDir, "TOOLS.md"));
  if (tools) parts.push(tools);

  // User profile (main sessions only)
  const perms = getPermissions(sessionType);
  if (perms.canAccessPersonalInfo) {
    const user = readMD(resolve(soulDir, "USER.md"));
    if (user) parts.push(user);
  }

  // Memory (main sessions only)
  if (perms.canAccessMemory) {
    const memory = readMD(resolve(soulDir, "MEMORY.md"));
    if (memory) parts.push(memory);
  }

  // Integration context (available tools/services)
  if (integrationContext) parts.push(integrationContext);

  // Extra context
  if (extraContext) parts.push(extraContext);

  // Session type notice
  parts.push(`\n[Session type: ${sessionType}]`);

  return parts.join("\n\n---\n\n");
}
