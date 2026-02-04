# A2A Protocol Expert Skill

You are an expert in Google's Agent-to-Agent (A2A) Protocol. You produce production-ready TypeScript code for agent communication and collaboration.

## Protocol Overview

A2A enables agents to discover, communicate, and delegate tasks across organizational boundaries. It was developed by Google and donated to the Linux Foundation.

## Core Concepts

### Agent Card (/.well-known/agent.json)
```json
{
  "name": "Wispy",
  "description": "Autonomous AI agent with Marathon Mode",
  "url": "https://wispy.ai",
  "version": "0.7.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "skills": [
    {
      "id": "marathon",
      "name": "Marathon Mode",
      "description": "Multi-day autonomous task execution"
    },
    {
      "id": "defi-monitor",
      "name": "DeFi Monitor",
      "description": "Monitor DeFi positions and alert on risks"
    }
  ]
}
```

### Task Lifecycle
1. **submitted** - Task received
2. **working** - Agent processing
3. **input-required** - Needs human input
4. **completed** - Successfully finished
5. **failed** - Error occurred
6. **canceled** - User canceled

### Message Types
- `task/send` - Submit new task
- `task/get` - Get task status
- `task/cancel` - Cancel task
- `task/sendSubscribe` - Subscribe to updates

## Production Code Templates

### A2A Client
```typescript
import { A2AClient } from "@a2a-js/sdk";

export class WispyA2AClient {
  private client: A2AClient;

  constructor(private agentUrl: string) {
    this.client = new A2AClient({ baseUrl: agentUrl });
  }

  async discoverAgent(url: string): Promise<AgentCard> {
    const response = await fetch(`${url}/.well-known/agent.json`);
    if (!response.ok) throw new Error(`Discovery failed: ${response.status}`);
    return response.json();
  }

  async delegateTask(
    instruction: string,
    context?: string
  ): Promise<TaskResult> {
    const task = await this.client.sendTask({
      message: {
        role: "user",
        parts: [{ text: instruction }]
      },
      metadata: { context }
    });

    // Wait for completion with streaming updates
    return this.client.waitForCompletion(task.id, {
      onUpdate: (update) => console.log(`Status: ${update.status}`)
    });
  }

  async *streamTask(instruction: string): AsyncGenerator<TaskUpdate> {
    const stream = await this.client.sendTaskSubscribe({
      message: { role: "user", parts: [{ text: instruction }] }
    });

    for await (const event of stream) {
      yield event;
      if (event.status === "completed" || event.status === "failed") break;
    }
  }
}
```

### A2A Server
```typescript
import express from "express";
import { A2AServer, Task } from "@a2a-js/sdk";

export function createA2AServer(agent: Agent): express.Express {
  const app = express();
  const a2aServer = new A2AServer({
    agentCard: buildAgentCard(),
    taskHandler: async (task: Task) => {
      // Extract instruction
      const instruction = task.message.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join("\n");

      // Execute via Wispy agent
      const result = await agent.chat(
        instruction,
        `a2a:${task.id}`,
        "a2a",
        "sub"
      );

      return {
        status: "completed",
        message: {
          role: "agent",
          parts: [{ text: result.text }]
        }
      };
    }
  });

  // Mount A2A endpoints
  app.use("/", a2aServer.router());

  return app;
}

function buildAgentCard(): AgentCard {
  return {
    name: "Wispy",
    description: "Autonomous AI agent with Marathon Mode",
    url: process.env.WISPY_URL || "https://wispy.ai",
    version: "0.7.0",
    capabilities: {
      streaming: true,
      pushNotifications: true
    },
    skills: [
      { id: "marathon", name: "Marathon Mode", description: "Multi-day tasks" },
      { id: "chat", name: "Chat", description: "Conversational AI" }
    ]
  };
}
```

## Best Practices

1. **Always verify agent identity** before delegating sensitive tasks
2. **Use streaming** for long-running operations
3. **Implement timeouts** for task delegation
4. **Log all A2A interactions** for audit trails
5. **Handle all task states** including input-required

## Error Handling

```typescript
try {
  const result = await client.delegateTask(instruction);
} catch (error) {
  if (error.code === "AGENT_UNAVAILABLE") {
    // Try alternative agent
  } else if (error.code === "TASK_TIMEOUT") {
    // Retry with longer timeout
  } else if (error.code === "AUTHENTICATION_FAILED") {
    // Refresh credentials
  }
}
```

## References
- Official Spec: https://a2a-protocol.org/latest/
- SDK: https://github.com/a2aproject/a2a-js
- Google ADK Docs: https://google.github.io/adk-docs/a2a/
