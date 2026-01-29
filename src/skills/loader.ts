import { readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { readMD } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("skill-loader");

export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  author?: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  requires?: {
    env?: string[];
    bins?: string[];
  };
}

export function loadSkills(soulDir: string): SkillManifest[] {
  const skillsDir = resolve(soulDir, "skills");
  if (!existsSync(skillsDir)) return [];

  const skills: SkillManifest[] = [];
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const skillPath = resolve(skillsDir, dir.name, "SKILL.md");
    const content = readMD(skillPath);
    if (!content) continue;

    try {
      const manifest = parseSkillMd(content, dir.name);
      skills.push(manifest);
      log.info("Loaded skill: %s", manifest.name);
    } catch (err) {
      log.warn("Failed to parse skill %s: %s", dir.name, err);
    }
  }

  return skills;
}

function parseSkillMd(content: string, dirName: string): SkillManifest {
  // Parse frontmatter-style SKILL.md
  const lines = content.split("\n");
  const manifest: SkillManifest = {
    name: dirName,
    description: "",
    version: "0.1.0",
    tools: [],
  };

  let inTools = false;
  let currentTool: Record<string, unknown> | null = null;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      manifest.name = line.slice(2).trim();
    } else if (line.startsWith("## Description")) {
      // Next non-empty line is description
    } else if (line.startsWith("## Tools")) {
      inTools = true;
    } else if (inTools && line.startsWith("### ")) {
      if (currentTool) manifest.tools.push(currentTool as any);
      currentTool = { name: line.slice(4).trim(), description: "", parameters: {} };
    } else if (currentTool && line.trim() && !line.startsWith("#")) {
      if (!currentTool.description) {
        currentTool.description = line.trim();
      }
    } else if (!line.startsWith("#") && line.trim() && !inTools && !manifest.description) {
      manifest.description = line.trim();
    }
  }

  if (currentTool) manifest.tools.push(currentTool as any);

  return manifest;
}
