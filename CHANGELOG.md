# Changelog

All notable changes to Wispy are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.6.2] - 2026-01-29

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
  - `!marathon <goal>` - Start autonomous task
  - `!status` - Check progress
  - `!pause` / `!resume` / `!abort` - Control execution
  - `!list` - View all marathons
  - `!help` - Show help
  - Real-time notifications to WhatsApp
  - Auto-pairing on first message

- **Browser Control via CDP (Chrome DevTools Protocol)**
  - `browser_navigate` - Open URLs
  - `browser_click` - Click elements by selector
  - `browser_type` - Fill input fields
  - `browser_screenshot` - Capture screenshots
  - `browser_snapshot` - Get page content + screenshot for AI analysis
  - `browser_scroll` - Scroll pages
  - `browser_tabs` - List open tabs
  - `browser_new_tab` / `browser_close_tab` - Manage tabs
  - `browser_press_key` - Send keyboard input
  - Based on playwright-core for reliable automation

### Changed
- Gateway startup now shows Dashboard URL
- Gateway startup shows Telegram and WhatsApp status
- REST adapter now accepts runtimeDir for Marathon service access
- Comprehensive README with all new features documented
- Updated API health check version to 0.6.2

### Dependencies
- Added `playwright-core` for browser automation
- Added `qrcode-terminal` for WhatsApp QR display
- Added `@hapi/boom` for Baileys error handling

---

## [0.6.1] - 2026-01-29

### Added
- **Full Telegram Integration with Marathon Mode**
  - `/marathon <goal>` - Start autonomous multi-day tasks from Telegram
  - `/status` - Check marathon progress with visual milestone display
  - `/pause` - Pause active marathon
  - `/resume` - Resume paused marathon
  - `/abort` - Stop marathon execution
  - `/list` - View all marathons with progress
- **Real-time Telegram Notifications**
  - Milestone completion alerts pushed to your phone
  - Failure notifications with error details
  - Marathon completion summary with artifacts list
- **sendTelegramMessage()** export for programmatic notifications

### Changed
- Enhanced Telegram adapter with full Marathon command support
- Updated README with Telegram integration documentation
- Marathon executor now sends formatted notifications to Telegram/Discord/Slack

### Fixed
- API key now properly passed to Telegram adapter for Marathon operations

---

## [0.6.0] - 2026-01-29

### Added
- **Marathon Agent Mode** - Autonomous multi-day task execution
  - Ultra Thinking (65,536 token budget) for complex goal planning
  - Milestone-based execution with self-verification
  - Auto-recovery on failure with different approaches
  - Thought Signatures for reasoning continuity across sessions
  - Checkpoint system for pause/resume/restore
- **New Marathon Module** (`src/marathon/`)
  - `types.ts` - Marathon state, milestone, and notification types
  - `planner.ts` - Goal decomposition with Gemini ultra thinking
  - `executor.ts` - Autonomous execution with verification loop
  - `service.ts` - Marathon lifecycle management
- **CLI Commands**
  - `wispy marathon "goal"` - Start a new marathon
  - `wispy marathon status` - Check current marathon
  - `wispy marathon pause/resume/abort` - Control execution
  - `wispy marathon list` - View all marathons
- **REPL Command**
  - `/marathon <goal>` - Start marathon from interactive REPL
- **Thinking Levels**
  - Added `ultra` level (65,536 tokens) for marathon planning
  - `generateWithThinking()` function for standalone thinking calls

### Changed
- Updated package description to highlight Marathon Mode
- Added hackathon-focused keywords (marathon, action-era, self-correcting)
- README completely rewritten to showcase Marathon Mode as the killer feature

---

## [0.5.1] - 2026-01-29

### Fixed
- **SQLite Migration Order** - Fixed "no such column: expires_at" error
  - CREATE INDEX now runs after ALTER TABLE migration
  - Proper initialization order: create table → add column → create index
- Database compatibility with existing installations

---

## [0.5.0] - 2026-01-28

### Added
- **Comprehensive Gemini Ecosystem Integration**
  - Support for Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini Pro Image
  - text-embedding-004 for vector memory
  - Gemma 3 via Ollama for local inference
- **Enhanced Token Management**
  - Budget limits with automatic enforcement
  - Context windowing for long conversations
  - Cost estimation and tracking
  - Smart model routing based on task complexity
- **MCP Server Improvements**
  - Better tool registration
  - Enhanced error handling
  - VS Code / Antigravity IDE compatibility

### Changed
- Improved model defaults (gemini-2.5-flash as default)
- Better error messages for API failures
- Enhanced logging throughout the system

---

## [0.4.3] - 2026-01-27

### Changed
- Version bump for npm publish
- Minor stability improvements

---

## [0.4.2] - 2026-01-27

### Changed
- **Banner Logo** - Exact 47x20 cloud ASCII art from reference
- Pixel-perfect logo rendering in terminal

---

## [0.4.1] - 2026-01-27

### Changed
- **Mini Cloud Banner** - Claude Code style compact banner
- Info displayed beside logo instead of below
- Cleaner terminal startup experience

---

## [0.4.0] - 2026-01-27

### Added
- **Rich Terminal UI**
  - Status bar with model, tokens, cost, context percentage
  - Enhanced input box with better cursor handling
  - Recents panel showing recent sessions
  - History browser with keyboard navigation
  - Double-ESC to clear input
  - Live token count display
- **Skill Creation Wizard**
  - Interactive skill builder
  - Template generation
  - SKILL.md file creation

### Changed
- Complete config generation from setup wizard
- Model defaults improved (gemini-2.5-flash)
- New cloud logo design

### Fixed
- Various terminal rendering issues
- Input handling edge cases

---

## [0.3.0] - 2026-01-26

### Changed
- **Clean Terminal UI**
  - Removed all emojis from output
  - Silenced verbose logs in CLI mode
  - Minimal, professional interface
- Better separation between log levels

---

## [0.2.0] - 2026-01-26

### Added
- **Onboarding Wizard**
  - Interactive first-run setup
  - Model selection
  - Agent configuration
  - Integration setup
- **Theme System**
  - Dawn (morning warm tones)
  - Day (bright, high contrast)
  - Dusk (evening cool tones)
  - Night (dark mode)
- **Visual Enhancements**
  - Pixel cloud logo ASCII art
  - Weather-themed spinner phrases
  - Colored output based on theme

### Changed
- Silenced boot logs in REPL mode for clean chat experience
- Improved first-run experience

---

## [0.1.0] - 2026-01-25

### Added
- **Initial Release** - Wispy v4: Autonomous AI Agent Platform
- **Core Agent System**
  - Multi-turn conversation with context
  - Tool execution loop with self-correction
  - Session management and persistence
- **Multi-Agent System**
  - 8 specialized agents: Coder, Researcher, Writer, DevOps, Designer, Data, Security, Planner
  - Orchestrator for task routing
  - Agent collaboration with chain-depth limits
- **27+ Integrations**
  - Google: Calendar, Gmail, Drive, Docs, Sheets, Meet, Maps, Search, YouTube
  - Chat: Discord, Slack, WhatsApp, Telegram
  - AI Models: OpenAI, Anthropic, Ollama
  - Productivity: Notion, Obsidian, GitHub, Linear
  - Music: Spotify
  - Smart Home: Philips Hue, Home Assistant
  - Tools: Browser, Webhooks, Weather
  - Social: Twitter/X, Email (SMTP)
- **Interactive CLI**
  - 19 CLI commands
  - 16 REPL slash commands
  - Markdown rendering in terminal
- **Voice Mode**
  - Whisper STT (Speech-to-Text)
  - Piper/espeak-ng TTS (Text-to-Speech)
  - Hands-free interaction
- **Memory System**
  - Vector embeddings with SQLite storage
  - Keyword + semantic hybrid search
  - Long-term recall across sessions
- **MCP Server**
  - Model Context Protocol implementation
  - IDE integration (VS Code, Antigravity)
- **Agent-to-Agent (A2A)**
  - Ed25519-signed task delegation
  - Peer discovery and authentication
- **x402 Wallet**
  - USDC on Base network
  - Encrypted key storage
  - Payment integration
- **Security (7 Layers)**
  - Device identity with Ed25519 keys
  - AES-256-GCM encryption
  - API key regex scanner
  - Action guards for dangerous operations
  - Session isolation
  - Rate limiting
  - Audit logging
- **Auto-Start Service**
  - Windows Task Scheduler
  - macOS launchd
  - Linux systemd
- **Two-Directory Design**
  - `wispy/` - Soul files (version controlled)
  - `.wispy/` - Runtime data (gitignored)
- **Gateway Server**
  - WebSocket for real-time communication
  - REST API for HTTP clients
  - A2A server for agent delegation

### Technical
- TypeScript with ES modules
- Node.js 20+ required
- SQLite for persistence
- YAML configuration
- Zod schema validation

---

## Version History Summary

| Version | Date | Highlight |
|---------|------|-----------|
| 0.6.2 | 2026-01-29 | Web Dashboard, WhatsApp, Browser Control |
| 0.6.1 | 2026-01-29 | Full Telegram integration with Marathon |
| 0.6.0 | 2026-01-29 | Marathon Agent Mode (autonomous multi-day tasks) |
| 0.5.1 | 2026-01-29 | SQLite migration fix |
| 0.5.0 | 2026-01-28 | Comprehensive Gemini ecosystem integration |
| 0.4.x | 2026-01-27 | Rich terminal UI, skill wizard |
| 0.3.0 | 2026-01-26 | Clean terminal UI |
| 0.2.0 | 2026-01-26 | Onboarding wizard, themes |
| 0.1.0 | 2026-01-25 | Initial release |

---

## Roadmap

### Planned for v0.7.0
- [ ] Web dashboard for Marathon visualization
- [ ] Voice control for Marathon commands
- [ ] WhatsApp integration for Marathon
- [ ] Multi-marathon parallel execution

### Planned for v0.8.0
- [ ] Team collaboration features
- [ ] Shared marathon workspaces
- [ ] Cost analytics dashboard
- [ ] Plugin system for custom agents

---

## Links

- **npm**: https://www.npmjs.com/package/wispy-ai
- **GitHub**: https://github.com/brn-mwai/wispy
- **Issues**: https://github.com/brn-mwai/wispy/issues

---

Built for the **Google Gemini 3 Hackathon** - showcasing the "Action Era" of autonomous AI agents.
