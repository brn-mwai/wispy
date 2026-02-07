import AjvModule, { type JSONSchemaType } from "ajv";
const Ajv = (AjvModule as any).default ?? AjvModule;

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  models?: {
    default?: string;
    reasoning?: string;
    fast?: string;
    vision?: string;
  };
}

export interface WispyConfig {
  agent: {
    name: string;
    id: string;
  };
  // Primary provider (Gemini by default)
  gemini: {
    apiKey?: string;
    // Vertex AI configuration (Google Cloud)
    vertexai?: {
      enabled: boolean;
      project?: string;
      location?: string; // us-central1, europe-west1, etc.
    };
    models: {
      pro: string;
      flash: string;
      image: string;
      embedding: string;
    };
  };
  // Additional providers (MoltBot-style multi-provider support)
  providers?: {
    openai?: ProviderConfig;
    anthropic?: ProviderConfig;
    ollama?: ProviderConfig;
    openrouter?: ProviderConfig;
    groq?: ProviderConfig;
  };
  // Active provider selection
  activeProvider?: "gemini" | "openai" | "anthropic" | "ollama" | "openrouter" | "groq";
  channels: {
    telegram?: { enabled: boolean; token?: string };
    whatsapp?: { enabled: boolean };
    discord?: { enabled: boolean; token?: string; applicationId?: string };
    slack?: { enabled: boolean; token?: string; appToken?: string; signingSecret?: string };
    signal?: { enabled: boolean; number?: string };
    matrix?: { enabled: boolean; homeserver?: string; accessToken?: string };
    web?: { enabled: boolean; port: number };
    rest?: { enabled: boolean; port: number; bearerToken?: string };
  };
  memory: {
    embeddingDimensions: number;
    heartbeatIntervalMinutes: number;
    hybridSearch?: boolean; // BM25 + vector like MoltBot
  };
  wallet?: {
    enabled: boolean;
    chain: string;
    autoPayThreshold: number;
    commerce?: {
      maxPerTransaction?: number;
      dailyLimit?: number;
      autoApproveBelow?: number;
      requireApprovalAbove?: number;
      whitelistedRecipients?: string[];
      blacklistedRecipients?: string[];
    };
  };
  security: {
    requireApprovalForExternal: boolean;
    allowedGroups: string[];
    sandbox?: boolean;
    toolAllowlist?: string[];
    toolDenylist?: string[];
    autonomousMode?: boolean; // Auto-approve file/code operations
  };
  // Extended thinking (MoltBot-style)
  thinking?: {
    defaultLevel: "none" | "minimal" | "low" | "medium" | "high" | "ultra";
    costAware: boolean;
  };
  // Session management (MoltBot-style)
  sessions?: {
    dailyReset: boolean;
    resetHour: number;
    idleWindowMinutes: number;
  };
  // Browser control (MoltBot-style)
  browser?: {
    enabled: boolean;
    cdpUrl?: string;
    chromeExtension?: boolean;
  };
  // Voice AI configuration
  voice?: {
    enabled: boolean;
    model: "parler-tts" | "bark" | "melo-tts" | "speecht5" | "gemini" | "piper" | "auto";
    voicePreset?: string;  // Voice name/description
    language?: string;     // Language code (en, es, fr, etc.)
    speed?: number;        // Speech rate (0.5-2.0)
    replyWithVoice?: boolean; // Auto-reply with voice notes
  };
  theme?: string;
  agents?: string[];
  integrations?: string[];
  plugins?: string[];
}

// Use any to avoid AJV JSONSchemaType strict typing issues with deeply nested nullable props
const configSchema = {
  type: "object",
  required: ["agent", "gemini", "channels", "memory", "security"],
  properties: {
    agent: {
      type: "object",
      required: ["name", "id"],
      properties: {
        name: { type: "string" },
        id: { type: "string" },
      },
    },
    gemini: {
      type: "object",
      required: ["models"],
      properties: {
        apiKey: { type: "string", nullable: true },
        vertexai: {
          type: "object",
          nullable: true,
          properties: {
            enabled: { type: "boolean" },
            project: { type: "string", nullable: true },
            location: { type: "string", nullable: true },
          },
        },
        models: {
          type: "object",
          required: ["pro", "flash", "image", "embedding"],
          properties: {
            pro: { type: "string" },
            flash: { type: "string" },
            image: { type: "string" },
            embedding: { type: "string" },
          },
        },
      },
    },
    providers: {
      type: "object",
      nullable: true,
      properties: {
        openai: {
          type: "object",
          nullable: true,
          properties: {
            apiKey: { type: "string", nullable: true },
            baseUrl: { type: "string", nullable: true },
            models: {
              type: "object",
              nullable: true,
              properties: {
                default: { type: "string", nullable: true },
                reasoning: { type: "string", nullable: true },
                fast: { type: "string", nullable: true },
                vision: { type: "string", nullable: true },
              },
            },
          },
        },
        anthropic: {
          type: "object",
          nullable: true,
          properties: {
            apiKey: { type: "string", nullable: true },
            baseUrl: { type: "string", nullable: true },
            models: {
              type: "object",
              nullable: true,
              properties: {
                default: { type: "string", nullable: true },
                reasoning: { type: "string", nullable: true },
                fast: { type: "string", nullable: true },
                vision: { type: "string", nullable: true },
              },
            },
          },
        },
        ollama: {
          type: "object",
          nullable: true,
          properties: {
            apiKey: { type: "string", nullable: true },
            baseUrl: { type: "string", nullable: true },
            models: {
              type: "object",
              nullable: true,
              properties: {
                default: { type: "string", nullable: true },
                reasoning: { type: "string", nullable: true },
                fast: { type: "string", nullable: true },
                vision: { type: "string", nullable: true },
              },
            },
          },
        },
        openrouter: {
          type: "object",
          nullable: true,
          properties: {
            apiKey: { type: "string", nullable: true },
            baseUrl: { type: "string", nullable: true },
            models: {
              type: "object",
              nullable: true,
              properties: {
                default: { type: "string", nullable: true },
                reasoning: { type: "string", nullable: true },
                fast: { type: "string", nullable: true },
                vision: { type: "string", nullable: true },
              },
            },
          },
        },
        groq: {
          type: "object",
          nullable: true,
          properties: {
            apiKey: { type: "string", nullable: true },
            baseUrl: { type: "string", nullable: true },
            models: {
              type: "object",
              nullable: true,
              properties: {
                default: { type: "string", nullable: true },
                reasoning: { type: "string", nullable: true },
                fast: { type: "string", nullable: true },
                vision: { type: "string", nullable: true },
              },
            },
          },
        },
      },
    },
    activeProvider: {
      type: "string",
      nullable: true,
      enum: ["gemini", "openai", "anthropic", "ollama", "openrouter", "groq"],
    },
    channels: {
      type: "object",
      required: [],
      properties: {
        telegram: {
          type: "object",
          nullable: true,
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
            token: { type: "string", nullable: true },
          },
        },
        whatsapp: {
          type: "object",
          nullable: true,
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
          },
        },
        discord: {
          type: "object",
          nullable: true,
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
            token: { type: "string", nullable: true },
            applicationId: { type: "string", nullable: true },
          },
        },
        slack: {
          type: "object",
          nullable: true,
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
            token: { type: "string", nullable: true },
            appToken: { type: "string", nullable: true },
            signingSecret: { type: "string", nullable: true },
          },
        },
        signal: {
          type: "object",
          nullable: true,
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
            number: { type: "string", nullable: true },
          },
        },
        matrix: {
          type: "object",
          nullable: true,
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
            homeserver: { type: "string", nullable: true },
            accessToken: { type: "string", nullable: true },
          },
        },
        web: {
          type: "object",
          nullable: true,
          required: ["enabled", "port"],
          properties: {
            enabled: { type: "boolean" },
            port: { type: "integer" },
          },
        },
        rest: {
          type: "object",
          nullable: true,
          required: ["enabled", "port"],
          properties: {
            enabled: { type: "boolean" },
            port: { type: "integer" },
            bearerToken: { type: "string", nullable: true },
          },
        },
      },
    },
    memory: {
      type: "object",
      required: ["embeddingDimensions", "heartbeatIntervalMinutes"],
      properties: {
        embeddingDimensions: { type: "integer" },
        heartbeatIntervalMinutes: { type: "integer" },
        hybridSearch: { type: "boolean", nullable: true },
      },
    },
    wallet: {
      type: "object",
      nullable: true,
      required: ["enabled", "chain", "autoPayThreshold"],
      properties: {
        enabled: { type: "boolean" },
        chain: { type: "string" },
        autoPayThreshold: { type: "number" },
        commerce: {
          type: "object",
          nullable: true,
          properties: {
            maxPerTransaction: { type: "number", nullable: true },
            dailyLimit: { type: "number", nullable: true },
            autoApproveBelow: { type: "number", nullable: true },
            requireApprovalAbove: { type: "number", nullable: true },
            whitelistedRecipients: { type: "array", nullable: true, items: { type: "string" } },
            blacklistedRecipients: { type: "array", nullable: true, items: { type: "string" } },
          },
        },
      },
    },
    security: {
      type: "object",
      required: ["requireApprovalForExternal", "allowedGroups"],
      properties: {
        requireApprovalForExternal: { type: "boolean" },
        allowedGroups: { type: "array", items: { type: "string" } },
        sandbox: { type: "boolean", nullable: true },
        toolAllowlist: { type: "array", nullable: true, items: { type: "string" } },
        toolDenylist: { type: "array", nullable: true, items: { type: "string" } },
        autonomousMode: { type: "boolean", nullable: true },
      },
    },
    thinking: {
      type: "object",
      nullable: true,
      properties: {
        defaultLevel: {
          type: "string",
          nullable: true,
          enum: ["none", "minimal", "low", "medium", "high", "ultra"],
        },
        costAware: { type: "boolean", nullable: true },
      },
    },
    sessions: {
      type: "object",
      nullable: true,
      properties: {
        dailyReset: { type: "boolean", nullable: true },
        resetHour: { type: "integer", nullable: true },
        idleWindowMinutes: { type: "integer", nullable: true },
      },
    },
    browser: {
      type: "object",
      nullable: true,
      properties: {
        enabled: { type: "boolean", nullable: true },
        cdpUrl: { type: "string", nullable: true },
        chromeExtension: { type: "boolean", nullable: true },
      },
    },
    theme: { type: "string", nullable: true },
    agents: { type: "array", nullable: true, items: { type: "string" } },
    integrations: { type: "array", nullable: true, items: { type: "string" } },
    plugins: { type: "array", nullable: true, items: { type: "string" } },
  },
  additionalProperties: false,
};

const ajv = new Ajv({ allErrors: true });
export const validateConfig = ajv.compile(configSchema);
