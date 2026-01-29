/**
 * Workspace configuration — defines which agents are active and their settings.
 *
 * Users configure their workspace during `wispy setup`. The config is stored
 * in .wispy/workspace.yaml and controls which agents are available, their
 * models, and collaboration settings.
 */

import { resolve } from "path";
import { readYaml, writeYaml, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("workspace");

// ─── Agent Type Definitions ─────────────────────────────────

export interface AgentTypeConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  defaultModel: string;
  capabilities: string[];
  tools: string[];
  thinkingLevel: "minimal" | "low" | "medium" | "high";
}

// ─── Workspace Config ───────────────────────────────────────

export interface WorkspaceAgentConfig {
  enabled: boolean;
  model?: string;
  capabilities?: string[];
}

export interface WorkspaceConfig {
  agents: Record<string, WorkspaceAgentConfig>;
  collaboration: {
    enabled: boolean;
    maxChainDepth: number;
  };
  models: {
    default: string;
    fallback?: string;
    local?: string;
  };
  voice: {
    enabled: boolean;
    sttEngine: "whisper" | "gemini-live";
    ttsEngine: "piper" | "espeak" | "google-tts" | "gemini-live";
  };
  tokenBudget: {
    maxPerRequest: number;
    maxPerSession: number;
    maxPerDay: number;
  };
}

const DEFAULT_WORKSPACE: WorkspaceConfig = {
  agents: {
    coder: { enabled: true },
    researcher: { enabled: true },
    writer: { enabled: false },
    devops: { enabled: false },
    designer: { enabled: false },
    data: { enabled: false },
    security: { enabled: true },
    planner: { enabled: true },
  },
  collaboration: {
    enabled: true,
    maxChainDepth: 5,
  },
  models: {
    default: "gemini-2.5-pro",
    fallback: "gemini-2.5-flash",
  },
  voice: {
    enabled: false,
    sttEngine: "whisper",
    ttsEngine: "piper",
  },
  tokenBudget: {
    maxPerRequest: 100_000,
    maxPerSession: 500_000,
    maxPerDay: 2_000_000,
  },
};

// ─── Load / Save ────────────────────────────────────────────

export function loadWorkspace(runtimeDir: string): WorkspaceConfig {
  const path = resolve(runtimeDir, "workspace.yaml");
  const loaded = readYaml<Partial<WorkspaceConfig>>(path);
  if (!loaded) return { ...DEFAULT_WORKSPACE };

  return {
    ...DEFAULT_WORKSPACE,
    ...loaded,
    agents: { ...DEFAULT_WORKSPACE.agents, ...loaded.agents },
    collaboration: { ...DEFAULT_WORKSPACE.collaboration, ...loaded.collaboration },
    models: { ...DEFAULT_WORKSPACE.models, ...loaded.models },
    voice: { ...DEFAULT_WORKSPACE.voice, ...loaded.voice },
    tokenBudget: { ...DEFAULT_WORKSPACE.tokenBudget, ...loaded.tokenBudget },
  };
}

export function saveWorkspace(runtimeDir: string, config: WorkspaceConfig): void {
  ensureDir(runtimeDir);
  const path = resolve(runtimeDir, "workspace.yaml");
  writeYaml(path, config);
  log.info("Workspace config saved");
}

export function getDefaultWorkspace(): WorkspaceConfig {
  return { ...DEFAULT_WORKSPACE };
}

// ─── Agent Registry ─────────────────────────────────────────

const AGENT_TYPES = new Map<string, AgentTypeConfig>();

export function registerAgentType(config: AgentTypeConfig): void {
  AGENT_TYPES.set(config.id, config);
}

export function getAgentType(id: string): AgentTypeConfig | undefined {
  return AGENT_TYPES.get(id);
}

export function getAllAgentTypes(): AgentTypeConfig[] {
  return Array.from(AGENT_TYPES.values());
}

/**
 * Load all agent type definitions.
 */
export async function loadAgentTypes(): Promise<void> {
  const types = await Promise.all([
    import("./types/coder.js"),
    import("./types/researcher.js"),
    import("./types/writer.js"),
    import("./types/devops.js"),
    import("./types/designer.js"),
    import("./types/data.js"),
    import("./types/security.js"),
    import("./types/planner.js"),
  ]);

  for (const mod of types) {
    registerAgentType(mod.default);
  }

  log.debug("Loaded %d agent type(s)", AGENT_TYPES.size);
}

/**
 * Get enabled agents based on workspace config.
 */
export function getEnabledAgents(
  workspace: WorkspaceConfig
): Array<AgentTypeConfig & { modelOverride?: string }> {
  const enabled: Array<AgentTypeConfig & { modelOverride?: string }> = [];

  for (const [id, agentConf] of Object.entries(workspace.agents)) {
    if (!agentConf.enabled) continue;
    const typeConfig = AGENT_TYPES.get(id);
    if (!typeConfig) continue;

    enabled.push({
      ...typeConfig,
      modelOverride: agentConf.model,
    });
  }

  return enabled;
}
