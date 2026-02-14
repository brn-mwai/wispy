# Changelog

All notable changes to Wispy are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.0] — 2026-02-14 — x402 Hackathon Submission

### Added

#### Agentic Commerce Integration (`src/integrations/agentic-commerce/`)
- Complete autonomous agent commerce system on SKALE BITE V2 Sandbox
- 25 TypeScript files, 4,470 lines of code, 46 tests — all passing
- 11 new agent tools registered into Wispy's tool system
- Targets all 5 tracks of the SF Agentic Commerce x402 Hackathon

#### Track 1 — Overall Best Agent
- End-to-end commerce lifecycle: discover paid API → evaluate ROI → pay → deliver → audit
- Agent autonomously chains multiple paid API calls to complete complex tasks
- Full audit trail with per-call spend tracking and daily ledger

#### Track 2 — x402 Tool Usage
- `x402/buyer.ts`: HTTP 402 detection, EIP-3009 signed USDC authorization, retry with payment proof
- `x402/seller.ts`: mock x402 seller endpoints with configurable pricing
- `x402/tracker.ts`: per-call spend tracking, daily budget enforcement, audit trail
- Commerce policy engine: per-transaction limits, daily caps, auto-approve thresholds

#### Track 3 — AP2 Integration
- `ap2/mandates.ts`: Intent → Cart → Payment → Receipt mandate objects
- `ap2/receipts.ts`: payment receipts with transaction records
- `ap2/flow.ts`: AP2 orchestration engine with failure handling and rollback

#### Track 4 — DeFi Agent
- `defi/swap.ts`: Algebra DEX integration (SwapRouter + QuoterV2 price quotes)
- Subgraph queries for pool discovery and market research
- On-chain pool checks via `AlgebraFactory.poolByPair()`
- Direct USDC transfer fallback when no liquidity pools exist
- `defi/risk-engine.ts`: position limits, volatility checks, slippage controls

#### Track 5 — Encrypted Agents (BITE v2)
- `bite/encrypted-tx.ts`: BLS threshold encryption of transaction `to` + `data` fields
- On-chain submission to SKALE BITE magic address
- Decryption verification via `bite_getDecryptedTransactionData` RPC
- `bite/conditional.ts`: conditional execution — time-lock, delivery-proof, oracle gates

#### Demo Infrastructure
- `demo/server.ts`: launches 4 mock x402 services on ports 4021–4024
- `demo/runner.ts`: runs all 5 track demos end-to-end
- `demo/verify.ts`: on-chain verification utilities
- 5 track-specific demo scenarios with detailed output

#### Configuration & Contracts
- SKALE BITE V2 Sandbox chain config (Chain ID: 103698795)
- Algebra DEX contract addresses (11 contracts)
- Full ABIs: SwapRouter, QuoterV2, Factory, ERC-20
- viem chain definition, service pricing, commerce policy defaults

### Changed
- Registered agentic-commerce integration in loader
- Fixed Gemini tool schema compatibility for commerce tool parameters
- Updated agent prompt system for commerce-aware behavior

---

## [1.3.0] — 2026-02-07

### Added
- Documentation links to docs.wispy.cc across README

### Changed
- Updated README with agentic commerce features overview
- Version bump to 1.3.0

---

## [1.2.0] — 2026-02-07

### Added

#### CLI Overhaul
- New `OutputRenderer` class with markdown-aware terminal rendering (`src/cli/tui/output-renderer.ts`)
- Structured tool call display with `⏺` markers, Title Case names, indented args, and duration badges (`src/cli/ui/tool-display.ts`)
- Status bar wired into REPL — shows tokens, cost, session, and context usage between responses
- Structured response lifecycle: thinking → tool calls → formatted markdown → stats line
- Connected CLI mode via WebSocket — attach multiple CLIs to a running gateway (`src/cli/connected-repl.ts`)
- `--connect [url]` flag on `wispy chat` command with auto-detect of running gateway
- Gateway sync protocol: `CliConnectFrame`, `CliBroadcastFrame`, `SessionUpdateFrame` for multi-CLI state sync

#### Antigravity Channel (VS Code Extension)
- New channel adapter for VS Code Antigravity extension (`src/channels/antigravity/adapter.ts`)
- Google Account authentication — extension users identified by `googleId`, `email`, `displayName`
- `AntigravityConnectFrame` and `AntigravityWelcomeFrame` gateway protocol frames
- Capabilities welcome message sent on connect (chat, memory, file ops, bash, marathon, a2a, skills)
- Cross-channel event broadcasting between Antigravity and other channels (Telegram, CLI, etc.)
- Gateway auto-starts Antigravity adapter; shows `Antigravity: ready` in startup summary

#### Multimodal Input
- Image file support in CLI chat — attach images by path (e.g., `analyze this /path/to/image.png`)
- `/image <path> [prompt]` command for direct image analysis
- `ImagePart` interface in Gemini integration for inline base64 image data
- Images passed through `chatStream()` to Gemini's multimodal API

#### Live Model Switching
- `/model` command now hot-swaps the active model without restart
- `/vertex enable` hot-swaps with Gemini re-initialization
- `Agent.updateConfig()` method for runtime config updates

#### MCP Server Upgrade
- Complete rewrite of MCP server with 18+ tools for Antigravity integration (`src/mcp/server.ts`)
- Tools: `wispy_chat`, `wispy_chat_with_image`, `wispy_memory_search/save`, `wispy_file_read/write/list`, `wispy_bash`, `wispy_web_fetch`, `wispy_channel_list/send`, `wispy_session_list`, `wispy_model_switch/status`, `wispy_schedule_task`, `wispy_wallet_balance`, `wispy_marathon_start/status`, `wispy_a2a_delegate`, `wispy_skills_list`
- Vertex AI support in MCP server — auto-detects config or environment credentials
- Skills and MCP registry wired into the MCP server agent

#### x402scan — On-Chain Transaction Scanner
- New `X402Scanner` class for scanning Base blockchain USDC transactions (`src/wallet/x402-scan.ts`)
- `/x402scan` CLI command — full wallet scan with balance, spending stats, top recipients, runway estimate
- `/x402scan history` — recent USDC transaction list with direction, peer, and date
- `/x402scan verify <txHash>` — on-chain transaction verification with confirmations and block info
- `/x402scan reconcile` — compare on-chain transactions vs local log, detect missing entries
- MCP tools: `wispy_x402scan`, `wispy_x402scan_verify`, `wispy_x402scan_history`
- BaseScan API integration for token transfer history (mainnet + Sepolia)
- Fallback to local transaction log when BaseScan is unavailable

### Changed
- REPL response flow restructured — cleaner output with blank lines, no separator clutter
- Gateway `ClientManager` supports three client types: `web`, `cli`, `antigravity`
- Gateway protocol adds `tool_result` chunk type to `StreamFrame`
- Gateway shutdown cleans up Antigravity adapter
- Version bumped to 1.2.0

---

## [1.0.0] — 2026-02-06

### Added

#### Public REST API
- Full REST API with 16+ endpoints for third-party integrations (`src/api/router.ts`)
- API key management system with scoped permissions, rate limiting, and usage tracking (`src/api/keys.ts`)
- Endpoints: `/chat`, `/chat/stream` (SSE), `/sessions`, `/memory/search`, `/marathon`, `/generate/image`, `/skills`, `/tools`, `/usage`, `/webhooks`
- CLI commands: `wispy api create`, `wispy api list`, `wispy api revoke`, `wispy api delete`
- API documentation page at [wispy.cc/developers](https://wispy.cc/developers)

#### Cross-Platform Installers
- Shell installer for macOS/Linux (`curl -fsSL https://wispy.cc/install.sh | bash`)
- PowerShell installer for Windows (`irm https://wispy.cc/install.ps1 | iex`)
- CMD batch installer for Windows (`curl -o install.bat https://wispy.cc/install.bat && install.bat`)
- Homebrew formula (`brew tap brn-mwai/wispy && brew install wispy`)

#### Marathon Mode v2 — Visual Dashboard
- Real-time progress visualization with milestone tracking
- Telegram inline visual updates with progress bars
- Pause, resume, and abort controls
- Status endpoint: `GET /api/v1/marathon/:id`

### Changed
- Replaced basic REST adapter with comprehensive public API router
- Gateway server now mounts public API with CORS, rate limit headers, and request IDs
- Updated homepage to `https://wispy.cc`
- Updated postinstall documentation link
- Complete README rewrite with comprehensive documentation

### Security
- Added `.gitignore` rules for credential files (`gen-lang-client-*.json`, `*.pem`, `*.key`)
- API keys use SHA-256 hashing with `wsk_` prefix
- Per-key scoped permissions: `chat`, `sessions`, `memory`, `marathon`, `skills`, `tools`, `admin`
- Rate limiting per API key (configurable req/min)
- Key expiry support with automatic validation

---

## [0.7.0] — 2026-01-30

### Added

#### Gemini 3 Support
- Thinking levels: `low`, `medium`, `high`, `ultra` (128 — 24,576 tokens)
- Thought signatures — cryptographic signing of reasoning chains
- Thought continuity across sessions
- Configurable thinking budget per command

#### Protocol Integrations
- **x402 Payments** — Automatic USDC payments on Base for HTTP 402 responses
- **ERC-8004 Identity** — On-chain agent registration with reputation system
- **A2A Protocol** — Google's Agent-to-Agent discovery and task delegation
- **Chainlink CRE** — Chainlink Runtime Environment integration

#### Wallet System
- USDC wallet with Coinbase CDP integration
- Configurable spending limits per task
- Transaction logging and audit trail
- Daemon mode for background operation

#### Trust Controller
- Approval workflows for sensitive operations
- Configurable action guard rules
- Autonomous mode toggle for CI/CD environments

#### Voice System
- Text-to-speech with Google Cloud TTS and gTTS
- Voice input mode in CLI
- Multi-provider support

### Changed
- Agent core refactored for streaming responses (`chatStream`)
- Context compaction to prevent overflow in long conversations
- Upgraded to Commander 12 for CLI

---

## [0.6.2] — 2026-01-29

### Added
- **Web Dashboard for Marathon Monitoring**
  - Real-time progress visualization with animated progress bars
  - Live activity logs showing agent actions
  - Token and cost tracking display
  - Artifact viewer showing created files
  - Pause/Abort controls from the browser
  - Marathon history view
  - Auto-refresh every 5 seconds
  - Dark theme modern UI
  - Access at `http://localhost:4001/dashboard`

- **WhatsApp Integration via Baileys**
  - QR code pairing in terminal
  - Full Marathon command support with `!` prefix
  - Real-time notifications to WhatsApp
  - Auto-pairing on first message

- **Browser Control via CDP (Chrome DevTools Protocol)**
  - `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`
  - `browser_snapshot` — Get page content + screenshot for AI analysis
  - `browser_scroll`, `browser_tabs`, `browser_new_tab`, `browser_close_tab`, `browser_press_key`
  - Based on playwright-core for reliable automation

### Changed
- Gateway startup now shows Dashboard, Telegram, and WhatsApp status
- REST adapter now accepts runtimeDir for Marathon service access

### Dependencies
- Added `playwright-core` for browser automation
- Added `qrcode-terminal` for WhatsApp QR display
- Added `@hapi/boom` for Baileys error handling

---

## [0.6.1] — 2026-01-29

### Added
- **Full Telegram Integration with Marathon Mode**
  - `/marathon <goal>` — Start autonomous multi-day tasks from Telegram
  - `/status`, `/pause`, `/resume`, `/abort`, `/list` commands
- **Real-time Telegram Notifications**
  - Milestone completion alerts pushed to your phone
  - Failure notifications with error details
  - Marathon completion summary with artifacts list
- `sendTelegramMessage()` export for programmatic notifications

### Fixed
- API key now properly passed to Telegram adapter for Marathon operations

---

## [0.6.0] — 2026-01-29

### Added
- **Marathon Agent Mode** — Autonomous multi-day task execution
  - Ultra Thinking (65,536 token budget) for complex goal planning
  - Milestone-based execution with self-verification
  - Auto-recovery on failure with different approaches
  - Thought Signatures for reasoning continuity across sessions
  - Checkpoint system for pause/resume/restore
- **Marathon Module** (`src/marathon/`)
  - `types.ts`, `planner.ts`, `executor.ts`, `service.ts`
- **CLI Commands**: `wispy marathon`, `wispy marathon status/pause/resume/abort/list`
- **REPL Command**: `/marathon <goal>`
- `generateWithThinking()` function for standalone thinking calls

---

## [0.5.1] — 2026-01-29

### Fixed
- **SQLite Migration Order** — Fixed "no such column: expires_at" error
  - CREATE INDEX now runs after ALTER TABLE migration

---

## [0.5.0] — 2026-01-28

### Added
- Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini Pro Image support
- text-embedding-004 for vector memory
- Gemma 3 via Ollama for local inference
- Token budget management with automatic enforcement
- Context windowing for long conversations
- Cost estimation and tracking
- Smart model routing based on task complexity
- MCP server improvements and VS Code compatibility

---

## [0.4.0] — 2026-01-27

### Added
- Rich terminal UI with status bar, token count, and context percentage
- History browser with keyboard navigation
- Skill creation wizard with template generation

### Changed
- Complete config generation from setup wizard
- New cloud logo design and compact banner

---

## [0.3.0] — 2026-01-26

### Changed
- Clean terminal UI — removed all emojis, silenced verbose logs
- Minimal, professional interface

---

## [0.2.0] — 2026-01-26

### Added
- Onboarding wizard — interactive first-run setup
- Theme system: Dawn, Day, Dusk, Night
- Pixel cloud logo ASCII art
- Weather-themed spinner phrases

---

## [0.1.0] — 2026-01-25

### Added
- **Initial Release** — Wispy: Autonomous AI Agent Platform
- Core agent system with Gemini AI integration
- Multi-agent system with 8 specialized agents
- 27+ integrations (Google, Discord, Slack, GitHub, Notion, etc.)
- Interactive CLI with 19 commands and 16 REPL slash commands
- Voice mode with Whisper STT and TTS
- Memory system with SQLite + vector embeddings
- MCP server for IDE integration
- A2A protocol with Ed25519-signed task delegation
- x402 wallet with USDC on Base
- 7-layer security (device identity, encryption, action guards, session isolation, rate limiting, audit logging)
- Gateway server with WebSocket, REST, and A2A endpoints
- Two-directory design: `wispy/` (soul files) and `.wispy/` (runtime data)

---

## Version History

| Version | Date | Highlight |
|---------|------|-----------|
| **1.4.0** | **2026-02-14** | **x402 Hackathon: Agentic Commerce on SKALE (all 5 tracks, 46 tests)** |
| 1.3.0 | 2026-02-07 | docs.wispy.cc links, README updates |
| 1.2.0 | 2026-02-07 | CLI overhaul, Antigravity channel, multimodal, model switching, x402scan |
| 1.0.0 | 2026-02-06 | Public REST API, cross-platform installers, production release |
| 0.7.0 | 2026-01-30 | Gemini 3 thinking levels, x402, ERC-8004, A2A protocols |
| 0.6.2 | 2026-01-29 | Web Dashboard, WhatsApp, Browser Control |
| 0.6.1 | 2026-01-29 | Full Telegram integration with Marathon |
| 0.6.0 | 2026-01-29 | Marathon Agent Mode (autonomous multi-day tasks) |
| 0.5.x | 2026-01-28 | Gemini ecosystem integration, token management |
| 0.4.0 | 2026-01-27 | Rich terminal UI, skill wizard |
| 0.3.0 | 2026-01-26 | Clean terminal UI |
| 0.2.0 | 2026-01-26 | Onboarding wizard, themes |
| 0.1.0 | 2026-01-25 | Initial release |

---

## Links

- **Website**: [wispy.cc](https://wispy.cc)
- **npm**: [npmjs.com/package/wispy-ai](https://www.npmjs.com/package/wispy-ai)
- **GitHub**: [github.com/hausorlabs/wispy](https://github.com/hausorlabs/wispy)
- **Issues**: [github.com/hausorlabs/wispy/issues](https://github.com/hausorlabs/wispy/issues)
- **Hackathon**: [dorahacks.io/hackathon/x402](https://dorahacks.io/hackathon/x402)
