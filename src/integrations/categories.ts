/**
 * Integration category definitions and metadata.
 */

import type { IntegrationCategory } from "./base.js";

export interface CategoryInfo {
  id: IntegrationCategory;
  name: string;
  description: string;
  icon: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "google",
    name: "Google",
    description: "Google Workspace and Cloud products",
    icon: "G",
  },
  {
    id: "chat",
    name: "Chat Providers",
    description: "Messaging platforms and chat apps",
    icon: "C",
  },
  {
    id: "ai-models",
    name: "AI Models",
    description: "Cloud and local AI model providers",
    icon: "A",
  },
  {
    id: "productivity",
    name: "Productivity",
    description: "Notes, tasks, code, and project management",
    icon: "P",
  },
  {
    id: "music",
    name: "Music & Audio",
    description: "Music playback and audio services",
    icon: "M",
  },
  {
    id: "smart-home",
    name: "Smart Home",
    description: "Home automation and IoT devices",
    icon: "H",
  },
  {
    id: "tools",
    name: "Tools & Automation",
    description: "Browser control, webhooks, utilities",
    icon: "T",
  },
  {
    id: "media",
    name: "Media & Creative",
    description: "Images, screenshots, creative tools",
    icon: "X",
  },
  {
    id: "social",
    name: "Social",
    description: "Social media and email",
    icon: "S",
  },
  {
    id: "built-in",
    name: "Built-in",
    description: "Core Wispy tools (always available)",
    icon: "W",
  },
];

export function getCategoryInfo(id: IntegrationCategory): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
