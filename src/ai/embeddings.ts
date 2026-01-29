import { embed } from "./gemini.js";
import type { WispyConfig } from "../config/schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("embeddings");

const BATCH_SIZE = 100;

export async function embedTexts(
  texts: string[],
  config: WispyConfig
): Promise<number[][]> {
  const model = config.gemini.models.embedding;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    log.debug("Embedding batch %d-%d of %d", i, i + batch.length, texts.length);
    const embeddings = await embed(model, batch);
    results.push(...embeddings);
  }

  return results;
}

export async function embedSingle(
  text: string,
  config: WispyConfig
): Promise<number[]> {
  const [embedding] = await embedTexts([text], config);
  return embedding;
}
