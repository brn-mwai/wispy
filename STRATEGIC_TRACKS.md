# Wispy Strategic Hackathon Tracks

Wispy now implements all 4 strategic tracks for the Gemini hackathon, enabling autonomous AI agent capabilities that leverage the full power of Google's Gemini models.

## 🧠 Track #1: The Marathon Agent

**Location:** `src/ai/thinking.ts`, `src/core/thinking.ts`

Build autonomous systems for tasks spanning hours or days using:

- **Thinking Levels:** `minimal`, `low`, `medium`, `high` - dynamically adjust reasoning depth
- **Thought Signatures:** Encrypted signatures for multi-turn function calling continuity
- **Self-Correction:** Automatic error recovery across multi-step tool calls
- **Marathon Continuity:** State persistence for long-running sessions

### Tools
- `marathon_start` - Start a marathon autonomous session
- `marathon_status` - Get session progress and thought signatures
- `marathon_checkpoint` - Create recovery checkpoints

### Usage
```typescript
import { getThoughtSignatureManager, inferThinkingLevel } from "wispy";

const sigManager = getThoughtSignatureManager();
const thinkingLevel = inferThinkingLevel("Design a complex system architecture");
// Returns: "high"
```

---

## ☯️ Track #2: Vibe Engineering

**Location:** `src/vibe/engine.ts`, `src/vibe/index.ts`

Autonomous testing loops with browser-based verification:

- **Code Generation:** AI writes complete, runnable code
- **Test Execution:** Runs tests automatically
- **Browser Verification:** Captures screenshots via Puppeteer
- **Auto-Fix:** Iterates until all tests pass

### Tools
- `vibe_start` - Start autonomous coding + verification loop
- `vibe_status` - Get current loop status
- `vibe_artifacts` - List screenshots, logs, diffs

### Usage
```typescript
import { createVibeEngine, createVibePrompt } from "wispy";

const engine = createVibeEngine({
  workDir: "./project",
  artifactsDir: "./artifacts",
  testCommand: "npm test",
  browserVerification: true,
});

const state = await engine.runLoop(async (feedback) => {
  // AI generates code based on feedback
  return generatedCode;
});
```

---

## 👨‍🏫 Track #3: The Real-Time Teacher

**Location:** `src/ai/live.ts`

Adaptive learning with Gemini Live API:

- **Bidirectional Audio/Video:** Real-time streaming via WebSocket
- **Voice Activity Detection:** Configurable speech sensitivity
- **Affective Dialog:** Adapts to student's tone and expression
- **Adaptive Teaching:** Adjusts difficulty based on student performance

### Tools
- `teach_start` - Start a teaching session with topic and level
- `teach_status` - Get session info and remaining time
- `teach_end` - End the teaching session

### Session Limits
- Audio-only: 15 minutes
- Audio + Video: 2 minutes
- Context: 128K tokens

### Usage
```typescript
import { createRealTimeTeacher } from "wispy";

const teacher = createRealTimeTeacher(apiKey);
await teacher.startLesson("Quantum Computing", {
  level: "beginner",
  withVideo: false,
  language: "English",
});

// Stream audio to teacher
await teacher.sendStudentAudio(audioBuffer);
```

---

## 🎨 Track #4: Creative Autopilot

**Location:** `src/ai/creative.ts`

High-precision multimodal creation with Nano Banana Pro:

- **4K Resolution:** Up to 4096px output
- **Aspect Ratios:** 1:1, 16:9, 9:16, 4:3, 3:2, 21:9, and more
- **Style Presets:** photorealistic, digital-art, illustration, 3d-render, anime, sketch, watercolor, oil-painting, pixel-art, minimalist
- **Paint-to-Edit:** Regional editing with masks
- **Legible Text:** Sharp, readable text in images
- **Brand Consistency:** Color palette and aesthetic enforcement

### Tools
- `creative_generate` - Generate image from prompt
- `creative_edit` - Edit image with Paint-to-Edit
- `creative_text` - Generate image with legible text
- `creative_brand` - Generate brand-consistent assets

### Usage
```typescript
import { createCreativeAutopilot } from "wispy";

const autopilot = createCreativeAutopilot(apiKey, "./output");

// Generate 4K image
const image = await autopilot.generate("A futuristic city at sunset", {
  aspectRatio: "16:9",
  imageSize: "4K",
  style: "photorealistic",
});

// Generate with text
const banner = await autopilot.generateWithText(
  "Modern tech conference stage",
  { text: "AI Summit 2025", placement: "center", fontStyle: "bold" }
);

// Brand-consistent asset
const asset = await autopilot.generateBrandAsset("Product showcase", {
  primaryColors: ["#00FFA3", "#1A1A2E"],
  aesthetic: "minimal, modern, tech",
});
```

---

## Integration Example

All tracks can be used together in a single agent session:

```typescript
import { Agent, createVibeEngine, createRealTimeTeacher } from "wispy";

// Agent automatically has access to all track tools:
// - marathon_start, marathon_status, marathon_checkpoint
// - vibe_start, vibe_status, vibe_artifacts
// - teach_start, teach_status, teach_end
// - creative_generate, creative_edit, creative_text, creative_brand

const agent = new Agent({
  config,
  runtimeDir: "./runtime",
  soulDir: "./soul",
});

// Chat naturally - agent will use appropriate tools
const response = await agent.chat(
  "Start a marathon session to build a React dashboard, then generate a brand-consistent hero image",
  "user123",
  "web"
);
```

---

## File Structure

```
src/
├── ai/
│   ├── thinking.ts      # Track #1: Thinking & Thought Signatures
│   ├── live.ts          # Track #3: Real-Time Teacher (Live API)
│   ├── creative.ts      # Track #4: Creative Autopilot (Nano Banana Pro)
│   ├── gemini.ts        # Core Gemini integration
│   ├── tools.ts         # Tool declarations (updated with all tracks)
│   └── index.ts         # AI module exports
├── vibe/
│   ├── engine.ts        # Track #2: Vibe Engineering
│   └── index.ts         # Vibe module exports
├── agents/
│   └── tool-executor.ts # Executes all strategic track tools
├── core/
│   ├── agent.ts         # Main agent with thought signature integration
│   └── thinking.ts      # Re-exports from ai/thinking.ts
└── index.ts             # Main exports including all tracks
```

---

*Built for the Google Gemini Hackathon 🚀*
