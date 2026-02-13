# Wispy — New Features Implementation Prompt

> **Context**: Wispy is an autonomous AI agent platform that ALREADY WORKS. The CLI runs, Telegram bot responds, Marathon mode executes, tools work, Gemini integration is live. **You are NOT building from scratch — you are adding new features to a working codebase.** Do not break existing functionality. Do not restructure the project. Read every file referenced before changing it.

---

## PROJECT ROOT

```
C:\Users\Windows\Downloads\wispy\
```

---

## FEATURE 1: CLI Marathon Progress Rendering

### Why
The CLI currently streams text responses and shows tool calls with emoji, but when a Marathon runs, there is **no visual milestone tracker in the terminal**. All Marathon progress visuals only exist for Telegram (in `src/marathon/telegram-visuals.ts`). The CLI should show the same rich progress — milestones ticking, progress bar filling, thinking quotes, file paths — directly in the terminal.

### What Already Exists
- `src/cli/repl.ts` — The REPL handles streaming events: `thinking`, `tool_call`, `tool_result`, `text`, `context_compacted`, `done`. It uses `ora` spinners and `chalk` for colors.
- `src/cli/tui/screen.ts` — ANSI escape helpers (cursor movement, clear, scroll regions)
- `src/cli/tui/layout.ts` — Terminal layout management
- `src/cli/tui/status-bar.ts` — Bottom status line
- `src/marathon/service.ts` — Marathon service with EventEmitter pattern, emits progress via watchdog
- `src/marathon/telegram-visuals.ts` — 700+ line file that formats milestones, progress bars, tool emoji, approval cards, and completion summaries for Telegram. **Use this as the reference for what the CLI renderer should output — same data, terminal formatting instead of Telegram Markdown.**
- `src/cli/ui/banner.ts` — Already has the block-character ASCII ghost art and `showBanner()` function

### What To Build
Create `src/cli/tui/marathon-renderer.ts` — a new file that subscribes to Marathon progress events and renders them in the terminal.

**Required output format** (this is what the user sees in the terminal during a Marathon):

```
● Marathon started — ecobrew-website-build (8 milestones)

◆ "Next.js + Tailwind, sage green palette, fair-trade messaging, Imagen 3 for hero..."

  ✓ Project scaffolded — npx create-next-app ecobrew --ts --tailwind
  ✓ Layout & navigation — layout.tsx, Navbar.tsx, globals.css
  ✓ Hero section + Imagen 3 — generated hero.webp (1920×1080)
  ✓ Features & about sections — page.tsx +142 lines
  ✓ Subscription plans page — plans/page.tsx, PricingToggle.tsx
  ✓ Contact form & footer — contact/page.tsx, Footer.tsx
  ↻ Vercel deployment — deploying to ecobrew.vercel.app...
  ○ Final review & polish

  █████████████████████░░░░░░░ 75% · 6m 12s · 43 tools used
```

**Implementation details**:

1. **Subscribe to Marathon events** — The Marathon service (`src/marathon/service.ts`) emits progress. Wire the renderer to listen for:
   - `marathon:started` — Print `● Marathon started — {name} ({count} milestones)` in orange
   - `marathon:thinking` — Print `◆ "{thought}"` in purple/dim italic
   - `marathon:milestone:started` — Print `↻ {name}` in cyan
   - `marathon:milestone:completed` — Replace `↻` with `✓` in green, append file path dim
   - `marathon:milestone:failed` — Replace with `✗` in red
   - `marathon:tool:called` — Update status bar with tool name + emoji (reuse emoji map from `telegram-visuals.ts`)
   - `marathon:progress` — Update progress bar line (percentage, elapsed time, tool count)
   - `marathon:completed` — Print final summary with total time and live URL

2. **Colors** (using chalk, which is already a dependency):
   - `✓` completed: `chalk.green`
   - `↻` active: `chalk.cyan`
   - `○` pending: `chalk.dim`
   - `✗` failed: `chalk.red`
   - `●` marathon dot: `chalk.hex('#fb923c')` (orange)
   - `◆` thinking: `chalk.hex('#a78bfa')` (purple)
   - File paths: `chalk.dim`
   - Progress bar fill: `chalk.cyan('█')`
   - Progress bar empty: `chalk.dim('░')`

3. **In-place updates** — Use ANSI cursor movement (from `src/cli/tui/screen.ts`) to update the active milestone line and progress bar without reprinting the entire list. Overwrite the current active line when it completes, then print the next one below.

4. **Wire it into the REPL** — In `src/cli/repl.ts`, when a Marathon starts, hand off rendering to the marathon-renderer. When the Marathon ends, return to the normal `❯` prompt.

### Files To Read First
- `src/marathon/telegram-visuals.ts` — Study the data structures and formatting logic. Your CLI renderer handles the same events but outputs ANSI terminal text instead of Telegram Markdown.
- `src/marathon/service.ts` — Understand how progress events are emitted.
- `src/marathon/types.ts` — Marathon data types (milestones, progress, status).
- `src/cli/repl.ts` — Understand the current REPL event loop so you integrate correctly.
- `src/cli/tui/screen.ts` — ANSI escape helpers you can reuse.

---

## FEATURE 2: CLI ↔ Telegram Real-Time Sync

### Why
Currently, CLI and Telegram are separate channels. If you start a Marathon from the CLI, Telegram doesn't see it. If someone sends a message on Telegram, the CLI doesn't know. For the demo, both channels must show the same Marathon progress simultaneously.

### What Already Exists
- `src/channels/dock.ts` — Channel registry with `getAllChannels()` that returns all registered channels. This is the broadcast mechanism.
- `src/channels/telegram/adapter.ts` — Telegram adapter registered as a channel with capabilities
- `src/gateway/server.ts` — Gateway initializes all channels and creates the Agent
- `src/marathon/service.ts` — Marathon service that currently sends progress only to the channel that started it

### What To Build

1. **Marathon broadcast to all channels** — When a Marathon emits a progress event, it should go to ALL registered channels, not just the originating one.

   In `src/marathon/service.ts` (or wherever progress is emitted), change the notification target from "the channel that started this marathon" to "all channels via dock.getAllChannels()". Each channel adapter handles formatting itself:
   - Telegram adapter → calls `telegram-visuals.ts` formatting
   - CLI adapter → calls the new `marathon-renderer.ts` formatting

2. **Register CLI as a channel** — The CLI REPL is not currently registered as a channel in the dock. Create a lightweight CLI channel adapter that:
   - Registers in `src/channels/dock.ts` with capabilities: `text`, `media` (for showing file paths)
   - Receives progress events and forwards them to the marathon-renderer
   - This does NOT mean the CLI connects via WebSocket — it's in-process. The CLI just registers as another channel in the dock so broadcasts reach it.

3. **Telegram input forwarding** — When a user sends a message on Telegram during an active Marathon, it should be treated as input to the running session (e.g., answering a question, approving an action). The Marathon service should accept input from any channel, not just the originator.

### Files To Read First
- `src/channels/dock.ts` — Understand the channel interface and registration
- `src/marathon/service.ts` — Find where progress notifications are sent. Look for `sendMessage`, `notifyProgress`, or similar calls that target a specific chatId/channel.
- `src/channels/telegram/adapter.ts` — See how Telegram registers as a channel (lines ~1-50 for the registration pattern)
- `src/gateway/server.ts` — See how channels are initialized during boot

---

## FEATURE 3: CLI Trust Control Prompts

### Why
Trust controls currently only work via Telegram inline buttons (Approve/Deny). When the CLI user triggers a deployment or payment, there's no way to approve it in the terminal. The CLI needs its own approval prompt.

### What Already Exists
- `src/trust/controller.ts` — Rules engine mapping tools to trust levels (auto/notify/approve/deny)
- `src/trust/telegram-handler.ts` — Telegram-specific approval with InlineKeyboard buttons
- `src/security/action-guard.ts` — Guards tool execution, pauses on `approve` level

### What To Build

Add a CLI approval handler in `src/cli/tui/approval-prompt.ts`:

1. When a trust-controlled action requires approval, show a formatted card in the terminal:
   ```
   ⚠ Trust Control: APPROVE Required

   Action: Vercel Deployment
   ┌──────────────────────────────────────┐
   │ Project    ecobrew-sustainable-coffee │
   │ Domain     ecobrew.vercel.app         │
   │ Env Vars   3 secrets will be set      │
   │ Est. Cost  $0.00 (Hobby tier)         │
   └──────────────────────────────────────┘

   [A] Approve  [D] Deny  [S] Skip
   ```

2. Wait for single keypress: `a` to approve, `d` to deny, `s` to skip
3. Send the approval/denial result back to the trust controller to resume/abort the Marathon
4. Wire this into `src/trust/controller.ts` — when the originating channel is CLI, use the terminal prompt instead of Telegram inline buttons

### Files To Read First
- `src/trust/controller.ts` — How approval requests are created and resolved
- `src/trust/telegram-handler.ts` — Reference for what data is shown (project, domain, env vars, cost)
- `src/security/action-guard.ts` — How tool execution pauses waiting for approval
- `src/cli/tui/key-handler.ts` — Keyboard input handling for the keypress listener

---

## FEATURE 4: Package Update Notification

### Why
When a new version of `wispy-ai` is published to npm, users running the old version should see a prompt to update. This is standard for CLI tools (like npm itself, or `create-react-app`).

### What Already Exists
- `package.json` — Current version is `1.0.0`, package name is `wispy-ai`
- `src/cli/ui/banner.ts` — The banner shows `Wispy v1.0.0` on startup
- `src/cli/doctor.ts` — System health check (good place to also check for updates)

### What To Build

Create `src/cli/update-checker.ts`:

1. **On startup** (when `showBanner()` runs), make a non-blocking HTTP request to the npm registry:
   ```
   GET https://registry.npmjs.org/wispy-ai/latest
   ```
   Extract the `version` field from the response.

2. **Compare versions** — If the registry version is newer than the local `package.json` version, print a notification BELOW the banner:
   ```
   ┌────────────────────────────────────────────────┐
   │  Update available: 1.0.0 → 1.2.0              │
   │  Run: npm install -g wispy-ai  to update       │
   └────────────────────────────────────────────────┘
   ```
   Use `chalk.yellow` for the box border, `chalk.dim` for current version, `chalk.green` for new version, `chalk.cyan` for the command.

3. **Cache the check** — Don't hit npm on every startup. Cache the result in `.wispy/update-check.json` with a timestamp. Only check again if the cache is older than 24 hours.

4. **Non-blocking** — The update check must NOT delay the CLI startup. Use a fire-and-forget async call. If the network is slow or fails, silently skip.

5. **Also check in `doctor`** — In `src/cli/doctor.ts`, add an "Update Status" check that shows current vs latest version.

### Files To Read First
- `src/cli/ui/banner.ts` — Where to call the update checker (after banner prints)
- `src/cli/doctor.ts` — Where to add the version check
- `package.json` — Current version number

---

## FEATURE 5: Vertex AI — Gemini 2.5 Pro Support

### Why
The config currently defaults to `gemini-2.5-flash` for both pro and flash models. The user wants to use **Gemini 2.5 Pro** (or Gemini 3 when available) via **Vertex AI** for higher quality output, especially for Marathon planning (ULTRA thinking) and complex code generation.

### What Already Exists
- `src/ai/gemini.ts` — Gemini client with retry logic. Already supports Vertex AI initialization:
  ```typescript
  initGemini({ vertexai: true, project, location })
  ```
- `src/gateway/server.ts` — Already has Vertex AI detection:
  ```typescript
  const vertexConfig = config.gemini?.vertexai;
  if (vertexConfig?.enabled) {
    initGemini({ vertexai: true, project, location });
  }
  ```
- `.wispy/config.yaml` — Has model config but currently set to flash:
  ```yaml
  gemini:
    models:
      pro: gemini-2.5-flash
      flash: gemini-2.5-flash
  ```
- `.wispy/integrations.json` — Already has Vertex AI configured:
  ```json
  "vertexai": {
    "configured": true,
    "project": "gen-lang-client-0425796557",
    "location": "us-central1",
    "models": ["gemini-2.5-pro", "gemini-2.5-flash"]
  }
  ```

### What To Change

1. **Update `.wispy/config.yaml`** — Change the pro model:
   ```yaml
   gemini:
     models:
       pro: gemini-2.5-pro-preview-05-06
       flash: gemini-2.5-flash
       image: imagen-3.0-generate-002
       embedding: text-embedding-004
   ```
   Use the latest Gemini 2.5 Pro preview model ID. If Gemini 3 is available at the time of implementation, use that instead.

2. **Model routing in `src/core/thinking.ts`** — Verify that when thinking level is ULTRA or HIGH, it uses the `pro` model (not flash). When thinking level is LOW or MEDIUM, it uses `flash`. Read this file and confirm the routing logic exists. If not, add it.

3. **Model routing in `src/marathon/planner.ts`** — The planner should ALWAYS use the pro model for planning (it needs extended thinking). Verify this.

4. **Model display in banner** — `src/cli/ui/banner.ts` currently shows the model name on startup. Verify it reads from config and shows the correct model (e.g., "Gemini 2.5 Pro" not "Gemini 2.5 Flash") based on what's configured.

5. **Vertex AI status in REPL** — `src/cli/repl.ts` already shows `[Vertex]` or API key backend tag. Verify this works correctly.

### Files To Read First
- `src/ai/gemini.ts` — Full file. Understand initialization and how models are selected per request.
- `src/core/thinking.ts` — How thinking levels map to models
- `src/marathon/planner.ts` — Which model the planner uses
- `src/ai/model-registry.ts` — Model version management
- `.wispy/config.yaml` — Current model config
- `src/cli/ui/banner.ts` — Where model name is displayed

---

## FEATURE 6: CLI Visual Improvements

### Why
The CLI banner and REPL should match the exact design shown in the product screenshots. The banner already has the correct ASCII art, but we need to verify the full startup sequence looks polished.

### What Already Exists
- `src/cli/ui/banner.ts` — Has `showBanner()` with the ghost ASCII art, version, model, path
- `src/cli/repl.ts` — Has prompt symbol from theme

### What To Verify & Fix

1. **Banner layout** — After the ASCII art + info lines, there should be a tips line:
   ```
   Tips: /help for commands • /quick for shortcuts • /marathon for background tasks
   Just type naturally — Wispy understands: "build me a dashboard", "fix the bug", etc.
   ```
   If the tips line doesn't exist in `showBanner()`, add it. Use `chalk.dim` for tips text, `chalk.cyan` for slash commands.

2. **Horizontal divider** — After the tips, print a full-width divider:
   ```
   ────────────────────────────────────────────────────────────────────────────────
   ```
   Use `chalk.dim` and `'─'.repeat(process.stdout.columns || 80)` to match terminal width.

3. **Prompt symbol** — Verify the REPL prompt is `❯` in cyan. Read `src/cli/ui/theme.ts` to check.

4. **Startup sequence** — The full startup should be:
   ```
   [banner with ASCII art + version + model + path]
   [tips line]
   [divider]
   [update notification if available — from Feature 4]
   ❯
   ```

### Files To Read First
- `src/cli/ui/banner.ts` — Current banner implementation
- `src/cli/ui/theme.ts` — Theme tokens (prompt symbol, colors)
- `src/cli/repl.ts` — Where the REPL starts and calls showBanner

---

## FEATURE 7: Telegram Image Generation Feedback

### Why
When Imagen 3 generates an image during a Marathon, the image should be sent to Telegram with interactive buttons (Perfect! / Regenerate / Edit). This likely partially exists but needs verification.

### What Already Exists
- `src/marathon/telegram-visuals.ts` — Has `imageKeyboard()` function that creates inline buttons: "✅ Perfect", "🔄 Regenerate", "✏️ Edit Prompt", "🎨 Variations"
- `src/channels/telegram/adapter.ts` — Has `/image <prompt>` command handler and callback handlers for image buttons
- `src/ai/tools.ts` — Has `image_generate` tool

### What To Verify & Fix

1. **During Marathon image generation** — When the `image_generate` tool is called as part of a Marathon milestone, does the generated image automatically get sent to Telegram? Or does it only save to disk?

2. **Button callbacks** — When the user taps "Regenerate" in Telegram, does it trigger a new image generation and update the Marathon state?

3. **CLI fallback** — When the image is generated and the user is on CLI (no Telegram), the CLI should show:
   ```
   ✓ Hero image generated — hero.webp (1920×1080)
     Saved to: .wispy/workspace/ecobrew/public/assets/hero.webp
   ```

### Files To Read First
- `src/marathon/telegram-visuals.ts` — Search for `image` related functions
- `src/channels/telegram/adapter.ts` — Search for `image_generate`, `sendPhoto`, photo handling
- `src/ai/tools.ts` — The `image_generate` tool declaration and what it returns

---

## IMPLEMENTATION ORDER

Do these in order — each builds on the previous:

1. **Feature 5** — Vertex AI / Gemini 2.5 Pro config (quick config change, verifies AI works)
2. **Feature 6** — CLI visual improvements (banner, tips, divider, prompt — visual polish)
3. **Feature 4** — Package update notification (small self-contained feature)
4. **Feature 1** — CLI Marathon progress renderer (biggest feature, needs marathon-renderer.ts)
5. **Feature 3** — CLI trust control prompts (depends on Feature 1 for context)
6. **Feature 2** — CLI ↔ Telegram sync (depends on Features 1 and 3 being done)
7. **Feature 7** — Telegram image feedback verification (final polish)

---

## RULES

1. **Read before writing** — Read every file referenced in "Files To Read First" before making any changes
2. **Don't break existing** — Run `npm run build` after each feature to verify TypeScript compiles
3. **Don't restructure** — Add new files, modify existing ones, but don't move or rename anything
4. **Match existing patterns** — The codebase uses ES modules, chalk for colors, ora for spinners, grammy for Telegram, commander for CLI. Use the same libraries.
5. **Don't add unnecessary dependencies** — The only new dependency you might need is a semver comparison library for Feature 4 (or just do a simple string split comparison)
6. **Keep Telegram visuals intact** — `src/marathon/telegram-visuals.ts` is 700+ lines of working Telegram formatting. Don't modify it. Build the CLI renderer as a parallel implementation that handles the same events with terminal formatting.
7. **Test each feature** — After implementing each feature, describe how to test it (what command to run, what to expect)

---

## HOW TO TEST

### Test Feature 1 (CLI Marathon)
```bash
npm run build && node bin/wispy.js
```
Then type:
```
❯ build me a landing page for a coffee shop
```
**Expected**: Milestones appear one by one with ✓/↻/○ icons, progress bar updates, thinking quotes show.

### Test Feature 2 (Sync)
Terminal 1:
```bash
node bin/wispy.js gateway
```
Terminal 2:
```bash
node bin/wispy.js chat
```
Start a marathon in Terminal 2. Open Telegram and verify the same progress appears.

### Test Feature 3 (CLI Approval)
Start a marathon that includes a deployment step. When it reaches the deployment milestone, the terminal should show the approval card with `[A] Approve [D] Deny` prompt.

### Test Feature 4 (Update Check)
Temporarily change the version in `package.json` to `0.0.1`, then restart the CLI. The update notification box should appear.

### Test Feature 5 (Vertex AI)
```bash
node bin/wispy.js
```
Banner should show `Gemini 2.5 Pro` (not Flash). Then ask a question — verify it responds using the pro model (check the token/cost stats line in the REPL output).

### Test Feature 6 (CLI Visuals)
```bash
node bin/wispy.js
```
**Expected**: ASCII banner → version/model/path → tips line → divider → `❯` prompt. No extra blank lines, no missing elements.

### Test Feature 7 (Telegram Images)
Send `/marathon build a portfolio website with AI-generated hero image` to the Telegram bot. When the image milestone runs, verify the image appears in chat with Perfect/Regenerate/Edit buttons.

---

## FILE INDEX

Every file you need to read or modify:

### Must Read (understand before changing anything)
| File | Why |
|------|-----|
| `src/cli/repl.ts` | Current REPL loop, streaming events, where marathon hooks in |
| `src/cli/ui/banner.ts` | Current banner, where to add tips/divider |
| `src/cli/ui/theme.ts` | Theme tokens (colors, prompt symbol) |
| `src/cli/tui/screen.ts` | ANSI helpers for cursor movement |
| `src/marathon/service.ts` | Marathon event emission, progress broadcasting |
| `src/marathon/telegram-visuals.ts` | Reference for CLI renderer (same data, different format) |
| `src/marathon/types.ts` | Marathon data types |
| `src/channels/dock.ts` | Channel registry and broadcast |
| `src/channels/telegram/adapter.ts` | Telegram adapter (2164 lines — skim for patterns) |
| `src/trust/controller.ts` | Trust rules and approval flow |
| `src/trust/telegram-handler.ts` | Telegram approval cards (reference for CLI version) |
| `src/ai/gemini.ts` | Gemini init, model selection, Vertex AI |
| `src/core/thinking.ts` | Thinking level → model routing |
| `src/core/agent.ts` | Agent event emission |
| `src/gateway/server.ts` | Boot sequence, channel init |
| `.wispy/config.yaml` | Config to update |
| `package.json` | Version, dependencies |

### Must Create (new files)
| File | Purpose |
|------|---------|
| `src/cli/tui/marathon-renderer.ts` | CLI marathon progress display (Feature 1) |
| `src/cli/tui/approval-prompt.ts` | CLI trust control approval (Feature 3) |
| `src/cli/update-checker.ts` | npm version check + notification (Feature 4) |

### Must Modify (add code to existing files)
| File | Change |
|------|--------|
| `src/cli/repl.ts` | Wire marathon-renderer and approval-prompt into the REPL event loop |
| `src/cli/ui/banner.ts` | Add tips line, divider, and update check call after banner |
| `src/marathon/service.ts` | Broadcast progress to all channels via dock (not just originator) |
| `.wispy/config.yaml` | Change `pro` model to `gemini-2.5-pro-preview-05-06` |
| `src/cli/doctor.ts` | Add version check to health report |
