import { resolve } from "path";
import { readMD } from "../utils/file.js";

export interface SoulFiles {
  soul: string;
  identity: string;
  agents: string;
  user: string;
  tools: string;
  heartbeat: string;
  context: string;
  boot: string;
  memory: string;
}

export function loadSoulFiles(soulDir: string): SoulFiles {
  return {
    soul: readMD(resolve(soulDir, "SOUL.md")) || "",
    identity: readMD(resolve(soulDir, "IDENTITY.md")) || "",
    agents: readMD(resolve(soulDir, "AGENTS.md")) || "",
    user: readMD(resolve(soulDir, "USER.md")) || "",
    tools: readMD(resolve(soulDir, "TOOLS.md")) || "",
    heartbeat: readMD(resolve(soulDir, "HEARTBEAT.md")) || "",
    context: readMD(resolve(soulDir, "CONTEXT.md")) || "",
    boot: readMD(resolve(soulDir, "BOOT.md")) || "",
    memory: readMD(resolve(soulDir, "MEMORY.md")) || "",
  };
}
