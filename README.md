# Wispy ☁️👀

**Autonomous AI Agent Platform powered by Google Gemini 3**

Wispy is an open-source, self-hostable autonomous AI agent with **Marathon Mode** — multi-day task execution with self-verification and recovery. Control it from your phone via Telegram or WhatsApp, monitor progress via the real-time Web Dashboard, and let it work autonomously while you sleep.

Built for the **Google Gemini 3 Hackathon** — showcasing the "Action Era" of autonomous AI agents.

---

## What Sets Wispy Apart

| Feature | Other AI Agents | Wispy |
|---------|----------------|-------|
| Task duration | Single session | **Multi-day marathon** |
| Failure handling | Stops | **Auto-recovery with different approach** |
| Verification | None | **Self-verification at each milestone** |
| Monitoring | Manual CLI | **Real-time Web Dashboard + Mobile notifications** |
| Context on pause | Lost | **Thought Signatures preserve reasoning** |
| Channels | One or two | **WhatsApp, Telegram, Discord, Slack, Web** |
| Browser control | Limited | **Full CDP automation** |

---

## Marathon Mode — The Killer Feature

Marathon Mode enables truly autonomous multi-day task execution:

```
/marathon Build a full-stack e-commerce app with Next.js, Stripe, and Postgres
```

**What happens:**
1. **Ultra Thinking (65K tokens)** — Deep planning decomposes your goal into milestones
2. **Autonomous Execution** — Each milestone is executed, verified, and checkpointed
3. **Self-Recovery** — If something fails, it analyzes the error and tries a different approach
4. **Real-time Updates** — Get Telegram/WhatsApp/Discord/Slack notifications on progress
5. **Resume Anytime** — Pause, resume, or restore from checkpoints
6. **Web Dashboard** — Visual monitoring with progress bars and live logs

---

## Web Dashboard

Access the real-time Marathon monitoring dashboard at `http://localhost:4001/dashboard`:

- **Live Progress Visualization** — See milestone completion in real-time
- **Token & Cost Tracking** — Monitor usage and spending
- **Activity Logs** — Watch what the agent is doing
- **Artifact Viewer** — See files created during the marathon
- **Controls** — Pause, resume, or abort from the browser
- **Marathon History** — View past runs and their results

---

## Multi-Channel Support

### Telegram Integration

Control your AI agent from your phone:

| Command | Description |
|---------|-------------|
| `/marathon <goal>` | Start autonomous task |
| `/status` | Check progress with visual milestones |
| `/pause` | Pause current marathon |
| `/resume` | Continue where you left off |
| `/abort` | Stop the marathon |
| `/list` | View all marathons |

### WhatsApp Integration (NEW)

Same commands, different prefix:

| Command | Description |
|---------|-------------|
| `!marathon <goal>` | Start autonomous task |
| `!status` | Check progress |
| `!pause` | Pause marathon |
| `!resume` | Resume marathon |
| `!abort` | Stop marathon |
| `!list` | View all marathons |
| `!help` | Show help |

**Setup WhatsApp:**
1. Enable WhatsApp in your config: `channels.whatsapp.enabled: true`
2. Start the gateway: `wispy gateway`
3. Scan the QR code that appears in your terminal
4. Send `!help` to your own WhatsApp number

---

## Browser Control (NEW)

Wispy includes full browser automation via Chrome DevTools Protocol:

```typescript
// Tool calls available to the agent:
browser_navigate({ url: "https://example.com" })
browser_click({ selector: "button.submit" })
browser_type({ selector: "input[name=email]", text: "user@example.com" })
browser_screenshot({ fullPage: true })
browser_snapshot()  // Get page content + screenshot for AI analysis
browser_scroll({ direction: "down" })
browser_tabs()
browser_new_tab({ url: "https://google.com" })
browser_press_key({ key: "Enter" })
```

**Setup Browser Control:**
1. Start Chrome with remote debugging: `chrome --remote-debugging-port=9222`
2. Or let Wispy launch a browser automatically
3. Configure in your config: `browser.enabled: true`

---

## Features

### Core Capabilities
- **Marathon Mode** — Autonomous multi-day task execution with self-verification
- **Ultra Thinking** — 65K token budget for complex planning and reasoning
- **Web Dashboard** — Real-time visual monitoring and control
- **Browser Control** — CDP-based automation for web tasks

### Communication Channels
- **Telegram** — Full marathon control with notifications
- **WhatsApp** — Same capabilities via Baileys integration
- **Discord** — Bot integration with channel support
- **Slack** — Workspace integration
- **REST API** — Programmatic access
- **WebSocket** — Real-time streaming

### Multi-Agent System
- **8 Specialized Agents** — Coder, Researcher, Writer, DevOps, Designer, Data, Security, Planner
- **Orchestrator** — Automatic task routing to the right agent
- **Agent Collaboration** — Agents can call other agents for complex tasks

### Security
- **Device Identity** — Ed25519 keys for device authentication
- **AES-256-GCM** — Encrypted credential storage
- **API Key Scanner** — Automatic detection and redaction
- **Session Isolation** — Per-user session boundaries
- **Rate Limiting** — Prevent abuse
- **Audit Logging** — Track all actions

### Integrations (27+)
- **Google** — Calendar, Gmail, Drive, Docs, Sheets, Meet, Maps, YouTube
- **Chat** — Discord, Slack, WhatsApp, Telegram
- **AI Models** — Gemini 3, OpenAI, Anthropic, Ollama
- **Productivity** — Notion, Obsidian, GitHub, Linear
- **Payments** — x402 USDC Wallet on Base

### Additional Features
- **Interactive CLI** — Claude Code-level REPL with markdown rendering
- **Voice Mode** — Whisper STT + Piper TTS for hands-free interaction
- **MCP Server** — Model Context Protocol for IDE integration
- **Memory System** — Vector embeddings with long-term recall
- **Cron Jobs** — Scheduled task execution
- **Skills System** — Modular capabilities from wispy/skills/

---

## Quick Start

### Install globally

```bash
npm i -g wispy-ai
```

### Setup

```bash
wispy setup
```

### Run

```bash
wispy chat                              # Interactive REPL
wispy marathon "Build a todo app"       # Start a marathon
wispy gateway                           # Full gateway with all channels
```

### From source

```bash
git clone https://github.com/brn-mwai/wispy.git
cd wispy
npm install
npm run build
cp .env.example .env
# Add your GEMINI_API_KEY to .env
node bin/wispy.js setup
```

---

## Configuration

Create `~/.wispy/config.yaml`:

```yaml
agent:
  name: Wispy
  id: wispy-agent

gemini:
  apiKey: ${GEMINI_API_KEY}
  models:
    pro: gemini-2.5-pro
    flash: gemini-2.5-flash
    image: gemini-pro-vision
    embedding: text-embedding-004

channels:
  telegram:
    enabled: true
    token: ${TELEGRAM_BOT_TOKEN}
  whatsapp:
    enabled: true
  web:
    enabled: true
    port: 4000
  rest:
    enabled: true
    port: 4001

browser:
  enabled: true
  cdpUrl: http://localhost:9222  # Optional

memory:
  embeddingDimensions: 768
  heartbeatIntervalMinutes: 30

wallet:
  enabled: false
  chain: base
  autoPayThreshold: 0.001

security:
  requireApprovalForExternal: true
  allowedGroups: []
```

---

## CLI Commands

### Marathon Commands

```
wispy marathon "goal"     Start a new marathon
wispy marathon status     Check current marathon
wispy marathon pause      Pause active marathon
wispy marathon resume     Resume paused marathon
wispy marathon abort      Stop marathon
wispy marathon list       List all marathons
```

### Other Commands

```
wispy gateway             Start full gateway with all channels
wispy chat                Interactive REPL
wispy setup               Interactive setup wizard
wispy doctor              Check system health
wispy mcp                 Start MCP server for IDE
```

### REPL Commands

```
/marathon <goal>    Start marathon from REPL
/status            Marathon/system status
/help              Show all commands
/voice on          Start voice mode
/model pro         Switch model
/context           Show context usage
/clear             Clear screen
```

---

## Thinking Levels

Wispy uses Gemini 3's thinking capabilities strategically:

| Level | Token Budget | Use Case |
|-------|--------------|----------|
| minimal | 128 | Quick responses |
| low | 1,024 | Simple tasks |
| medium | 4,096 | Standard operations |
| high | 16,384 | Complex reasoning |
| **ultra** | **65,536** | Marathon planning |

---

## Architecture

```
User Goal → Ultra Thinking → Milestone Plan → Autonomous Execution
                                                      ↓
                                              Self-Verification
                                                      ↓
                                              ✅ or 🔄 Recovery
                                                      ↓
                                              Next Milestone...
```

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         WISPY GATEWAY                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Channels:                          Core:                          │
│  ┌──────────┐  ┌──────────┐       ┌──────────────────────────┐   │
│  │ Telegram │  │ WhatsApp │       │ Marathon Service         │   │
│  └────┬─────┘  └────┬─────┘       │  - Planner (Ultra)       │   │
│       │              │             │  - Executor              │   │
│  ┌────┴─────┐  ┌────┴─────┐       │  - Checkpoints           │   │
│  │ Discord  │  │  Slack   │       └──────────┬───────────────┘   │
│  └────┬─────┘  └────┬─────┘                  │                    │
│       │              │             ┌──────────┴───────────────┐   │
│  ┌────┴─────┐  ┌────┴─────┐       │ Multi-Agent System       │   │
│  │  REST    │  │    WS    │       │  - Orchestrator          │   │
│  └────┬─────┘  └────┬─────┘       │  - 8 Specialized Agents  │   │
│       │              │             └──────────┬───────────────┘   │
│       └──────┬───────┘                        │                    │
│              │                     ┌──────────┴───────────────┐   │
│              ▼                     │ Browser Controller       │   │
│       ┌──────────────┐            │  - CDP Automation        │   │
│       │    Agent     │◄───────────┤  - Screenshot/Snapshot   │   │
│       │   (Gemini)   │            └───────────────────────────┘   │
│       └──────┬───────┘                                            │
│              │                                                     │
│       ┌──────┴──────────────────────────────────────────────┐    │
│       │                    Tools                             │    │
│       │  file_* | bash | browser_* | web_* | memory_* | ... │    │
│       └─────────────────────────────────────────────────────┘    │
│                                                                    │
│  Dashboard: http://localhost:4001/dashboard                       │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/chat` | POST | Send message |
| `/api/v1/chat/stream` | POST | Stream response (SSE) |
| `/dashboard` | GET | Web Dashboard |
| `/dashboard/api/marathons` | GET | List marathons |
| `/dashboard/api/status` | GET | Active marathon status |
| `/dashboard/api/marathons/pause` | POST | Pause marathon |
| `/dashboard/api/marathons/abort` | POST | Abort marathon |

### WebSocket Protocol

Connect to `ws://localhost:4000` and send:
```json
{
  "type": "chat",
  "payload": {
    "message": "Your message",
    "peerId": "user-123",
    "channel": "web"
  }
}
```

---

## Tech Stack

- **Runtime**: TypeScript, Node.js 20+
- **AI**: Google Gemini 3 with Ultra Thinking
- **CLI**: Commander.js, Chalk, Ora
- **Telegram**: grammy
- **WhatsApp**: @whiskeysockets/baileys
- **Browser**: playwright-core (CDP)
- **Protocols**: MCP, A2A (Ed25519), x402 (ethers.js)
- **Data**: SQLite + vector embeddings
- **Security**: AES-256-GCM, Ed25519, tweetnacl

---

## License

MIT

---

**Built for the Google Gemini 3 Hackathon** ☁️👀

*Control your AI agent from Telegram or WhatsApp. Monitor via Web Dashboard. Let it work while you sleep.*

---

## Links

- **npm**: https://www.npmjs.com/package/wispy-ai
- **GitHub**: https://github.com/brn-mwai/wispy
- **Issues**: https://github.com/brn-mwai/wispy/issues
