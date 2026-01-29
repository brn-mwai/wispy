import { generate } from "../ai/gemini.js";
import type { WispyConfig } from "../config/schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("content-pipeline");

export interface ContentPlan {
  topic: string;
  posts: Array<{
    caption: string;
    imagePrompt: string;
    hashtags: string[];
  }>;
}

export async function generateContentPlan(
  topic: string,
  postCount: number,
  config: WispyConfig
): Promise<ContentPlan> {
  const result = await generate({
    model: config.gemini.models.pro,
    thinkingLevel: "high",
    messages: [
      {
        role: "user",
        content: `Create a content plan for ${postCount} social media posts about: "${topic}".
For each post, provide:
1. A compelling caption (under 280 chars)
2. An image generation prompt (detailed, visual description)
3. 3-5 relevant hashtags

Respond in JSON format:
{
  "topic": "...",
  "posts": [
    { "caption": "...", "imagePrompt": "...", "hashtags": ["..."] }
  ]
}`,
      },
    ],
  });

  try {
    // Extract JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    log.error({ err }, "Failed to parse content plan");
  }

  return { topic, posts: [] };
}

export async function generateImage(
  prompt: string,
  config: WispyConfig
): Promise<string | null> {
  try {
    const result = await generate({
      model: config.gemini.models.image,
      messages: [{ role: "user", content: prompt }],
      thinkingLevel: "none",
    });
    // Image generation returns base64 in inlineData
    // This depends on the actual Gemini 3 image gen API response format
    return result.text || null;
  } catch (err) {
    log.error({ err }, "Image generation failed");
    return null;
  }
}
