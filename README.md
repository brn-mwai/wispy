# Wispy ☁️👀

**Autonomous AI Agent Platform powered by Google Gemini 3**

Wispy is an open-source, self-hostable autonomous AI agent with **Marathon Mode** — multi-day task execution with self-verification and recovery. Control it from your phone via Telegram, get real-time progress updates, and let it work autonomously while you sleep.

Built for the **Google Gemini 3 Hackathon** — showcasing the "Action Era" of autonomous AI agents.

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
4. **Real-time Updates** — Get Telegram/Discord/Slack notifications on progress
5. **Resume Anytime** — Pause, resume, or restore from checkpoints

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

**Example workflow:**
```
You: /marathon Create a React dashboard with charts and auth

Wispy: 🏃 Starting Marathon...
       Planning with ultra thinking...

[2 hours later]

Wispy: ✅ Milestone Completed: Set up Next.js project
       Progress: 1/6 (17%)

[4 hours later]

Wispy: 🎉 Marathon Completed!
       Goal: Create a React dashboard
       Milestones: 6/6
       Artifacts: 24 files created
```

---

## Features

- **Marathon Mode** — Autonomous multi-day task execution with self-verification
- **Ultra Thinking** — 65K token budget for complex planning and reasoning
- **Telegram Control** — Start, pause, resume marathons from your phone
- **Multi-Agent System** — 8 specialized agents that collaborate on complex tasks
- **27+ Integrations** — Google, Discord, Slack, GitHub, Notion, and more
- **Interactive CLI** — Claude Code-level REPL with markdown rendering
- **Voice Mode** — Whisper STT + Piper TTS for hands-free interaction
- **MCP Server** — Model Context Protocol for IDE integration
- **Memory System** — Vector embeddings with long-term recall
- **7-Layer Security** — Device identity, AES-256-GCM encryption, session isolation

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
wispy gateway                           # Full gateway with Telegram
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

### REPL Commands

```
/marathon <goal>    Start marathon from REPL
/status            Marathon/system status
/help              Show all commands
/voice on          Start voice mode
/model pro         Switch model
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

### Marathon Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MARATHON MODE                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📝 Goal: "Build e-commerce app"                           │
│                                                             │
│  🧠 Ultra Thinking (65K tokens)                            │
│     └─→ Decompose into milestones                          │
│                                                             │
│  📋 Milestones:                                            │
│     ✅ 1. Set up Next.js project                           │
│     ✅ 2. Create database schema                           │
│     🔄 3. Build product catalog     ← Current              │
│     ⏳ 4. Implement cart system                             │
│     ⏳ 5. Add Stripe payments                               │
│     ⏳ 6. Deploy to Vercel                                  │
│                                                             │
│  📱 Telegram: Real-time updates to your phone             │
│  💾 Checkpoints: Restore to any milestone                  │
│  🔁 Recovery: Auto-retry with different approach           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Multi-Agent System

| Agent | Role |
|-------|------|
| **Coder** | Code generation, debugging, refactoring |
| **Researcher** | Web search, analysis, summarization |
| **Writer** | Content creation, copywriting, docs |
| **DevOps** | CI/CD, deployment, infrastructure |
| **Designer** | UI/UX design, accessibility |
| **Data** | SQL, data analysis, visualization |
| **Security** | Audit, vulnerability scanning |
| **Planner** | Task breakdown, project planning |

---

## Integrations (27+)

| Category | Integrations |
|----------|-------------|
| **Google** | Calendar, Gmail, Drive, Docs, Sheets, Meet, Maps, YouTube |
| **Chat** | Discord, Slack, WhatsApp, **Telegram** |
| **AI Models** | Gemini 3, OpenAI, Anthropic, Ollama |
| **Productivity** | Notion, Obsidian, GitHub, Linear |
| **Payments** | x402 USDC Wallet |

---

## Tech Stack

- **Runtime**: TypeScript, Node.js 20+
- **AI**: Google Gemini 3 with Ultra Thinking
- **CLI**: Commander.js, Chalk, Ora
- **Telegram**: grammy
- **Protocols**: MCP, A2A (Ed25519), x402 (ethers.js)
- **Data**: SQLite + vector embeddings
- **Security**: AES-256-GCM, Ed25519

---

## Why Marathon Mode Wins

| Traditional Agents | Wispy Marathon Mode |
|-------------------|---------------------|
| Single task → done | Multi-day autonomous execution |
| Fails → stops | Fails → analyzes → recovers |
| No verification | Self-verification at each step |
| Manual monitoring | Real-time Telegram updates |
| Lost context on pause | Thought signatures preserve state |

**This is the "Action Era"** — AI that works autonomously while you sleep.

---

## License

MIT

---

**Built for the Google Gemini 3 Hackathon** ☁️👀

*Control your AI agent from Telegram. Let it work while you sleep.*
