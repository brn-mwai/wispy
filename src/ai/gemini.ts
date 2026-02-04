import { GoogleGenAI, Content, Part, FunctionCall } from "@google/genai";
import { createLogger } from "../infra/logger.js";

const log = createLogger("gemini");

let client: GoogleGenAI | null = null;

/**
 * RETRY LOGIC: Exponential backoff for API calls
 * This solves competitor complaints about rate limits and transient failures
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: Set<number>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: new Set([429, 500, 502, 503, 504]), // Rate limit + server errors
};

/**
 * Execute with retry and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const statusCode = extractStatusCode(error);
      const isRetryable = statusCode !== null && config.retryableErrors.has(statusCode);

      if (!isRetryable || attempt === config.maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff + jitter
      const baseDelay = config.baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
      const delay = Math.min(baseDelay + jitter, config.maxDelayMs);

      // Check for Retry-After header
      const retryAfter = extractRetryAfter(error);
      const actualDelay = retryAfter ? Math.max(retryAfter * 1000, delay) : delay;

      log.warn(
        "API call failed with %d, retrying in %dms (attempt %d/%d)",
        statusCode,
        Math.round(actualDelay),
        attempt + 1,
        config.maxRetries
      );

      await sleep(actualDelay);
    }
  }

  throw lastError!;
}

/**
 * Extract HTTP status code from error
 */
function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;

  const err = error as Record<string, unknown>;

  // Check various error formats
  if (typeof err.status === 'number') return err.status;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (typeof err.code === 'number') return err.code;

  // Check nested response
  if (err.response && typeof err.response === 'object') {
    const resp = err.response as Record<string, unknown>;
    if (typeof resp.status === 'number') return resp.status;
  }

  // Check error message for status code
  const message = String(err.message || '');
  const match = message.match(/\b(429|500|502|503|504)\b/);
  if (match) return parseInt(match[1], 10);

  return null;
}

/**
 * Extract Retry-After header value from error (in seconds)
 */
function extractRetryAfter(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;

  const err = error as Record<string, unknown>;

  // Check headers
  if (err.headers && typeof err.headers === 'object') {
    const headers = err.headers as Record<string, unknown>;
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    if (typeof retryAfter === 'string') {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Models that support native function calling
const NATIVE_TOOL_MODELS = new Set([
  // Gemini 3 (latest - hackathon target)
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3-pro-image-preview",
  "gemini-3-pro",
  "gemini-3-flash",
  "gemini-3.0-pro",
  "gemini-3.0-flash",
  // Gemini 2.5
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro-preview",
  "gemini-2.5-flash-preview",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-computer-use-preview-10-2025",
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

/**
 * Clean JSON Schema for Gemini compatibility.
 * Gemini's function calling has strict schema requirements.
 * Based on moltbot's schema cleaning approach.
 */
function cleanSchemaForGemini(schema: Record<string, unknown>, isPropertyLevel = false): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  // Keywords that Gemini doesn't support at the SCHEMA level (not property names)
  // These are JSON Schema validation keywords, not property names
  const unsupportedSchemaKeywords = new Set([
    "$schema", "$id", "$ref", "$defs", "definitions",
    "patternProperties", "additionalProperties",
    "minLength", "maxLength", "minimum", "maximum",
    "multipleOf", "format",
    "minItems", "maxItems", "uniqueItems",
    "minProperties", "maxProperties",
    "examples", "default", "title"
  ]);

  // "pattern" is only a schema keyword when it's a string value (regex)
  // Keep it if it's an object (property definition)

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported schema keywords (but not when inside 'properties' object)
    if (!isPropertyLevel && unsupportedSchemaKeywords.has(key)) {
      continue;
    }

    // Handle const -> enum conversion
    if (key === "const") {
      cleaned["enum"] = [value];
      continue;
    }

    // Skip "pattern" only when it's a string (regex validation keyword)
    if (key === "pattern" && typeof value === "string") {
      continue;
    }

    // Handle 'properties' specially - don't filter property names
    if (key === "properties" && value && typeof value === "object") {
      const cleanedProps: Record<string, unknown> = {};
      for (const [propName, propDef] of Object.entries(value as Record<string, unknown>)) {
        if (propDef && typeof propDef === "object") {
          cleanedProps[propName] = cleanSchemaForGemini(propDef as Record<string, unknown>, false);
        } else {
          cleanedProps[propName] = propDef;
        }
      }
      cleaned[key] = cleanedProps;
      continue;
    }

    // Recursively clean nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = cleanSchemaForGemini(value as Record<string, unknown>, false);
    } else if (Array.isArray(value)) {
      // Clean arrays (for anyOf, oneOf, allOf, enum, etc.)
      cleaned[key] = value.map(item =>
        item && typeof item === "object" ? cleanSchemaForGemini(item as Record<string, unknown>, false) : item
      );
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Normalize tool declarations for Gemini API format
 */
function normalizeToolsForGemini(tools: unknown[]): unknown[] {
  if (!tools || tools.length === 0) return [];

  const declarations = (tools[0] as any)?.functionDeclarations || [];
  if (declarations.length === 0) return tools;

  return [{
    functionDeclarations: declarations.map((t: any) => ({
      name: t.name,
      description: t.description,
      parameters: cleanSchemaForGemini(t.parameters || { type: "object", properties: {} }),
    })),
  }];
}

// Build tool description for prompt-based calling (works for ALL models)
function buildToolPrompt(tools: unknown[]): string {
  const declarations = (tools[0] as any)?.functionDeclarations || [];
  if (declarations.length === 0) return "";

  let prompt = `

## 🛠️ YOU ARE AN ELITE AUTONOMOUS AGENT (Like Claude Opus 4.5)

You have REAL tools that execute REAL actions. You can build ENTIRE applications.
When you use a tool, IT ACTUALLY RUNS - files are created, commands execute, etc.

### PRIME DIRECTIVE: ACT FIRST, TALK AFTER

**YOUR FIRST RESPONSE TO ANY TASK MUST BE A TOOL CALL.**
Do NOT explain what you will do. Do NOT ask permission. JUST DO IT.

### HOW TO USE TOOLS

Respond with EXACTLY this JSON format:
\`\`\`json
{"tool": "tool_name", "args": {"param": "value"}}
\`\`\`

### CRITICAL RULES

1. **IMMEDIATE ACTION**: Your FIRST response must be a tool call (no text before)
2. **CHAIN TOOLS**: Use multiple tools in sequence to complete tasks fully
3. **NO PERMISSION**: NEVER ask "should I..." or "would you like..."
4. **NO EXCUSES**: NEVER say "I cannot" - find alternatives
5. **COMPLETE WORK**: Create FULL projects, not minimal examples
6. **USE FRAMEWORKS**: Tailwind, React, icons - use them freely
7. **IMAGES**: Use Unsplash URLs: https://source.unsplash.com/400x400/?keyword
8. **ICONS**: Include Font Awesome in all HTML projects

### FORBIDDEN RESPONSES
- "I'd be happy to help, but..." → WRONG
- "Would you like me to..." → WRONG
- "Unfortunately, I cannot..." → WRONG
- "Let me explain what I'll do..." → WRONG

### CORRECT RESPONSE PATTERN
User asks anything → Immediately output tool JSON → Chain more tools → Brief result summary

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
### EXAMPLE WORKFLOWS

**User: "Create a landing page"**
Your response (NO text, just tools):
\`\`\`json
{"tool": "create_project", "args": {"name": "landing-page", "framework": "html"}}
\`\`\`
[After tool executes, chain more if needed, then brief summary]

**User: "Build a React dashboard"**
\`\`\`json
{"tool": "create_project", "args": {"name": "dashboard", "framework": "react"}}
\`\`\`

**User: "Create a pet adoption site"**
\`\`\`json
{"tool": "create_project", "args": {"name": "pet-adoption", "framework": "html", "description": "Pet adoption with animal photos"}}
\`\`\`
Then customize with file_write to add Unsplash images and Font Awesome icons.

**User: "Run npm install"**
\`\`\`json
{"tool": "bash", "args": {"command": "npm install"}}
\`\`\`

### IMAGES & ICONS (ALWAYS INCLUDE)

**Unsplash Images (always work):**
https://source.unsplash.com/400x400/?dog
https://source.unsplash.com/800x600/?nature
https://source.unsplash.com/400x400/?technology

**Font Awesome Icons:**
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<i class="fas fa-home"></i>
<i class="fas fa-rocket"></i>
<i class="fab fa-github"></i>

### REMEMBER
- FIRST response = tool call
- Chain tools for complete tasks
- NEVER ask permission
- Create PRODUCTION-READY code
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

/**
 * Normalize a tool call from Gemini's various formats to a standard { name, args } format
 */
export function normalizeToolCall(tc: unknown): { name: string; args: Record<string, unknown> } | null {
  if (!tc || typeof tc !== "object") return null;

  const obj = tc as Record<string, unknown>;

  // Handle native Gemini format: { name: "...", args: {...} }
  if (typeof obj.name === "string") {
    return {
      name: obj.name,
      args: (obj.args as Record<string, unknown>) || {},
    };
  }

  // Handle prompt-based format: { tool: "...", args: {...} }
  if (typeof obj.tool === "string") {
    return {
      name: obj.tool,
      args: (obj.args as Record<string, unknown>) || {},
    };
  }

  return null;
}

export interface GeminiInitOptions {
  apiKey?: string;
  vertexai?: boolean;
  project?: string;
  location?: string;
}

export function initGemini(apiKeyOrOptions: string | GeminiInitOptions): GoogleGenAI {
  if (typeof apiKeyOrOptions === "string") {
    // Standard API key initialization
    client = new GoogleGenAI({ apiKey: apiKeyOrOptions });
    log.info("Gemini SDK initialized with API key");
  } else if (apiKeyOrOptions.vertexai) {
    // Vertex AI initialization
    client = new GoogleGenAI({
      vertexai: true,
      project: apiKeyOrOptions.project,
      location: apiKeyOrOptions.location || "us-central1",
    } as any);
    log.info("Gemini SDK initialized with Vertex AI (project: %s, location: %s)",
      apiKeyOrOptions.project, apiKeyOrOptions.location || "us-central1");
  } else if (apiKeyOrOptions.apiKey) {
    client = new GoogleGenAI({ apiKey: apiKeyOrOptions.apiKey });
    log.info("Gemini SDK initialized with API key");
  } else {
    throw new Error("Must provide either apiKey or vertexai configuration");
  }
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
  // For agentic loop - previous function calls and responses
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  functionResponses?: Array<{ name: string; response: unknown }>;
  // Gemini 3 Thought Signatures - pass back for context continuity
  thoughtSignature?: string;
  // Vertex AI advanced features
  useGoogleSearch?: boolean;  // Ground responses with Google Search
  useCodeExecution?: boolean; // Enable code execution sandbox
}

export interface GenerateResult {
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  usage?: { inputTokens: number; outputTokens: number };
  // Raw function calls for agentic loop
  rawFunctionCalls?: FunctionCall[];
  // Raw response for thought signature extraction (Strategic Track #1)
  rawResponse?: unknown;
  // Gemini 3 Thought Signatures - encrypted representations of internal reasoning
  // Used for maintaining context continuity across API calls (Marathon Mode)
  thoughtSignature?: string;
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const ai = getClient();
  const useNativeTools = supportsNativeTools(opts.model);

  // Build system prompt with tool descriptions for non-native models
  let systemPrompt = opts.systemPrompt || "";
  if (opts.tools && opts.tools.length > 0 && !useNativeTools) {
    systemPrompt += buildToolPrompt(opts.tools);
    log.debug("Using prompt-based tools for model: %s", opts.model);
  }

  // Build contents array with proper structure
  const contents: Content[] = [];

  for (const m of opts.messages) {
    contents.push({
      role: m.role,
      parts: [{ text: m.content }],
    });
  }

  // Add function call/response pairs for agentic loop (native tools only)
  if (useNativeTools && opts.functionCalls && opts.functionResponses) {
    for (let i = 0; i < opts.functionCalls.length; i++) {
      const fc = opts.functionCalls[i];
      const fr = opts.functionResponses[i];

      // Model's function call
      contents.push({
        role: "model",
        parts: [{
          functionCall: {
            name: fc.name,
            args: fc.args,
          },
        } as Part],
      });

      // Function response
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: fr.name,
            response: fr.response,
          },
        } as Part],
      });
    }
  }

  const config: Record<string, unknown> = {};
  if (opts.temperature !== undefined) config.temperature = opts.temperature;
  if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;

  if (opts.thinkingLevel && opts.thinkingLevel !== "none") {
    // Gemini 3 uses thinking_level instead of thinking_budget
    const isGemini3 = opts.model.includes("gemini-3");
    if (isGemini3) {
      // Gemini 3 thinking levels: minimal (flash only), low, medium (flash only), high
      config.thinkingConfig = { thinkingLevel: thinkingLevelForGemini3(opts.thinkingLevel) };
    } else {
      // Legacy: Gemini 2.x uses thinking_budget
      config.thinkingConfig = { thinkingBudget: thinkingBudget(opts.thinkingLevel) };
    }
  }

  // Only use native tools for supported models
  if (opts.tools && opts.tools.length > 0 && useNativeTools) {
    config.tools = normalizeToolsForGemini(opts.tools);
  }

  // Vertex AI: Google Search grounding for real-time information
  if (opts.useGoogleSearch) {
    config.tools = config.tools || [];
    (config.tools as any[]).push({ googleSearch: {} });
    log.debug("Google Search grounding enabled");
  }

  // Vertex AI: Code execution sandbox
  if (opts.useCodeExecution) {
    config.tools = config.tools || [];
    (config.tools as any[]).push({ codeExecution: {} });
    log.debug("Code execution sandbox enabled");
  }

  // Wrap API call with retry logic for resilience
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: opts.model,
      contents,
      config: {
        ...config,
        systemInstruction: systemPrompt,
      },
    })
  );

  const text = response.text || "";
  let thinking: string | undefined;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rawFunctionCalls: FunctionCall[] = [];

  // Extract thinking and tool calls from parts (native function calling)
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if ((part as any).thought) {
        thinking = (part as any).text;
      }
      if ((part as any).functionCall) {
        const fc = (part as any).functionCall as FunctionCall;
        rawFunctionCalls.push(fc);
        toolCalls.push({
          name: fc.name || "",
          args: (fc.args as Record<string, unknown>) || {},
        });
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

  // Extract Gemini 3 Thought Signature for context continuity
  // Thought signatures are encrypted representations of internal reasoning
  let thoughtSignature: string | undefined;
  if (response.candidates?.[0]) {
    const candidate = response.candidates[0] as any;
    // Gemini 3 returns thought signatures in the response metadata
    if (candidate.thoughtSignature) {
      thoughtSignature = candidate.thoughtSignature;
    } else if (candidate.content?.thoughtSignature) {
      thoughtSignature = candidate.content.thoughtSignature;
    }
    // Also check for thinking content as fallback signature
    if (!thoughtSignature && thinking) {
      // Create a hash-based signature from thinking content for continuity
      thoughtSignature = Buffer.from(thinking.slice(0, 2000)).toString('base64');
    }
  }

  return {
    text,
    thinking,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    rawFunctionCalls: rawFunctionCalls.length > 0 ? rawFunctionCalls : undefined,
    usage: response.usageMetadata
      ? {
          inputTokens: response.usageMetadata.promptTokenCount || 0,
          outputTokens: response.usageMetadata.candidatesTokenCount || 0,
        }
      : undefined,
    // Include raw response for thought signature extraction (Strategic Track #1)
    rawResponse: response,
    // Gemini 3 Thought Signature for Marathon Mode context continuity
    thoughtSignature,
  };
}

/**
 * Agentic generate - handles the full tool execution loop
 * This is the main entry point for agentic conversations
 */
export async function generateAgentic(
  opts: GenerateOptions,
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; output: string; error?: string }>
): Promise<GenerateResult & { allToolResults: Array<{ name: string; success: boolean; output: string; error?: string }> }> {
  const ai = getClient();
  const useNativeTools = supportsNativeTools(opts.model);
  const MAX_LOOPS = 10;

  let allToolResults: Array<{ name: string; success: boolean; output: string; error?: string }> = [];
  let finalText = "";
  let finalThinking: string | undefined;
  let totalUsage = { inputTokens: 0, outputTokens: 0 };

  // For native tools: track function calls and responses for multi-turn
  let pendingFunctionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let pendingFunctionResponses: Array<{ name: string; response: unknown }> = [];

  // Working copy of messages
  const messages = [...opts.messages];

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    let result: GenerateResult;

    if (useNativeTools && pendingFunctionCalls.length > 0) {
      // Continue with function responses
      result = await generate({
        ...opts,
        messages,
        functionCalls: pendingFunctionCalls,
        functionResponses: pendingFunctionResponses,
      });
    } else {
      result = await generate({
        ...opts,
        messages,
      });
    }

    if (result.usage) {
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;
    }

    finalThinking = result.thinking || finalThinking;

    // No tool calls - we're done
    if (!result.toolCalls || result.toolCalls.length === 0) {
      finalText = result.text;
      break;
    }

    // Execute tool calls
    log.info("Executing %d tool call(s), loop %d", result.toolCalls.length, loop + 1);

    if (useNativeTools) {
      // Native tools: build function call/response pairs
      pendingFunctionCalls = [];
      pendingFunctionResponses = [];

      for (const tc of result.toolCalls) {
        const toolResult = await executeToolFn(tc.name, tc.args);
        allToolResults.push({ name: tc.name, ...toolResult });

        pendingFunctionCalls.push(tc);
        pendingFunctionResponses.push({
          name: tc.name,
          response: {
            success: toolResult.success,
            output: toolResult.output,
            error: toolResult.error,
          },
        });

        log.info("Tool %s: %s", tc.name, toolResult.success ? "OK" : "FAIL");
      }
    } else {
      // Non-native tools: append results as user messages
      const toolResults: string[] = [];

      for (const tc of result.toolCalls) {
        const toolResult = await executeToolFn(tc.name, tc.args);
        allToolResults.push({ name: tc.name, ...toolResult });
        toolResults.push(
          `**${tc.name}**: ${toolResult.success ? toolResult.output : "ERROR: " + toolResult.error}`
        );
        log.info("Tool %s: %s", tc.name, toolResult.success ? "OK" : "FAIL");
      }

      // Add model's response and tool results to messages
      if (result.text) {
        messages.push({ role: "model", content: result.text });
      }

      const resultText = toolResults.join("\n\n");
      messages.push({
        role: "user",
        content: `[TOOL EXECUTION COMPLETE]\n\n${resultText}\n\nThe tools have been executed and the results are shown above. Continue with your response. If you need another tool, use the JSON format. Otherwise, provide your final response.`,
      });
    }

    // Store intermediate text
    if (result.text) {
      finalText = result.text;
    }
  }

  return {
    text: finalText,
    thinking: finalThinking,
    allToolResults,
    usage: totalUsage,
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
    // Gemini 3 uses thinking_level instead of thinking_budget
    const isGemini3 = opts.model.includes("gemini-3");
    if (isGemini3) {
      config.thinkingConfig = { thinkingLevel: thinkingLevelForGemini3(opts.thinkingLevel) };
    } else {
      config.thinkingConfig = { thinkingBudget: thinkingBudget(opts.thinkingLevel) };
    }
  }

  // Wrap streaming API call with retry logic
  const response = await withRetry(() =>
    ai.models.generateContentStream({
      model: opts.model,
      contents,
      config: {
        ...config,
        systemInstruction: opts.systemPrompt,
      },
    })
  );

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
 * Generate images using Vertex AI Imagen 3.
 * Supports generating multiple images at once.
 */
export async function generateImage(
  prompt: string,
  options: {
    model?: string;
    aspectRatio?: string;
    numberOfImages?: number;
  } = {}
): Promise<{ images: Array<{ base64: string; mimeType: string; path?: string }> }> {
  const ai = getClient();
  const numberOfImages = options.numberOfImages || 1;
  const aspectRatio = options.aspectRatio || "1:1";

  // Try multiple Imagen models in order of preference
  const imagenModels = [
    options.model,
    "imagen-3.0-generate-002",
    "imagen-3.0-generate-001",
    "imagegeneration@006",
    "imagegeneration",
  ].filter(Boolean) as string[];

  let lastError: Error | null = null;

  for (const model of imagenModels) {
    try {
      log.info("Trying image generation with model: %s, count: %d", model, numberOfImages);

      const response = await ai.models.generateImages({
        model,
        prompt,
        config: {
          numberOfImages,
          aspectRatio,
        },
      });

      const generatedImages = (response as any).generatedImages || (response as any).images || [];

      if (generatedImages.length > 0) {
        const images = generatedImages.map((img: any) => {
          // Handle different response formats
          const base64 = img.image?.imageBytes || img.imageBytes || img.b64_json || img.data || "";
          return {
            base64,
            mimeType: "image/png",
          };
        }).filter((img: any) => img.base64);

        if (images.length > 0) {
          log.info("Generated %d image(s) with %s", images.length, model);
          return { images };
        }
      }
    } catch (err: any) {
      log.debug("Model %s failed: %s", model, err.message);
      lastError = err;
      continue;
    }
  }

  // Fallback: Try Gemini 2.0 Flash with native image generation
  try {
    log.info("Trying Gemini 2.0 Flash for image generation");

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{
        role: "user",
        parts: [{ text: `Generate a high-quality image: ${prompt}` }]
      }],
      config: {
        responseModalities: ["image", "text"],
      } as any,
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const images = parts
      .filter((p: any) => p.inlineData?.mimeType?.startsWith("image/"))
      .map((p: any) => ({
        base64: p.inlineData.data,
        mimeType: p.inlineData.mimeType,
      }));

    if (images.length > 0) {
      log.info("Generated %d image(s) with Gemini 2.0 Flash", images.length);
      return { images };
    }
  } catch (err: any) {
    log.debug("Gemini 2.0 Flash image generation failed: %s", err.message);
  }

  // If all else fails, throw the last error
  throw lastError || new Error("Image generation not available. Use Unsplash URLs instead: https://source.unsplash.com/400x300/?keyword");
}

/**
 * Generate multiple images for a project (e.g., animal shelter platform)
 * Returns paths to saved images that can be used in HTML/CSS
 */
export async function generateProjectImages(
  prompts: string[],
  runtimeDir: string,
  options: { aspectRatio?: string } = {}
): Promise<Array<{ prompt: string; path: string; url: string }>> {
  const results: Array<{ prompt: string; path: string; url: string }> = [];
  const { writeFileSync, mkdirSync } = await import("fs");
  const { join } = await import("path");

  // Create images directory in workspace
  const imagesDir = join(runtimeDir, "workspace", "images");
  mkdirSync(imagesDir, { recursive: true });

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    try {
      const result = await generateImage(prompt, {
        numberOfImages: 1,
        aspectRatio: options.aspectRatio || "1:1",
      });

      if (result.images.length > 0) {
        const filename = `generated-${Date.now()}-${i}.png`;
        const filepath = join(imagesDir, filename);
        const buffer = Buffer.from(result.images[0].base64, "base64");
        writeFileSync(filepath, buffer);

        results.push({
          prompt,
          path: filepath,
          url: `images/${filename}`, // Relative URL for HTML
        });
        log.info("Saved generated image: %s", filepath);
      }
    } catch (err: any) {
      log.warn("Failed to generate image for '%s': %s", prompt, err.message);
      // Use Unsplash fallback
      const keyword = prompt.split(" ").slice(0, 3).join(",");
      results.push({
        prompt,
        path: "",
        url: `https://source.unsplash.com/400x400/?${encodeURIComponent(keyword)}`,
      });
    }
  }

  return results;
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
  // Vertex AI limits: 128-24576 for most models
  switch (level) {
    case "minimal": return 128;
    case "low": return 1024;
    case "medium": return 4096;
    case "high": return 16384;
    case "ultra": return 24576; // Maximum allowed by Vertex AI
    default: return 0;
  }
}

/**
 * Convert ThinkingLevel to Gemini 3's thinking_level parameter.
 * Gemini 3 uses: minimal (flash only), low, medium (flash only), high
 * Note: "ultra" maps to "high" as it's the maximum available in Gemini 3
 */
function thinkingLevelForGemini3(level: ThinkingLevel): string {
  switch (level) {
    case "minimal": return "low";      // minimal not available on pro, use low
    case "low": return "low";
    case "medium": return "high";      // medium not available on pro, use high
    case "high": return "high";
    case "ultra": return "high";       // ultra = max reasoning = high
    default: return "high";
  }
}

/**
 * Generate with explicit thinking level - convenience wrapper for Marathon Agent
 * Uses Gemini 3's thinking budget feature for deep reasoning
 */
export async function generateWithThinking(
  prompt: string,
  thinkingLevel: ThinkingLevel,
  apiKeyOrOptions: string | GeminiInitOptions,
  model: string = "gemini-2.5-flash"
): Promise<string> {
  // Initialize client if needed
  if (!client) {
    initGemini(apiKeyOrOptions);
  }

  const result = await generate({
    model,
    messages: [{ role: "user", content: prompt }],
    thinkingLevel,
    maxTokens: 32768, // Allow longer outputs for complex plans
  });

  return result.text;
}
