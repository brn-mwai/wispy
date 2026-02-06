/**
 * Skill Manager
 *
 * Handles skill installation, listing, and wizard-guided setup.
 * Skills are modular tool packages that extend Wispy's capabilities.
 */

import { resolve, join } from "path";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import chalk from "chalk";
import { createInterface } from "readline";

// ==================== SKILL CATALOG ====================

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  tools: string[];
  toolCount: number;
  badge: string;
  category: "ai" | "productivity" | "web3" | "media" | "automation" | "social";
  requires?: {
    env?: string[];
    packages?: string[];
    setup?: string;
  };
}

export const SKILL_CATALOG: SkillDefinition[] = [
  {
    id: "research",
    name: "Deep Research",
    description: "Multi-day research marathons with citation tracking. Web search, paper analysis, competitive intelligence, source verification.",
    tools: ["web_search", "web_fetch", "web_screenshot", "memory_store", "memory_search", "file_write"],
    toolCount: 6,
    badge: "Gemini + Vertex",
    category: "ai",
  },
  {
    id: "codegen",
    name: "Full-Stack Development",
    description: "Complete app development with React 19, Next.js 15, Node.js, Prisma, Docker. Scaffolding, testing, deployment.",
    tools: ["create_project", "file_write", "file_read", "bash", "run_dev_server", "scaffold_shadcn", "add_component"],
    toolCount: 18,
    badge: "Gemini 2.5",
    category: "productivity",
  },
  {
    id: "documents",
    name: "Document Creator",
    description: "Professional PDFs with LaTeX. Reports, whitepapers, charts (bar/line/pie), flowcharts, tables, and research reports.",
    tools: ["document_create", "document_chart", "document_flowchart", "document_table", "research_report", "latex_compile", "send_document_to_telegram"],
    toolCount: 9,
    badge: "Vertex AI",
    category: "productivity",
    requires: {
      packages: ["pdflatex or miktex"],
      setup: "LaTeX must be installed for PDF generation",
    },
  },
  {
    id: "web3",
    name: "Web3 & DeFi",
    description: "Wallet management, USDC balance on Base, x402 payments, ERC-8004 identity, on-chain registration.",
    tools: ["wallet_balance", "wallet_pay", "x402_fetch", "x402_balance", "erc8004_register", "erc8004_reputation", "erc8004_feedback", "erc8004_verify"],
    toolCount: 14,
    badge: "Gemini + Vertex",
    category: "web3",
  },
  {
    id: "browser",
    name: "Browser Automation",
    description: "Playwright-powered browsing. Navigate, click, type, screenshot, scroll, manage tabs. Form filling and data extraction.",
    tools: ["browser_navigate", "browser_click", "browser_type", "browser_screenshot", "browser_snapshot", "browser_scroll", "browser_tabs", "browser_new_tab", "browser_press_key"],
    toolCount: 10,
    badge: "Gemini 2.5",
    category: "automation",
  },
  {
    id: "cron",
    name: "Cron & Scheduling",
    description: "Schedule tasks with cron expressions. \"Daily at 9am\" natural language support. Reminders with one-time notifications.",
    tools: ["schedule_task", "remind_me", "list_reminders", "delete_reminder"],
    toolCount: 6,
    badge: "Vertex AI",
    category: "automation",
  },
  {
    id: "voice",
    name: "Voice AI",
    description: "Natural voice conversations. 400+ voices, 50+ languages. STT transcription, TTS synthesis, voice personas.",
    tools: ["voice_reply", "set_voice_mode", "natural_voice_reply"],
    toolCount: 5,
    badge: "Google Cloud",
    category: "ai",
    requires: {
      packages: ["gradio_client (pip install gradio_client)"],
      setup: "For Qwen3-TTS natural voice, install gradio_client",
    },
  },
  {
    id: "images",
    name: "Image Generation",
    description: "Generate and edit images from text prompts. Batch generation for consistent series. Project image packs.",
    tools: ["image_generate", "generate_project_images", "preview_and_screenshot", "send_image_to_chat"],
    toolCount: 4,
    badge: "Imagen 3",
    category: "media",
  },
  {
    id: "a2a",
    name: "A2A Protocol",
    description: "Agent-to-agent communication. Discover peers, delegate tasks, query capabilities, signed message exchange.",
    tools: ["a2a_discover", "a2a_delegate", "a2a_delegate_stream"],
    toolCount: 4,
    badge: "Google A2A",
    category: "ai",
  },
  {
    id: "content",
    name: "Content Creator",
    description: "Plan, write, and schedule social media content. Captions, hashtags, image prompts across platforms.",
    tools: ["plan_content", "write_caption", "schedule_post"],
    toolCount: 4,
    badge: "Multi-Platform",
    category: "social",
  },
  {
    id: "twitter",
    name: "X/Twitter Poster",
    description: "Post tweets and threads via Twitter API v2. Media attachments supported.",
    tools: ["post_tweet", "post_thread"],
    toolCount: 2,
    badge: "Twitter API v2",
    category: "social",
    requires: {
      env: ["TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_SECRET"],
      setup: "Twitter API v2 credentials required",
    },
  },
  {
    id: "chainlink",
    name: "Chainlink CRE",
    description: "Build Chainlink Runtime Environment workflows. DeFi monitoring, price alerts, trust bridges.",
    tools: ["cre_simulate", "cre_deploy"],
    toolCount: 2,
    badge: "Chainlink DON",
    category: "web3",
  },
];

// ==================== SKILL MANAGER ====================

export class SkillManager {
  private soulDir: string;
  private runtimeDir: string;

  constructor(soulDir: string, runtimeDir: string) {
    this.soulDir = soulDir;
    this.runtimeDir = runtimeDir;
  }

  /**
   * List all available skills with their installation status
   */
  listAvailable(): Array<SkillDefinition & { installed: boolean }> {
    return SKILL_CATALOG.map(skill => ({
      ...skill,
      installed: this.isInstalled(skill.id),
    }));
  }

  /**
   * Check if a skill is installed
   */
  isInstalled(skillId: string): boolean {
    const skillPath = resolve(this.soulDir, "skills", skillId);
    return existsSync(skillPath) || existsSync(resolve(skillPath + ".md"));
  }

  /**
   * Get skill by ID
   */
  getSkill(skillId: string): SkillDefinition | undefined {
    return SKILL_CATALOG.find(s => s.id === skillId);
  }

  /**
   * Install a skill with wizard-guided setup
   */
  async install(skillId: string): Promise<boolean> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      console.log(chalk.red(`\n  ✗ Unknown skill: ${skillId}`));
      console.log(chalk.dim(`  Available skills: ${SKILL_CATALOG.map(s => s.id).join(", ")}\n`));
      return false;
    }

    console.log(chalk.cyan(`\n  Installing: ${skill.name}`));
    console.log(chalk.dim(`  ${skill.description}\n`));

    // Check requirements
    if (skill.requires) {
      const requirementsMet = await this.checkRequirements(skill);
      if (!requirementsMet) {
        return false;
      }
    }

    // Create skill directory structure
    const skillDir = resolve(this.soulDir, "skills", skillId);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    // Generate SKILL.md file
    const skillContent = this.generateSkillMd(skill);
    writeFileSync(resolve(skillDir, "SKILL.md"), skillContent);

    // Save to installed skills registry
    this.saveInstalledSkill(skill);

    console.log(chalk.green(`  ✓ Installed: ${skill.name}`));
    console.log(chalk.dim(`  Tools: ${skill.tools.slice(0, 4).join(", ")}${skill.tools.length > 4 ? ` +${skill.tools.length - 4} more` : ""}`));
    console.log(chalk.dim(`  Location: ${skillDir}\n`));

    return true;
  }

  /**
   * Install all skills
   */
  async installAll(): Promise<void> {
    console.log(chalk.cyan.bold(`\n  Installing all ${SKILL_CATALOG.length} skills...\n`));

    let installed = 0;
    let failed = 0;

    for (const skill of SKILL_CATALOG) {
      const success = await this.install(skill.id);
      if (success) {
        installed++;
      } else {
        failed++;
      }
    }

    console.log(chalk.green(`\n  ✓ Installed: ${installed} skills`));
    if (failed > 0) {
      console.log(chalk.yellow(`  ○ Skipped: ${failed} skills (missing requirements)`));
    }
    console.log();
  }

  /**
   * Check skill requirements and guide user through setup
   */
  private async checkRequirements(skill: SkillDefinition): Promise<boolean> {
    if (!skill.requires) return true;

    let allMet = true;

    // Check environment variables
    if (skill.requires.env) {
      const missing = skill.requires.env.filter(env => !process.env[env]);
      if (missing.length > 0) {
        console.log(chalk.yellow(`  ⚠ Missing environment variables:`));
        for (const env of missing) {
          console.log(chalk.dim(`    • ${env}`));
        }
        console.log();
        allMet = false;
      }
    }

    // Show package requirements
    if (skill.requires.packages) {
      console.log(chalk.blue(`  ℹ Required packages:`));
      for (const pkg of skill.requires.packages) {
        console.log(chalk.dim(`    • ${pkg}`));
      }
      console.log();
    }

    // Show setup instructions
    if (skill.requires.setup) {
      console.log(chalk.blue(`  ℹ Setup: ${skill.requires.setup}`));
      console.log();
    }

    if (!allMet) {
      console.log(chalk.yellow(`  Installing anyway - skill will prompt for setup when used.\n`));
    }

    return true; // Install anyway, will prompt at runtime
  }

  /**
   * Generate SKILL.md content
   */
  private generateSkillMd(skill: SkillDefinition): string {
    return `# ${skill.name}

${skill.description}

## Badge
${skill.badge}

## Tools
${skill.tools.map(t => `### ${t}`).join("\n\n")}

## Requirements
${skill.requires?.setup || "No special requirements."}

${skill.requires?.env ? `### Environment Variables\n${skill.requires.env.map(e => `- \`${e}\``).join("\n")}` : ""}

${skill.requires?.packages ? `### Packages\n${skill.requires.packages.map(p => `- ${p}`).join("\n")}` : ""}
`;
  }

  /**
   * Save installed skill to registry
   */
  private saveInstalledSkill(skill: SkillDefinition): void {
    const registryPath = resolve(this.runtimeDir, "skills", "registry.json");
    const registryDir = resolve(this.runtimeDir, "skills");

    if (!existsSync(registryDir)) {
      mkdirSync(registryDir, { recursive: true });
    }

    let registry: Record<string, { installedAt: string; version: string }> = {};
    if (existsSync(registryPath)) {
      try {
        registry = JSON.parse(require("fs").readFileSync(registryPath, "utf-8"));
      } catch {
        registry = {};
      }
    }

    registry[skill.id] = {
      installedAt: new Date().toISOString(),
      version: "1.0.0",
    };

    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Remove a skill
   */
  remove(skillId: string): boolean {
    const skillDir = resolve(this.soulDir, "skills", skillId);
    if (!existsSync(skillDir)) {
      console.log(chalk.yellow(`\n  ○ Skill not installed: ${skillId}\n`));
      return false;
    }

    // Remove directory
    const fs = require("fs");
    fs.rmSync(skillDir, { recursive: true, force: true });

    console.log(chalk.green(`\n  ✓ Removed: ${skillId}\n`));
    return true;
  }

  /**
   * Display skill info
   */
  info(skillId: string): void {
    const skill = this.getSkill(skillId);
    if (!skill) {
      console.log(chalk.red(`\n  ✗ Unknown skill: ${skillId}\n`));
      return;
    }

    const installed = this.isInstalled(skillId);

    console.log(chalk.cyan.bold(`\n  ${skill.name}`));
    console.log(chalk.dim(`  ${skill.badge} • ${skill.toolCount} tools\n`));
    console.log(`  ${skill.description}\n`);
    console.log(chalk.dim("  Tools:"));
    for (const tool of skill.tools) {
      console.log(chalk.dim(`    • ${tool}`));
    }
    console.log();

    if (skill.requires) {
      if (skill.requires.setup) {
        console.log(chalk.blue(`  Setup: ${skill.requires.setup}`));
      }
      if (skill.requires.env) {
        console.log(chalk.dim(`  Env: ${skill.requires.env.join(", ")}`));
      }
      console.log();
    }

    console.log(`  Status: ${installed ? chalk.green("✓ Installed") : chalk.dim("○ Not installed")}`);
    if (!installed) {
      console.log(chalk.dim(`  Run: wispy skill add ${skillId}`));
    }
    console.log();
  }
}

// ==================== CLI DISPLAY HELPERS ====================

export function displaySkillCatalog(): void {
  console.log(chalk.cyan.bold(`\n  Skills`));
  console.log(chalk.dim(`  ${SKILL_CATALOG.length} modular skills with ${SKILL_CATALOG.reduce((acc, s) => acc + s.toolCount, 0)} tools. Install only what you need.\n`));

  const categories = new Map<string, SkillDefinition[]>();
  for (const skill of SKILL_CATALOG) {
    const list = categories.get(skill.category) || [];
    list.push(skill);
    categories.set(skill.category, list);
  }

  for (const [category, skills] of categories) {
    console.log(chalk.white.bold(`  ${category.toUpperCase()}`));
    for (const skill of skills) {
      console.log(`    ${chalk.cyan(skill.name.padEnd(24))} ${chalk.dim(skill.badge.padEnd(16))} ${chalk.dim(`${skill.toolCount} tools`)}`);
      console.log(chalk.dim(`      ${skill.description.slice(0, 70)}...`));
    }
    console.log();
  }

  console.log(chalk.dim("  Commands:"));
  console.log(chalk.green("    wispy skill add <name>") + chalk.dim("     Install a skill"));
  console.log(chalk.green("    wispy skill add --all") + chalk.dim("      Install all skills"));
  console.log(chalk.green("    wispy skill info <name>") + chalk.dim("    View skill details"));
  console.log(chalk.green("    wispy skill remove <name>") + chalk.dim("  Remove a skill"));
  console.log();
}
