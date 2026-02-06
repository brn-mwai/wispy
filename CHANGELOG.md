# Changelog

All notable changes to Wispy are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **GitHub**: [github.com/brn-mwai/wispy](https://github.com/brn-mwai/wispy)
- **Issues**: [github.com/brn-mwai/wispy/issues](https://github.com/brn-mwai/wispy/issues)
