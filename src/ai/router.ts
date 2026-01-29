import type { WispyConfig } from "../config/schema.js";
import type { ThinkingLevel } from "./gemini.js";

export type TaskType =
  | "reasoning"
  | "planning"
  | "analysis"
  | "quick"
  | "classification"
  | "heartbeat"
  | "image_gen"
  | "embedding"
  | "voice";

interface ModelRoute {
  model: string;
  thinking: ThinkingLevel;
}

export function routeTask(
  taskType: TaskType,
  config: WispyConfig
): ModelRoute {
  const models = config.gemini.models;

  switch (taskType) {
    case "reasoning":
    case "planning":
    case "analysis":
      return { model: models.pro, thinking: "high" };

    case "quick":
    case "classification":
      return { model: models.flash, thinking: "minimal" };

    case "heartbeat":
      return { model: models.flash, thinking: "low" };

    case "image_gen":
      return { model: models.image, thinking: "none" };

    case "embedding":
      return { model: models.embedding, thinking: "none" };

    case "voice":
      return { model: "gemini-2.5-flash-native-audio", thinking: "none" };

    default:
      return { model: models.pro, thinking: "medium" };
  }
}
