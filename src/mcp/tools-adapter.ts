/**
 * Adapts Wispy's internal tools to MCP tool format.
 */

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function getWispyMcpTools(): McpToolDef[] {
  return [
    {
      name: "wispy_chat",
      description: "Send a message to the Wispy AI agent and get a response",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "The message to send" },
          session: { type: "string", description: "Session key (default: mcp)" },
        },
        required: ["message"],
      },
    },
    {
      name: "wispy_memory_search",
      description: "Search Wispy's semantic memory",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: "wispy_memory_save",
      description: "Save a fact or note to Wispy's memory",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to remember" },
          source: { type: "string", description: "Source label" },
        },
        required: ["text"],
      },
    },
    {
      name: "wispy_bash",
      description: "Execute a shell command (with safety checks)",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
    {
      name: "wispy_file_read",
      description: "Read a file's contents",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
        },
        required: ["path"],
      },
    },
    {
      name: "wispy_file_write",
      description: "Write content to a file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "wispy_web_fetch",
      description: "Fetch content from a URL",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
        },
        required: ["url"],
      },
    },
    {
      name: "wispy_image_generate",
      description: "Generate an image using Gemini Nano Banana",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image generation prompt" },
        },
        required: ["prompt"],
      },
    },
    {
      name: "wispy_wallet_balance",
      description: "Check Wispy wallet USDC balance",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "wispy_schedule_task",
      description: "Schedule a cron task",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Task name" },
          cron: { type: "string", description: "Cron expression" },
          instruction: { type: "string", description: "What to do" },
        },
        required: ["name", "cron", "instruction"],
      },
    },
    {
      name: "wispy_a2a_delegate",
      description: "Delegate a task to another AI agent via A2A",
      inputSchema: {
        type: "object",
        properties: {
          peerId: { type: "string", description: "Target agent peer ID" },
          task: { type: "string", description: "Task description" },
        },
        required: ["peerId", "task"],
      },
    },
  ];
}
