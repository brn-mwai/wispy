# Wispy Demo Script (2 Minutes)
## Live Presenter Script — Brian Mwai walking through Wispy

---

## SCRIPT WITH SCREEN ACTIONS

### PART 1 — Intro & The Problem (0:00–0:20)

**YOU SAY:**
Hey everyone. I'm Brian, and this is Wispy — an autonomous AI agent platform that my co-builder Joy Langat and I built entirely on Gemini. Let me show you why we built it and how it works.

So here's the problem. You ask an AI to build something, and two prompts in it forgets what it was doing. Hallucinates a function. Loses your files. You end up babysitting it more than if you just wrote the code yourself. We kept hitting this wall, over and over. So we fixed it.

**SHOW:** Wispy CLI booting up. Banner: `Wispy v1.3.0`. Powered by Gemini badge.

---

### PART 2 — Starting a Marathon (0:20–0:45)

**YOU SAY:**
Let me show you. I'm going to give Wispy a goal — "build me a REST API with auth, a database, and tests." I type one command and hit enter. Watch what happens.

Gemini 2.5 Pro takes that goal and thinks deeply — twenty-four thousand tokens of reasoning — then breaks it into a step-by-step plan with milestones and pass criteria. I didn't write any of this plan. The agent figured it out on its own. And now it starts executing. No hand-holding.

**SHOW:** Type marathon command. Hit enter. Thinking indicator spins. Milestone plan appears — 6 numbered steps with pass criteria.

---

### PART 3 — How It's Built (0:45–1:05)

**YOU SAY:**
And this isn't a wrapper around an API. Every piece of Wispy runs on Gemini directly through the Google GenAI SDK. Function calling drives eighty-nine built-in tools — file ops, shell commands, browser automation, image generation with Imagen 3. Flash handles the fast stuff like routing and token counting. Embeddings power long-term memory so the agent remembers what it did last session. And everything streams in real time — you see the agent think and act, live.

**SHOW:** Architecture diagram: Channels → Core Engine (Gemini) → Services. Then tools grid: 12 categories, 89+ tools.

---

### PART 4 — Marathon Mode in Action (1:05–1:35)

**YOU SAY:**
But here's the part that changes everything. Watch this — the agent is building right now. After every milestone, it checks its own work. Did this pass? Did I miss something? And when something breaks — and trust me, things break — it doesn't just stop. It reads the error, reasons about it, tries a different approach, and keeps going.

We call this Marathon Mode. It runs for hours. Days if it has to. You can pause it, resume it, check in from Telegram or WhatsApp while you're away. It just keeps working.

**SHOW:**
1. Tool calls executing: `Write File`, `Execute Shell` — with duration badges
2. Green check: "Milestone 2/6 — PASSED"
3. Red error: "port 3000 in use"
4. Recovery: "Retrying on port 8080"
5. Green check: "Milestone 3/6 — PASSED"
6. Telegram notification panel alongside CLI

---

### PART 5 — The Numbers & Close (1:35–2:00)

**YOU SAY:**
So what we've got — over fifty thousand lines of TypeScript. Eighty-nine built-in tools. Telegram, WhatsApp, REST API, CLI — all powered by one Gemini brain. Any developer can install it with npm and set it up in two minutes with a free Gemini API key.

Joy and I built this because we were tired of re-prompting AI that kept forgetting what it was supposed to do. That's over now. Try it at wispy.cc, docs at docs.wispy.cc, or install it right now with `npm install -g wispy-ai`. Run your first marathon tonight.

Wispy. Powered by Gemini. The agent that does the work. Thanks.

**SHOW:** End card — Wispy logo, `wispy.cc`, `docs.wispy.cc`, `npm install -g wispy-ai`, "Built by Brian Mwai & Joy Langat", Powered by Gemini badge.

---

## PRESENTER NOTES

### Script Specs
| Detail | Value |
|---|---|
| Word count | ~340 words |
| Target length | 2:00 at ~170 wpm (natural presenter pace) |
| Tone | First person, direct, confident — you built this, you're showing how it works |
| Pacing | Pause after "and trust me, things break." Slow down for Marathon Mode reveal. |

### Tips
- Have Wispy running live in the terminal before you start
- Pre-stage a marathon so you can show real tool calls happening
- Keep Telegram open on a second screen or phone to show notifications
- If live demo fails, have a screen recording ready to switch to

### Key Phrases to Land
- "We fixed it" — shows ownership
- "I didn't write any of this plan" — shows autonomy
- "It just keeps working" — the core value prop
- "Run your first marathon tonight" — actionable CTA

### Judging Criteria Mapping

| Criterion (Weight) | Where It Lands |
|---|---|
| **Technical Execution (40%)** | Part 3: Names every Gemini feature — Pro, Flash, function calling, streaming, embeddings, Imagen 3. Architecture shown. |
| **Innovation (30%)** | Part 4: Marathon Mode — self-verification, error recovery, multi-day execution. |
| **Impact (20%)** | Part 1 + 5: Universal pain point. Free install. 89 tools. Multi-channel. |
| **Presentation (10%)** | Live walkthrough: problem → demo → architecture → working product → CTA |
