import { GoogleGenAI } from "@google/genai";
import { createLogger } from "../infra/logger.js";

const log = createLogger("gemini");

let client: GoogleGenAI | null = null;

// Models that support native function calling
const NATIVE_TOOL_MODELS = new Set([
  // Gemini 3 (latest)
  "gemini-3-pro",
  "gemini-3-flash",
  "gemini-3.0-pro",
  "gemini-3.0-flash",
  // Gemini 2.5
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro-preview",
  "gemini-2.5-flash-preview",
  // Gemini 2.0
  "gemini-2.0-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash-thinking-exp",
  "gemini-2.0-flash-lite",
  // Gemini 1.5
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-pro",
  // Nano models (lightweight)
  "gemini-nano",
  "gemini-1.0-pro",
]);

// Image generation models
const IMAGE_MODELS = new Set([
  "imagen-3.0-generate-002",
  "imagen-3.0-generate-001",
  "imagen-3",
  "imagegeneration",
]);

// Check if model supports native function calling
function supportsNativeTools(model: string): boolean {
  // Check exact match or prefix match
  for (const supported of NATIVE_TOOL_MODELS) {
    if (model === supported || model.startsWith(supported)) {
      return true;
    }
  }
  return false;
}

// Build tool description for prompt-based calling (works for ALL models)
function buildToolPrompt(tools: unknown[]): string {
  const declarations = (tools[0] as any)?.functionDeclarations || [];
  if (declarations.length === 0) return "";

  let prompt = `

## 🛠️ TOOL SYSTEM - YOU ARE AN AUTONOMOUS AGENT

You have REAL tools that execute actions. You are not just chatting - you can DO things.

### HOW TO USE TOOLS

When you want to perform an action, respond with EXACTLY this JSON format:

\`\`\`json
{"tool": "tool_name", "args": {"param": "value"}}
\`\`\`

IMPORTANT RULES:
1. Use ONE tool at a time
2. Wait for the tool result before using another tool
3. The system will execute your tool and show you the result
4. You can chain multiple tools to accomplish complex tasks
5. Always use tools when the user asks you to DO something (create files, run commands, search, etc.)

### AVAILABLE TOOLS

`;

  for (const tool of declarations) {
    prompt += `**${tool.name}** — ${tool.description}\n`;
    if (tool.parameters?.properties) {
      prompt += "```\n";
      const params: string[] = [];
      for (const [key, val] of Object.entries(tool.parameters.properties)) {
        const v = val as any;
        const req = tool.parameters.required?.includes(key) ? "*" : "";
        params.push(`  "${key}${req}": "${v.description}"`);
      }
      prompt += `{"tool": "${tool.name}", "args": {\n${params.join(",\n")}\n}}\n\`\`\`\n\n`;
    } else {
      prompt += `\`\`\`\n{"tool": "${tool.name}", "args": {}}\n\`\`\`\n\n`;
    }
  }

  prompt += `
### EXAMPLES

**Create a file:**
\`\`\`json
{"tool": "file_write", "args": {"path": "/path/to/file.txt", "content": "Hello World"}}
\`\`\`

**Run a command:**
\`\`\`json
{"tool": "bash", "args": {"command": "ls -la"}}
\`\`\`

**Read a file:**
\`\`\`json
{"tool": "file_read", "args": {"path": "/path/to/file.txt"}}
\`\`\`

**Search the web:**
\`\`\`json
{"tool": "web_search", "args": {"query": "latest news"}}
\`\`\`

BE PROACTIVE: If the user asks you to do something, USE THE TOOLS. Don't just describe what you would do.
`;
  return prompt;
}

// Parse tool calls from model output (for non-native models)
// This is robust and handles many output formats from different models
function parseToolCalls(text: string): { name: string; args: Record<string, unknown> }[] {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const seenTools = new Set<string>();

  // Strategy 1: Match JSON in code blocks (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const content = match[1].trim();
      // Try to find JSON object in the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool && typeof parsed.tool === "string" && !seenTools.has(parsed.tool + JSON.stringify(parsed.args || {}))) {
          seenTools.add(parsed.tool + JSON.stringify(parsed.args || {}));
          calls.push({
            name: parsed.tool,
            args: parsed.args || {},
          });
        }
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  // Strategy 2: Match standalone JSON objects with "tool" key
  const jsonObjectRegex = /\{\s*"tool"\s*:\s*"([^"]+)"/g;
  while ((match = jsonObjectRegex.exec(text)) !== null) {
    try {
      // Find the complete JSON object by tracking braces
      let depth = 0;
      let start = match.index;
      let end = start;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
      const jsonStr = text.slice(start, end);
      const parsed = JSON.parse(jsonStr);
      const key = parsed.tool + JSON.stringify(parsed.args || {});
      if (parsed.tool && typeof parsed.tool === "string" && !seenTools.has(key)) {
        seenTools.add(key);
        calls.push({
          name: parsed.tool,
          args: parsed.args || {},
        });
      }
    } catch {
      // Skip invalid
    }
  }

  // Strategy 3: Check for tool names mentioned without proper JSON (helps with debugging)
  if (calls.length === 0) {
    const knownTools = [
      "bash", "file_read", "file_write", "file_search", "list_directory",
      "web_fetch", "web_search", "memory_search", "memory_save",
      "send_message", "schedule_task", "image_generate", "wallet_balance", "wallet_pay"
    ];

    for (const tool of knownTools) {
      // Check for patterns like "Using file_write:" or "I'll execute bash"
      const patterns = [
        new RegExp(`(?:using|execute|run|call)\\s+${tool}`, "i"),
        new RegExp(`${tool}\\s*\\(`, "i"),
        new RegExp(`tool:\\s*["']?${tool}["']?`, "i"),
      ];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          log.debug("Model tried to use '%s' but didn't format JSON correctly", tool);
          break;
        }
      }
    }
  }

  return calls;
}

export function initGemini(apiKey: string): GoogleGenAI {
  client = new GoogleGenAI({ apiKey });
  log.info("Gemini SDK initialized");
  return client;
}

export function getClient(): GoogleGenAI {
  if (!client) throw new Error("Gemini not initialized. Call initGemini() first.");
  return client;
}

export type ThinkingLevel = "none" | "minimal" | "low" | "medium" | "high" | "ultra";

export interface GenerateOptions {
  model: string;
  systemPrompt?: string;
  messages: Array<{ role: "user" | "model"; content: string }>;
  tools?: unknown[];
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  maxTokens?: number;
}

export async function generate(opts: GenerateOptions): Promise<{
  text: string;
  thinking?: string;
  toolCalls?: unknown[];
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const ai = getClient();
  const useNativeTools = supportsNativeTools(opts.model);

  // Build system prompt with tool descriptions for non-native models
  let systemPrompt = opts.systemPrompt || "";
  if (opts.tools && opts.tools.length > 0 && !useNativeTools) {
    systemPrompt += buildToolPrompt(opts.tools);
    log.debug("Using prompt-based tools for model: %s", opts.model);
  }

  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const config: Record<string, unknown> = {};
  if (opts.temperature !== undefined) config.temperature = opts.temperature;
  if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;

  if (opts.thinkingLevel && opts.thinkingLevel !== "none") {
    config.thinkingConfig = { thinkingBudget: thinkingBudget(opts.thinkingLevel) };
  }

  // Only use native tools for supported models
  if (opts.tools && opts.tools.length > 0 && useNativeTools) {
    config.tools = opts.tools;
  }

  const response = await ai.models.generateContent({
    model: opts.model,
    contents,
    config: {
      ...config,
      systemInstruction: systemPrompt,
    },
  });

  const text = response.text || "";
  let thinking: string | undefined;
  const toolCalls: unknown[] = [];

  // Extract thinking and tool calls from parts (native function calling)
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if ((part as any).thought) {
        thinking = (part as any).text;
      }
      if ((part as any).functionCall) {
        toolCalls.push((part as any).functionCall);
      }
    }
  }

  // For non-native models, parse tool calls from text output
  if (!useNativeTools && opts.tools && opts.tools.length > 0) {
    const parsedCalls = parseToolCalls(text);
    if (parsedCalls.length > 0) {
      log.debug("Parsed %d tool call(s) from text output", parsedCalls.length);
      toolCalls.push(...parsedCalls);
    }
  }

  return {
    text,
    thinking,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: response.usageMetadata
      ? {
          inputTokens: response.usageMetadata.promptTokenCount || 0,
          outputTokens: response.usageMetadata.candidatesTokenCount || 0,
        }
      : undefined,
  };
}

export async function* generateStream(opts: GenerateOptions): AsyncGenerator<{
  type: "text" | "thinking" | "tool_call" | "done";
  content: string;
}> {
  const ai = getClient();

  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const config: Record<string, unknown> = {};
  if (opts.temperature !== undefined) config.temperature = opts.temperature;
  if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;
  if (opts.thinkingLevel && opts.thinkingLevel !== "none") {
    config.thinkingConfig = { thinkingBudget: thinkingBudget(opts.thinkingLevel) };
  }

  const response = await ai.models.generateContentStream({
    model: opts.model,
    contents,
    config: {
      ...config,
      systemInstruction: opts.systemPrompt,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield { type: "text", content: chunk.text };
    }
    // Check for thinking parts
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if ((part as any).thought && (part as any).text) {
          yield { type: "thinking", content: (part as any).text };
        }
      }
    }
  }

  yield { type: "done", content: "" };
}

export async function embed(
  model: string,
  texts: string[]
): Promise<number[][]> {
  const ai = getClient();
  const result = await ai.models.embedContent({
    model,
    contents: texts.map((t) => ({ parts: [{ text: t }] })),
  });
  // Return embeddings
  return (result as any).embeddings?.map((e: any) => e.values) || [];
}

/**
 * Generate an image using Imagen 3 or Gemini's image generation.
 */
export async function generateImage(
  prompt: string,
  options: {
    model?: string;
    aspectRatio?: string;
    numberOfImages?: number;
  } = {}
): Promise<{ images: Array<{ base64: string; mimeType: string }> }> {
  const ai = getClient();
  const model = options.model || "imagen-3.0-generate-002";

  try {
    // Try Imagen API first
    const response = await ai.models.generateImages({
      model,
      prompt,
      config: {
        numberOfImages: options.numberOfImages || 1,
        aspectRatio: options.aspectRatio || "1:1",
      },
    });

    const images = (response as any).generatedImages?.map((img: any) => ({
      base64: img.image?.imageBytes || "",
      mimeType: "image/png",
    })) || [];

    return { images };
  } catch (err) {
    // Fallback: use Gemini with image output
    log.debug("Imagen failed, trying Gemini multimodal: %s", err);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{
        role: "user",
        parts: [{ text: `Generate an image: ${prompt}` }]
      }],
      config: {
        responseModalities: ["image", "text"],
      },
    });

    // Extract image from response if available
    const parts = response.candidates?.[0]?.content?.parts || [];
    const images = parts
      .filter((p: any) => p.inlineData?.mimeType?.startsWith("image/"))
      .map((p: any) => ({
        base64: p.inlineData.data,
        mimeType: p.inlineData.mimeType,
      }));

    return { images };
  }
}

/**
 * List available models from the API.
 */
export async function listModels(): Promise<string[]> {
  const ai = getClient();
  try {
    const response = await ai.models.list();
    return (response as any).models?.map((m: any) => m.name) || [];
  } catch {
    return [];
  }
}

function thinkingBudget(level: ThinkingLevel): number {
  switch (level) {
    case "minimal": return 128;
    case "low": return 1024;
    case "medium": return 4096;
    case "high": return 16384;
    case "ultra": return 65536; // Maximum thinking for complex planning
    default: return 0;
  }
}

/**
 * Generate with explicit thinking level - convenience wrapper for Marathon Agent
 * Uses Gemini 3's thinking budget feature for deep reasoning
 */
export async function generateWithThinking(
  prompt: string,
  thinkingLevel: ThinkingLevel,
  apiKey: string,
  model: string = "gemini-3-pro"
): Promise<string> {
  // Initialize client if needed
  if (!client) {
    initGemini(apiKey);
  }

  const result = await generate({
    model,
    messages: [{ role: "user", content: prompt }],
    thinkingLevel,
    maxTokens: 32768, // Allow longer outputs for complex plans
  });

  return result.text;
}
