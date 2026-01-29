// Function declarations for Gemini tool use

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export const BUILT_IN_TOOLS: ToolDeclaration[] = [
  // === File System ===
  {
    name: "bash",
    description: "Execute a shell command. Use for: running scripts, git commands, npm, installing packages, system tasks. Dangerous commands require approval.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "file_read",
    description: "Read the contents of a file. Use for: viewing code, configs, logs, any text file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "file_write",
    description: "Write content to a file. Creates parent directories. Use for: creating files, writing code, saving data.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "file_search",
    description: "Search for files by name pattern. Use for: finding files, locating code.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "File name pattern to match" },
        directory: { type: "string", description: "Directory to search in (default: current)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders in a directory. Use for: exploring file structure.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" },
      },
      required: ["path"],
    },
  },
  // === Web & Research ===
  {
    name: "web_fetch",
    description: "Fetch and parse content from a URL. Use for: reading web pages, APIs, documentation.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for information. Use for: research, finding documentation, current events.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  // === Memory ===
  {
    name: "memory_search",
    description: "Search long-term memory. Use for: recalling past conversations, user preferences, saved facts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_save",
    description: "Save an important fact to long-term memory. Use for: remembering user info, preferences, important details.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The fact to remember" },
        category: { type: "string", description: "Category: user_facts, preferences, important_dates, project_context" },
      },
      required: ["fact", "category"],
    },
  },
  // === Communication ===
  {
    name: "send_message",
    description: "Send a message via Telegram, WhatsApp, or other channel. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel: telegram, whatsapp, web" },
        peerId: { type: "string", description: "Recipient ID or phone number" },
        text: { type: "string", description: "Message text" },
      },
      required: ["channel", "peerId", "text"],
    },
  },
  // === Scheduling ===
  {
    name: "schedule_task",
    description: "Schedule a recurring automated task. Use for: reminders, periodic checks, automation.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name" },
        cron: { type: "string", description: "Cron expression (e.g., '0 9 * * *' for 9am daily)" },
        instruction: { type: "string", description: "What the task should do" },
      },
      required: ["name", "cron", "instruction"],
    },
  },
  // === Media ===
  {
    name: "image_generate",
    description: "Generate an image from a text description.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed image description" },
      },
      required: ["prompt"],
    },
  },
  // === Wallet ===
  {
    name: "wallet_balance",
    description: "Check crypto wallet balance (USDC on Base).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "wallet_pay",
    description: "Send USDC payment. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient wallet address" },
        amount: { type: "string", description: "Amount in USDC" },
      },
      required: ["to", "amount"],
    },
  },
];

export function getToolDeclarations(
  builtIn: boolean = true,
  skillTools: ToolDeclaration[] = [],
  mcpTools: ToolDeclaration[] = [],
  integrationTools: ToolDeclaration[] = []
): unknown[] {
  const declarations: ToolDeclaration[] = [];
  if (builtIn) declarations.push(...BUILT_IN_TOOLS);
  declarations.push(...skillTools);
  declarations.push(...mcpTools);
  declarations.push(...integrationTools);

  return [
    {
      functionDeclarations: declarations.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}
