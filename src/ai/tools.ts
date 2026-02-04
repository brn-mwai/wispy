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
  {
    name: "create_folder",
    description: "Create a new folder/directory. Creates parent directories if needed. Use for: organizing files, setting up project structure.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path of the folder to create" },
      },
      required: ["path"],
    },
  },
  {
    name: "file_delete",
    description: "Delete a file or empty folder. Use with caution. Requires approval for non-empty folders.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of file or folder to delete" },
      },
      required: ["path"],
    },
  },
  {
    name: "file_copy",
    description: "Copy a file or folder to a new location.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source file or folder path" },
        destination: { type: "string", description: "Destination path" },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "file_move",
    description: "Move or rename a file or folder.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source file or folder path" },
        destination: { type: "string", description: "Destination path" },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "localhost_serve",
    description: "Start a simple HTTP server on localhost for the specified directory. Use for: serving static files, testing web apps locally.",
    parameters: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Directory to serve (default: current)" },
        port: { type: "number", description: "Port to serve on (default: 3000)" },
      },
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
  // === Scheduling & Reminders ===
  {
    name: "schedule_task",
    description: "Schedule a recurring automated task. Use for: periodic checks, automation, daily routines.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name" },
        cron: {
          type: "string",
          description: "Cron expression OR natural language: 'every 5 minutes', 'daily at 9am', 'weekdays at 10:30', 'monday at 3pm'",
        },
        instruction: { type: "string", description: "What the agent should do when triggered" },
      },
      required: ["name", "cron", "instruction"],
    },
  },
  {
    name: "remind_me",
    description: "Set a one-time reminder. The user will be notified at the specified time. Use this when user says 'remind me to...'",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The reminder message to send" },
        when: {
          type: "string",
          description: "When to remind: 'in 5 minutes', 'in 2 hours', 'tomorrow at 9am', 'at 3pm', 'tonight', 'next monday'",
        },
      },
      required: ["message", "when"],
    },
  },
  {
    name: "list_reminders",
    description: "List all upcoming reminders.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "delete_reminder",
    description: "Delete a reminder by its ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The reminder ID to delete" },
      },
      required: ["id"],
    },
  },
  // === Voice ===
  {
    name: "voice_reply",
    description: "Reply to the user with a voice message. Use when user asks to 'speak', 'say it out loud', 'voice reply', or prefers audio responses.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to convert to speech" },
        persona: {
          type: "string",
          description: "Voice persona: 'default', 'friendly', 'professional', 'assistant', 'british', 'casual'",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "set_voice_mode",
    description: "Enable or disable voice mode. When enabled, all responses will be sent as voice messages.",
    parameters: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Whether to enable voice mode" },
        persona: { type: "string", description: "Default voice persona to use" },
      },
      required: ["enabled"],
    },
  },
  // === Vertex AI Advanced ===
  {
    name: "google_search",
    description: "Search Google for real-time information. Use when you need current data, news, prices, or facts not in your training.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "run_python",
    description: "Execute Python code in a secure sandbox. Use for calculations, data processing, analysis. Returns stdout and any errors.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Python code to execute" },
      },
      required: ["code"],
    },
  },
  // === Media ===
  {
    name: "image_generate",
    description: "Generate an image from a text description using Imagen 3.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed image description" },
        count: { type: "number", description: "Number of images to generate (1-4, default: 1)" },
        aspectRatio: { type: "string", description: "Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4 (default: 1:1)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_project_images",
    description: "Generate multiple images for a project (e.g., animal photos for a shelter app). Returns file paths to use in HTML.",
    parameters: {
      type: "object",
      properties: {
        prompts: { type: "string", description: "JSON array of image prompts, e.g., [\"golden retriever dog\", \"tabby cat\", \"white rabbit\"]" },
        aspectRatio: { type: "string", description: "Aspect ratio for all images (default: 1:1)" },
      },
      required: ["prompts"],
    },
  },
  {
    name: "preview_and_screenshot",
    description: "Open an HTML file in browser and take a screenshot. Returns the screenshot path. Use for: showing the user what was created.",
    parameters: {
      type: "object",
      properties: {
        htmlPath: { type: "string", description: "Path to the HTML file to preview" },
        width: { type: "number", description: "Viewport width in pixels (default: 1280)" },
        height: { type: "number", description: "Viewport height in pixels (default: 800)" },
      },
      required: ["htmlPath"],
    },
  },
  {
    name: "send_image_to_chat",
    description: "Send an image file back to the user in the current chat (Telegram/WhatsApp). Use after taking screenshots or generating images.",
    parameters: {
      type: "object",
      properties: {
        imagePath: { type: "string", description: "Path to the image file to send" },
        caption: { type: "string", description: "Optional caption for the image" },
      },
      required: ["imagePath"],
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
  // === Browser Control (Gemini 3 Computer Use) ===
  {
    name: "browser_navigate",
    description: "Navigate browser to a URL. Use for: opening websites, navigating to pages.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_click",
    description: "Click on an element in the browser. Use for: clicking buttons, links, form elements.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of element to click" },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_type",
    description: "Type text into an input field. Use for: filling forms, entering text.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of input element" },
        text: { type: "string", description: "Text to type" },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser page. Use for: capturing visual state, verification.",
    parameters: {
      type: "object",
      properties: {
        fullPage: { type: "boolean", description: "Capture full scrollable page (default: false)" },
      },
    },
  },
  {
    name: "browser_snapshot",
    description: "Get page content + screenshot for AI analysis. Use for: understanding page structure, extracting data.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the browser page. Use for: navigating long pages, revealing content.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", description: "Direction: up, down, top, bottom" },
      },
      required: ["direction"],
    },
  },
  {
    name: "browser_tabs",
    description: "List all open browser tabs. Use for: managing multiple pages.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_new_tab",
    description: "Open a new browser tab, optionally with a URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open (optional)" },
      },
    },
  },
  {
    name: "browser_press_key",
    description: "Press a keyboard key in the browser. Use for: form submission, shortcuts.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key to press (e.g., Enter, Escape, Tab)" },
      },
      required: ["key"],
    },
  },
  // === Hackathon Tools: Trust Controls ===
  {
    name: "trust_request",
    description: "Request approval for a sensitive action through Trust Controls. Sends notification via Telegram/CLI.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action type (e.g., send_email, wallet_pay)" },
        description: { type: "string", description: "Human-readable description of what will happen" },
        metadata: { type: "string", description: "JSON string of additional context" },
      },
      required: ["action", "description"],
    },
  },
  {
    name: "trust_list_pending",
    description: "List all pending approval requests waiting for human response.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  // === Hackathon Tools: x402 Payments ===
  {
    name: "x402_fetch",
    description: "Make an HTTP request with automatic x402 payment handling. Pays USDC for API access when required.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch (may require payment)" },
        method: { type: "string", description: "HTTP method: GET, POST, PUT, DELETE" },
        body: { type: "string", description: "Request body for POST/PUT" },
      },
      required: ["url"],
    },
  },
  {
    name: "x402_balance",
    description: "Check the x402 wallet balance (USDC on Base network).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  // === Hackathon Tools: ERC-8004 Identity ===
  {
    name: "erc8004_register",
    description: "Register this agent's identity on-chain using ERC-8004. Creates a verifiable agent NFT.",
    parameters: {
      type: "object",
      properties: {
        agentURI: { type: "string", description: "URI to agent metadata (/.well-known/agent.json)" },
      },
      required: ["agentURI"],
    },
  },
  {
    name: "erc8004_reputation",
    description: "Get an agent's reputation score from the ERC-8004 Reputation Registry.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "On-chain agent ID" },
        tag: { type: "string", description: "Optional tag filter (e.g., 'coding', 'defi')" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "erc8004_feedback",
    description: "Submit reputation feedback for another agent after an interaction.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "On-chain agent ID to rate" },
        score: { type: "number", description: "Score from 0-100" },
        tag: { type: "string", description: "Category tag (e.g., 'coding', 'research')" },
      },
      required: ["agentId", "score"],
    },
  },
  {
    name: "erc8004_verify",
    description: "Verify an agent's on-chain identity and check if they should be trusted.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "On-chain agent ID" },
        minScore: { type: "number", description: "Minimum reputation score required (default: 70)" },
      },
      required: ["agentId"],
    },
  },
  // === Hackathon Tools: A2A Protocol ===
  {
    name: "a2a_discover",
    description: "Discover another agent's capabilities via the A2A protocol (Google standard).",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Base URL of the agent to discover" },
      },
      required: ["url"],
    },
  },
  {
    name: "a2a_delegate",
    description: "Delegate a task to another agent via the A2A protocol. Returns when task completes.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Base URL of the agent" },
        instruction: { type: "string", description: "Task instruction for the agent" },
        context: { type: "string", description: "Additional context for the task" },
      },
      required: ["url", "instruction"],
    },
  },
  {
    name: "a2a_delegate_stream",
    description: "Delegate a task to another agent with streaming updates.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Base URL of the agent" },
        instruction: { type: "string", description: "Task instruction" },
      },
      required: ["url", "instruction"],
    },
  },
  // === Hackathon Tools: Chainlink CRE ===
  {
    name: "cre_simulate",
    description: "Simulate a Chainlink CRE workflow locally. Use for testing before deployment.",
    parameters: {
      type: "object",
      properties: {
        workflow: { type: "string", description: "Workflow name: defi-monitor, price-alert, trust-bridge" },
        mockEvent: { type: "string", description: "JSON mock event data for testing" },
      },
      required: ["workflow"],
    },
  },
  {
    name: "cre_deploy",
    description: "Generate CRE deployment configuration for Chainlink DON.",
    parameters: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Project name for the CRE deployment" },
        workflows: { type: "string", description: "Comma-separated workflow names to deploy" },
      },
      required: ["projectName"],
    },
  },
  // === Full Project Creation ===
  {
    name: "create_project",
    description: "Create a complete web project with chosen framework. Frameworks: html (static with Tailwind), react, react-ts, vue, vue-ts, next/nextjs, express/node, vite. Creates full project structure with all necessary files.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (becomes folder name)" },
        framework: { type: "string", description: "Framework: html, react, react-ts, vue, vue-ts, next, express, vite (default: html)" },
        description: { type: "string", description: "Brief description of the project for generated content" },
      },
      required: ["name"],
    },
  },
  {
    name: "run_dev_server",
    description: "Start a development server for a project. Automatically detects if it's an npm project or static files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the project (relative to workspace)" },
        port: { type: "number", description: "Port to run on (default: 3000)" },
      },
      required: ["path"],
    },
  },
  // === shadcn/ui Integration ===
  {
    name: "scaffold_shadcn",
    description: "Initialize shadcn/ui in an existing Next.js/React project. Adds beautiful, accessible components. Use AFTER create_project with 'next' framework.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the project" },
        components: { type: "string", description: "Comma-separated components to add (e.g., 'button,card,input,dialog'). Default: button,card,input" },
      },
      required: ["path"],
    },
  },
  {
    name: "add_component",
    description: "Add a UI component to a project. Supports shadcn components or creates custom React components.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the project" },
        component: { type: "string", description: "Component name (e.g., 'button', 'card', 'dialog', 'form')" },
        framework: { type: "string", description: "Framework: 'shadcn' (default) or 'custom'" },
      },
      required: ["component"],
    },
  },
  // === Document Generation (LaTeX/PDF) ===
  {
    name: "document_create",
    description: "Create a professional LaTeX document and compile to PDF. Supports reports, papers, proposals, whitepapers, presentations. Auto-generates charts, flowcharts, tables.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        type: { type: "string", description: "Document type: report, paper, proposal, whitepaper, presentation, letter, invoice, contract" },
        content: { type: "string", description: "Document content in structured format (sections, subsections, text)" },
        outputPath: { type: "string", description: "Output path for the PDF (without extension)" },
        author: { type: "string", description: "Author name (optional)" },
        date: { type: "string", description: "Date (optional, defaults to today)" },
      },
      required: ["title", "type", "content", "outputPath"],
    },
  },
  {
    name: "document_chart",
    description: "Generate a chart using LaTeX/TikZ and output as image or embed in document. Supports: bar, line, pie, area, scatter plots.",
    parameters: {
      type: "object",
      properties: {
        chartType: { type: "string", description: "Chart type: bar, line, pie, area, scatter" },
        title: { type: "string", description: "Chart title" },
        data: { type: "string", description: "JSON data: {labels: [], datasets: [{name, values: []}]}" },
        outputPath: { type: "string", description: "Output path for image (PNG)" },
        width: { type: "number", description: "Width in cm (default: 12)" },
        height: { type: "number", description: "Height in cm (default: 8)" },
      },
      required: ["chartType", "title", "data", "outputPath"],
    },
  },
  {
    name: "document_flowchart",
    description: "Generate a flowchart/diagram using LaTeX/TikZ. Supports: flowchart, sequence, architecture, mindmap, timeline.",
    parameters: {
      type: "object",
      properties: {
        diagramType: { type: "string", description: "Type: flowchart, sequence, architecture, mindmap, timeline, org-chart" },
        title: { type: "string", description: "Diagram title" },
        nodes: { type: "string", description: "JSON nodes: [{id, label, type: start/process/decision/end}]" },
        connections: { type: "string", description: "JSON connections: [{from, to, label?}]" },
        outputPath: { type: "string", description: "Output path (PNG or PDF)" },
      },
      required: ["diagramType", "nodes", "connections", "outputPath"],
    },
  },
  {
    name: "document_table",
    description: "Generate a professional table as image or for embedding. Supports styling, colors, merged cells.",
    parameters: {
      type: "object",
      properties: {
        headers: { type: "string", description: "JSON array of column headers" },
        rows: { type: "string", description: "JSON 2D array of row data" },
        title: { type: "string", description: "Table caption (optional)" },
        outputPath: { type: "string", description: "Output path for image" },
        style: { type: "string", description: "Style: modern, classic, minimal (default: modern)" },
      },
      required: ["headers", "rows", "outputPath"],
    },
  },
  {
    name: "latex_compile",
    description: "Compile a raw LaTeX file to PDF. For advanced users with custom LaTeX code.",
    parameters: {
      type: "object",
      properties: {
        texPath: { type: "string", description: "Path to the .tex file" },
        outputDir: { type: "string", description: "Output directory for PDF" },
      },
      required: ["texPath"],
    },
  },
  {
    name: "research_report",
    description: "Generate a comprehensive research report as PDF. Combines research findings into professional document with charts and citations.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Research topic" },
        sections: { type: "string", description: "JSON array of sections with title and content" },
        charts: { type: "string", description: "JSON array of charts to include (optional)" },
        references: { type: "string", description: "JSON array of references/citations (optional)" },
        outputPath: { type: "string", description: "Output path for PDF" },
      },
      required: ["topic", "sections", "outputPath"],
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
