<p align="center">
  <img src="assets/banner.png" alt="Wispy Banner" width="100%" />
</p>

<h1 align="center">Wispy</h1>

<p align="center">
  <strong>Autonomous AI Agent Infrastructure — Think for Days, Pay for Services, Prove Identity On-Chain</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wispy-ai"><img src="https://img.shields.io/npm/v/wispy-ai?style=flat-square&color=31ccff" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/wispy-ai"><img src="https://img.shields.io/npm/dm/wispy-ai?style=flat-square&color=31ccff" alt="npm downloads" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://github.com/brn-mwai/wispy"><img src="https://img.shields.io/github/stars/brn-mwai/wispy?style=flat-square&color=yellow" alt="GitHub Stars" /></a>
  <a href="https://github.com/brn-mwai/wispy/issues"><img src="https://img.shields.io/github/issues/brn-mwai/wispy?style=flat-square" alt="Issues" /></a>
  <a href="https://github.com/brn-mwai/wispy/actions"><img src="https://img.shields.io/github/actions/workflow/status/brn-mwai/wispy/ci.yml?style=flat-square&label=build" alt="Build" /></a>
  <a href="https://docs.wispy.cc"><img src="https://img.shields.io/badge/docs-docs.wispy.cc-31ccff?style=flat-square" alt="Docs" /></a>
  <a href="https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7"><img src="https://img.shields.io/badge/Base-Sepolia-blue?style=flat-square&logo=ethereum" alt="Base Sepolia" /></a>
</p>

<p align="center">
  <a href="https://wispy.cc">Website</a> &middot;
  <a href="https://docs.wispy.cc">Docs</a> &middot;
  <a href="https://docs.wispy.cc/developers">API Docs</a> &middot;
  <a href="https://www.npmjs.com/package/wispy-ai">npm</a> &middot;
  <a href="https://github.com/brn-mwai/wispy/issues">Issues</a> &middot;
  <a href="#quickstart">Quickstart</a>
</p>

---

## What is Wispy?

**Wispy is an autonomous AI agent platform** that goes beyond simple chatbots. It can run multi-day tasks independently, make payments for premium APIs, prove its identity on-chain, and communicate with other AI agents — all from a single CLI or API.

Think of it as an AI engineer that can:

- **Plan and execute complex projects** over hours or days (Marathon Mode)
- **Pay for services** automatically using USDC via the x402 protocol
- **Verify its identity** on-chain with ERC-8004 registrations
- **Talk to other agents** using Google's A2A protocol
- **Operate across channels** — CLI, Telegram, WhatsApp, REST API, WebSocket

Wispy is powered by **Google Gemini 2.5 Pro** with configurable thinking budgets up to 24K tokens, giving it deep reasoning capabilities for complex multi-step tasks.

---

## Quickstart

### Install

```bash
npm install -g wispy-ai
```

<details>
<summary><strong>Other installation methods</strong></summary>

**pnpm:**
```bash
pnpm add -g wispy-ai
```

**Homebrew (macOS/Linux):**
```bash
brew tap brn-mwai/wispy && brew install wispy
```

**Shell script (macOS/Linux):**
```bash
curl -fsSL https://wispy.cc/install.sh | bash
```

**PowerShell (Windows):**
```powershell
irm https://wispy.cc/install.ps1 | iex
```

**CMD (Windows):**
```cmd
curl -o install.bat https://wispy.cc/install.bat && install.bat
```

</details>

### Setup

```bash
wispy setup
```

This interactive wizard will configure your AI credentials (Gemini API key or Vertex AI), channels, and optional blockchain integrations.

### Run

```bash
# Interactive chat
wispy chat

# Start the full gateway (API + channels + A2A)
wispy gateway

# Run a marathon (multi-day autonomous task)
wispy marathon "Build a full-stack SaaS dashboard with Next.js"

# Execute a single agent task
wispy agent "Research the DePIN market and produce a detailed report"
```

---

## Features

### Marathon Mode — Multi-Day Autonomous Execution

Wispy's Marathon Mode plans complex tasks into milestones, then executes them autonomously over hours or days. It checkpoints progress, self-recovers from failures, and sends real-time updates via Telegram or WhatsApp.

```bash
wispy marathon "Build and deploy a REST API with auth, tests, and docs"
```

- Deep planning with Gemini 2.5 Pro (up to 24K token thinking budget)
- Autonomous milestone-by-milestone execution
- Self-recovery — analyzes failures and retries with different approaches
- Checkpointing — pause anytime, resume exactly where you left off
- Real-time notifications on progress via Telegram/WhatsApp

### Agentic Commerce — Autonomous Payments with Spending Controls

Wispy handles payments autonomously with a full commerce policy engine. It can pay for premium APIs (x402), send USDC transfers, and manage its own wallet — all with configurable guardrails.

- **Real USDC transfers** on Base via the `wallet_pay` tool
- **Commerce policy engine** — per-transaction limits, daily spending caps, auto-approve thresholds
- **Recipient controls** — whitelist trusted addresses, blacklist known-bad ones
- **MetaMask interop** — export/import private keys to manage your agent's wallet from MetaMask
- **Automatic HTTP 402 handling** — detects payment-required APIs and pays with USDC
- **Full audit trail** — transaction logging, daily ledger, spending summaries

```bash
# Wallet management
/wallet                  # Show address, balance, spending summary
/wallet export           # Export private key for MetaMask
/wallet import <key>     # Import a MetaMask wallet
/wallet fund             # Show funding instructions
/wallet commerce         # View commerce policy & daily spending
/wallet commerce set dailyLimit 50   # Update spending limits
```

### ERC-8004 Identity — Verifiable Agent Registration

Register your agent on-chain using the ERC-8004 standard. This gives Wispy a verifiable, decentralized identity that other agents and services can trust.

- On-chain registration on Base Sepolia
- Reputation tracking system
- Serves `/.well-known/agent.json` for discovery
- Validation framework for trust verification

### A2A Protocol — Agent-to-Agent Communication

Wispy implements Google's Agent-to-Agent protocol for discovering, delegating tasks to, and receiving results from other AI agents.

- Agent card publishing and discovery
- Task delegation with structured messaging
- Secure Ed25519 message signing
- Compatible with the broader A2A ecosystem

### 27+ Built-in Tools

| Category | Tools |
|----------|-------|
| **Code** | File operations, shell execution, project scaffolding |
| **Web** | HTTP requests, web scraping, browser automation (Playwright) |
| **Data** | PDF/DOCX/Excel generation, CSV parsing, chart creation |
| **Media** | Image generation (Imagen 3), image editing, voice TTS |
| **Blockchain** | Wallet management, contract interaction, ENS resolution |
| **Memory** | Vector embeddings, semantic search, conversation history |
| **System** | Cron scheduling, reminders, MCP server integration |

### Multi-Channel Support

| Channel | Description |
|---------|-------------|
| **CLI** | Interactive REPL with rich formatting and voice mode |
| **Telegram** | Full bot with inline responses and thinking indicators |
| **WhatsApp** | Business API integration with media support |
| **REST API** | Public API with key management for third-party integrations |
| **WebSocket** | Real-time streaming for web applications |
| **A2A** | Agent-to-agent protocol server on port 4002 |

### Public REST API

Wispy exposes a full REST API so you can integrate it into your own products. Manage API keys, set scopes and rate limits, and interact with all Wispy features programmatically.

```bash
# Create an API key
wispy api create "My App" --scopes chat,marathon

# Use it
curl -H "Authorization: Bearer wsk_..." https://your-wispy-instance/api/v1/chat \
  -d '{"message": "Hello"}'
```

See the full API documentation at [docs.wispy.cc/developers](https://docs.wispy.cc/developers).

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        WISPY PLATFORM                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   Channels          Core Engine           Protocols                │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────┐          │
│  │ CLI      │     │ Gemini 2.5   │     │ x402         │          │
│  │ Telegram │────▶│ Pro Agent    │────▶│ Payments     │          │
│  │ WhatsApp │     │ + Marathon   │     │ (USDC/Base)  │          │
│  │ REST API │     │   Mode       │     ├──────────────┤          │
│  │ WebSocket│     └──────┬───────┘     │ ERC-8004     │          │
│  └──────────┘            │             │ Identity     │          │
│                          │             ├──────────────┤          │
│   Services               │             │ A2A Protocol │          │
│  ┌──────────┐     ┌──────▼───────┐     │ (Google)     │          │
│  │ Memory   │     │  27+ Tools   │     └──────────────┘          │
│  │ Cron     │     │  + MCP       │                               │
│  │ Skills   │     │  Servers     │     Security                  │
│  │ Browser  │     └──────────────┘     ┌──────────────┐          │
│  │ Voice    │                          │ Trust Ctrl   │          │
│  └──────────┘                          │ Device Auth  │          │
│                                        │ Rate Limits  │          │
│                                        └──────────────┘          │
└────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Option 1: Gemini API Key (Simplest)

```env
GEMINI_API_KEY=your-api-key
```

Get your key at [Google AI Studio](https://aistudio.google.com/apikey).

### Option 2: Vertex AI (Production)

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

Then authenticate:

```bash
gcloud auth application-default login
```

### Full Configuration

Wispy uses `~/.wispy/config.yaml`:

```yaml
agent:
  name: Wispy
  id: wispy-agent-001

gemini:
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
  thinkingLevel: ultra       # Thinking budget: low | medium | high | ultra
  checkpointInterval: 5

wallet:
  enabled: true
  chain: base-sepolia
  commerce:
    maxPerTransaction: 1.0
    dailyLimit: 10.0
    autoApproveBelow: 0.10

channels:
  telegram:
    enabled: true
  whatsapp:
    enabled: true
  rest:
    enabled: true
    port: 4001
  web:
    port: 4000

security:
  autonomousMode: false      # Auto-approve file/code operations
  actionGuard:
    enabled: true

memory:
  heartbeatIntervalMinutes: 30
```

---

## Security

Wispy is built with security as a first-class concern:

- **Device Identity** — Ed25519 keypair generated per device for authentication
- **Encrypted Storage** — AES-256-GCM encryption for credentials and sensitive data
- **Trust Controller** — Approval workflows for sensitive operations (file writes, payments, shell commands)
- **Action Guard** — Configurable rules for what the agent can and cannot do autonomously
- **API Key System** — Scoped keys with rate limiting, expiry, and usage tracking
- **Secret Scanner** — Automatic detection and redaction of API keys in outputs
- **Loop Detection** — Prevents infinite tool execution loops
- **Session Isolation** — Separate contexts for different users and channels

---

## CLI Reference

```
wispy chat              Interactive chat session
wispy gateway           Start full gateway (API + channels + A2A)
wispy marathon <goal>   Start autonomous multi-day task execution
wispy agent <task>      Execute a single agent task
wispy setup             Interactive configuration wizard
wispy doctor            Diagnose configuration issues
wispy skill <name>      Run a specific skill
wispy api create        Create an API key
wispy api list          List API keys
wispy api revoke <id>   Revoke an API key
wispy voice             Enter voice mode
wispy history           View conversation history
```

---

## Technical Specs

| Component | Details |
|-----------|---------|
| **AI Engine** | Google Gemini 2.5 Pro / Flash via Vertex AI or API key |
| **Thinking Budget** | 128 — 24,576 tokens (configurable) |
| **Runtime** | Node.js 20+, TypeScript 5.7, ESM |
| **Blockchain** | Base Sepolia (chainId: 84532) |
| **Payments** | USDC on Base via x402 protocol + commerce policy engine |
| **Identity** | ERC-8004 on-chain agent registration |
| **Agent Comms** | A2A Protocol (Google) |
| **Tools** | 27+ built-in + MCP server support |
| **Channels** | CLI, Telegram, WhatsApp, REST API, WebSocket, A2A |
| **Memory** | SQLite + vector embeddings (text-embedding-004) |
| **Browser** | Playwright-based headless automation |

---

## API Usage

### Chat

```typescript
import { Agent } from 'wispy-ai';

const agent = new Agent({ config, runtimeDir, soulDir });

for await (const chunk of agent.chatStream("Build a landing page", "user-1", "api")) {
  process.stdout.write(chunk.content);
}
```

### Marathon

```typescript
const marathon = agent.startMarathon("Build a full-stack app with auth and tests");

marathon.on('milestone', (m) => console.log(`Completed: ${m.name}`));
marathon.on('complete', (result) => console.log('Done!', result));
```

### REST API

```bash
# Create API key
wispy api create "My Integration" --scopes chat,chat:stream,marathon

# Chat
curl -X POST https://localhost:4001/api/v1/chat \
  -H "Authorization: Bearer wsk_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Wispy"}'

# Stream (SSE)
curl -N https://localhost:4001/api/v1/chat/stream \
  -H "Authorization: Bearer wsk_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain quantum computing"}'
```

Full API docs: [docs.wispy.cc/developers](https://docs.wispy.cc/developers)

---

## Deployed Contracts

| Contract | Address | Network |
|----------|---------|---------|
| Agent Registry | [`0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7`](https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7) | Base Sepolia |
| USDC (Sandbox) | `0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8` | SKALE BITE V2 Sandbox |
| Algebra SwapRouter | `0x3012E9049d05B4B5369D690114D5A5861EbB85cb` | SKALE BITE V2 Sandbox |
| Algebra Factory | `0x10253594A832f967994b44f33411940533302ACb` | SKALE BITE V2 Sandbox |

---

## Documentation

Full documentation is available at **[docs.wispy.cc](https://docs.wispy.cc)**:

- [Getting Started](https://docs.wispy.cc/getting-started) — Installation, setup, first chat
- [Marathon Mode](https://docs.wispy.cc/marathon) — Multi-day autonomous task execution
- [Agentic Commerce](https://docs.wispy.cc/commerce) — Wallet, payments, commerce policies
- [API Reference](https://docs.wispy.cc/developers) — REST API, WebSocket, authentication
- [Channels](https://docs.wispy.cc/channels) — Telegram, WhatsApp, CLI, REST
- [Tools](https://docs.wispy.cc/tools) — Built-in tools, MCP servers, custom skills
- [Security](https://docs.wispy.cc/security) — Trust controller, device auth, action guard
- [Configuration](https://docs.wispy.cc/config) — Full config reference

---

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/brn-mwai/wispy).

```bash
git clone https://github.com/brn-mwai/wispy.git
cd wispy
npm install
npm run build
npm run dev
```

---

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>Wispy</strong> is built by <a href="https://hausorlabs.tech">Hausor Labs Team (HL Team)</a>
</p>

<p align="center">
  <a href="https://wispy.cc">wispy.cc</a> &middot;
  <a href="https://docs.wispy.cc">docs</a> &middot;
  <a href="https://www.npmjs.com/package/wispy-ai">npm</a> &middot;
  <a href="https://github.com/brn-mwai/wispy">GitHub</a>
</p>
