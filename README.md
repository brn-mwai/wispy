# Wispy

**The World's First Autonomous AI Agent with Payments, Identity, and Multi-Day Reasoning**

[![npm](https://img.shields.io/npm/v/wispy-ai)](https://www.npmjs.com/package/wispy-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Base Sepolia](https://img.shields.io/badge/Base-Sepolia-blue)](https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7)

> **Built for:** [Google Gemini Hackathon](https://gemini3.devpost.com/) | [Chainlink Convergence](https://chain.link/hackathon) | [ETHGlobal HackMoney](https://ethglobal.com/events/hackmoney2026)

---

## What Makes Wispy Different

**Wispy isn't just another AI chatbot.** It's the first autonomous agent infrastructure that combines:

| Protocol | What It Enables |
|----------|-----------------|
| **Gemini 2.5 Pro** | Multi-day reasoning with 24K token thinking budget |
| **x402 Payments** | Automatic USDC payments for premium APIs |
| **ERC-8004 Identity** | On-chain verifiable agent registration |
| **A2A Protocol** | Agent-to-agent discovery and communication |

> *"Wispy is the first AI agent that can think for days, pay for its own services, and prove its identity on-chain."*

---

## Live Demo

**Deployed Contracts (Base Sepolia):**
- Agent Registry: [`0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7`](https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7)

**Try It:**
```bash
npm i -g wispy-ai
wispy setup
wispy agent "Research the DePIN market and produce a report"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WISPY PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Gemini     │    │     x402     │    │   ERC-8004   │                  │
│  │  2.5 Pro     │    │   Payments   │    │   Identity   │                  │
│  │  + Thinking  │    │  (USDC/Base) │    │  (On-Chain)  │                  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                    ┌────────▼────────┐                                      │
│                    │  MARATHON AGENT │                                      │
│                    │   Multi-Day     │                                      │
│                    │   Autonomous    │                                      │
│                    │   Execution     │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                           │
│         │                   │                   │                           │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                     │
│  │   A2A       │    │   Trust     │    │   Tools     │                     │
│  │  Protocol   │    │ Controller  │    │   (27+)     │                     │
│  │  (Google)   │    │ (Approvals) │    │             │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
│                                                                              │
│  Channels: Telegram | WhatsApp | Discord | Slack | REST | WebSocket        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Marathon Mode — Multi-Day Autonomous Execution

```bash
wispy marathon "Build a full-stack e-commerce app with Next.js and Stripe"
```

- **Deep Planning**: Gemini 2.5 Pro with 24K token thinking budget
- **Milestone Execution**: Autonomous step-by-step completion
- **Self-Recovery**: Fails? It analyzes and tries a different approach
- **Checkpointing**: Pause anytime, resume where you left off
- **Real-time Updates**: Telegram/WhatsApp notifications on progress

### 2. x402 Payments — Agents That Pay

```typescript
// Agent encounters a premium API
// HTTP 402 Payment Required

// Wispy automatically:
// 1. Checks spending budget
// 2. Requests Trust Controller approval
// 3. Pays with USDC on Base
// 4. Continues execution

await agent.fetch("https://api.premium.com/data"); // Just works
```

- Automatic HTTP 402 handling
- USDC payments on Base network
- Configurable spending limits
- Full transaction logging

### 3. ERC-8004 Identity — Verifiable Agents

```json
// /.well-known/agent.json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Wispy Agent",
  "x402Support": true,
  "registrations": [{
    "agentId": "1",
    "agentRegistry": "0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7"
  }],
  "supportedTrust": ["reputation"]
}
```

- On-chain agent registration
- Reputation system
- Validation framework
- Trust verification

### 4. A2A Protocol — Agents Talking to Agents

```typescript
// Discover another agent
const card = await a2a.discover("https://other-agent.com");

// Send a task
const task = await a2a.sendTask(card, {
  message: "Analyze this dataset",
  data: { ... }
});

// Get result
const result = await task.waitForCompletion();
```

- Google's Agent-to-Agent protocol
- Agent card discovery
- Task delegation
- Secure message signing

---

## Quick Start

### Installation

```bash
npm i -g wispy-ai
```

### Setup

```bash
wispy setup
```

This will:
1. Create Vertex AI configuration
2. Generate blockchain wallet
3. Configure x402 payments
4. Set up A2A protocol

### Run

```bash
# Interactive chat
wispy chat

# Marathon mode
wispy marathon "Build a React dashboard"

# Full gateway (A2A server + all channels)
wispy gateway

# Agent with specific task
wispy agent "Research and summarize the latest AI papers"
```

---

## Configuration

### Option 1: Gemini API Key (Simplest)

```env
# .env or .env.local
GEMINI_API_KEY=your-api-key
```

Get your API key at [Google AI Studio](https://aistudio.google.com/apikey).

### Option 2: Vertex AI (Enterprise)

```env
# .env.local
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1  # Optional
```

Then authenticate:
```bash
gcloud auth application-default login
```

Or use a service account:
```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Enable Vertex AI in the CLI:
```bash
wispy
/vertex enable your-project-id
```

### Payments & Channels

```env
# x402 Payments (Coinbase CDP)
CDP_API_KEY_ID=your-key-id
CDP_API_KEY_SECRET=your-key-secret

# Optional: Channels
TELEGRAM_BOT_TOKEN=your-token
```

### Full Configuration

Use `~/.wispy/config.yaml`:

```yaml
agent:
  name: Wispy
  id: wispy-agent-001

gemini:
  # Option 1: API Key (set GEMINI_API_KEY env var)
  # Option 2: Vertex AI
  vertexai:
    enabled: true
    project: your-gcp-project
    location: us-central1
  models:
    pro: gemini-2.5-pro
    flash: gemini-2.5-flash
    image: imagen-3.0-generate-002
    embedding: text-embedding-004

marathon:
  thinkingLevel: ultra  # 24K token budget
  checkpointInterval: 5  # Save every 5 milestones

x402:
  enabled: true
  maxSpendPerTask: 10.00  # USDC
  requireApproval: true

erc8004:
  network: base-sepolia
  autoRegister: true

a2a:
  enabled: true
  port: 3000

channels:
  telegram:
    enabled: true
  rest:
    enabled: true
    port: 8080
```

---

## Hackathon Tracks

### Google Gemini Hackathon — Marathon Agent

**Focus:** Multi-day autonomous execution with Gemini 2.5 Pro

- 24K token thinking budget for complex planning
- Thought continuity across sessions
- Self-verification and recovery
- Real-time monitoring dashboard

### Chainlink Convergence — Trustless AI Agents

**Focus:** x402 payments + ERC-8004 identity on Base

- Automatic crypto payments for AI services
- On-chain agent registration
- Verifiable reputation system
- Trust Controller for approvals

### ETHGlobal HackMoney — Agent Economy

**Focus:** Full-stack autonomous agent infrastructure

- Agents that can earn and spend
- Agent-to-agent marketplace
- Decentralized identity
- Production-ready SDK

---

## Technical Specs

| Component | Technology |
|-----------|------------|
| AI Model | Gemini 2.5 Pro via Vertex AI |
| Thinking Budget | 128 - 24,576 tokens |
| Blockchain | Base Sepolia (chainId: 84532) |
| Payments | USDC via x402 protocol |
| Identity | ERC-8004 standard |
| Agent Comms | A2A Protocol (Google) |
| Runtime | Node.js 20+, TypeScript |

---

## API Reference

### Marathon API

```typescript
import { startMarathon } from 'wispy-ai';

const marathon = await startMarathon({
  goal: "Build a SaaS landing page",
  thinkingLevel: "ultra",
  checkpointDir: "./.wispy/checkpoints"
});

marathon.on('milestone', (m) => console.log(`Completed: ${m.name}`));
marathon.on('complete', (result) => console.log('Done!', result));
```

### x402 Fetch

```typescript
import { x402Fetch } from 'wispy-ai';

// Automatically handles HTTP 402 with crypto payment
const response = await x402Fetch("https://api.premium.com/data", {
  maxPayment: "1.00", // USDC
  trustController: myController
});
```

### ERC-8004 Client

```typescript
import { ERC8004Client } from 'wispy-ai';

const client = new ERC8004Client(signer, "./.wispy");
const agentId = await client.registerAgent("https://my-agent.com/agent.json");
const reputation = await client.getReputation(agentId);
```

### A2A Client

```typescript
import { A2AClient, createAgentCard } from 'wispy-ai';

// Create your agent card
const myCard = createAgentCard({
  name: "My Agent",
  skills: [{ id: "research", name: "Research" }]
});

// Discover and interact with other agents
const client = new A2AClient("https://other-agent.com");
const theirCard = await client.discover();
const result = await client.sendTask({ message: "Help me research..." });
```

---

## Security

- **Device Identity**: Ed25519 keys for authentication
- **Encrypted Storage**: AES-256-GCM for credentials
- **API Key Scanner**: Automatic detection and redaction
- **Trust Controller**: Approval workflows for sensitive actions
- **Rate Limiting**: Prevent abuse
- **Loop Detection**: Prevents infinite action loops

---

## Links

- **npm**: https://www.npmjs.com/package/wispy-ai
- **GitHub**: https://github.com/brn-mwai/wispy
- **Contract**: https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7

---

## License

MIT

---

**The first AI agent that thinks for days, pays for services, and proves its identity on-chain.**

*Built by Brian Mwai for Google Gemini Hackathon, Chainlink Convergence, and ETHGlobal HackMoney 2026*
