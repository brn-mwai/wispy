import { embed } from "./gemini.js";
import type { WispyConfig } from "../config/schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("embeddings");

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Rate limiting: track last embedding call
let lastEmbedTime = 0;
const MIN_EMBED_INTERVAL_MS = 200; // At least 200ms between calls (5 req/sec max)

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embed with retry and rate limiting
 */
async function embedWithRetry(
  model: string,
  texts: string[],
  retryCount = 0
): Promise<number[][]> {
  // Rate limiting
  const now = Date.now();
  const timeSinceLast = now - lastEmbedTime;
  if (timeSinceLast < MIN_EMBED_INTERVAL_MS) {
    await sleep(MIN_EMBED_INTERVAL_MS - timeSinceLast);
  }
  lastEmbedTime = Date.now();

  try {
    return await embed(model, texts);
  } catch (err: any) {
    // Handle rate limit errors with exponential backoff
    if (err.status === 429 && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
      log.warn("Embedding rate limited, retrying in %dms (attempt %d/%d)", delay, retryCount + 1, MAX_RETRIES);
      await sleep(delay);
      return embedWithRetry(model, texts, retryCount + 1);
    }

    // Re-throw if not a rate limit or max retries exceeded
    throw err;
  }
}

export async function embedTexts(
  texts: string[],
  config: WispyConfig
): Promise<number[][]> {
  const model = config.gemini.models.embedding;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    log.debug("Embedding batch %d-%d of %d", i, i + batch.length, texts.length);
    const embeddings = await embedWithRetry(model, batch);
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
