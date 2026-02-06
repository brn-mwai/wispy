/**
 * Marathon Telegram Visuals v2.0
 *
 * World-class visual progress updates for autonomous marathon execution.
 * Features: Real-time streaming, animated effects, interactive controls,
 * code diffs, cost tracking, and beautiful UI components.
 */

import { createLogger } from "../infra/logger.js";
import type { MarathonState, Milestone, MarathonPlan } from "./types.js";

const log = createLogger("marathon:visuals");

// Telegram bot instance (set via init)
let telegramBot: any = null;
let activeProgressMessages = new Map<string, { chatId: string; messageId: number; lastUpdate: number }>();
let toolStreamMessages = new Map<string, { chatId: string; messageId: number }>();

// Animation frames for loading effects
const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PULSE_FRAMES = ["◉", "◎", "○", "◎"];
const PROGRESS_FRAMES = ["▱▱▱▱▱", "▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰"];

/**
 * Initialize the visual system with Telegram bot
 */
export function initMarathonVisuals(bot: any) {
  telegramBot = bot;
  log.info("Marathon visuals v2.0 initialized");
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMOJI & STYLING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  in_progress: "⚡",
  completed: "✅",
  failed: "❌",
  skipped: "⏭️",
  verifying: "🔍",
  recovering: "🔄",
};

const TOOL_EMOJI: Record<string, string> = {
  bash: "⚡",
  file_write: "✏️",
  file_read: "📖",
  file_search: "🔍",
  file_delete: "🗑️",
  web_fetch: "🌐",
  web_search: "🔎",
  browser_navigate: "🌍",
  browser_screenshot: "📸",
  browser_click: "👆",
  memory_search: "🧠",
  memory_save: "💾",
  create_project: "🏗️",
  scaffold_shadcn: "🎨",
  run_dev_server: "🚀",
  image_generate: "🖼️",
  document_create: "📄",
  wallet_pay: "💸",
  a2a_delegate: "🤖",
  default: "🔧",
};

const RISK_BADGE: Record<string, string> = {
  low: "🟢 LOW",
  medium: "🟡 MEDIUM",
  high: "🟠 HIGH",
  critical: "🔴 CRITICAL",
};

function getToolEmoji(toolName: string): string {
  return TOOL_EMOJI[toolName] || TOOL_EMOJI.default;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BARS & VISUAL ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function createProgressBar(completed: number, total: number, width: number = 15): string {
  const percentage = total > 0 ? completed / total : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

function createAnimatedProgressBar(completed: number, total: number, frame: number = 0): string {
  const percentage = total > 0 ? completed / total : 0;
  const filled = Math.floor(percentage * 10);
  const partial = percentage * 10 - filled;

  let bar = "█".repeat(filled);
  if (partial > 0 && filled < 10) {
    const partials = ["░", "▒", "▓"];
    bar += partials[Math.floor(partial * 3)];
    bar += "░".repeat(9 - filled);
  } else {
    bar += "░".repeat(10 - filled);
  }

  return `[${bar}]`;
}

function createSparkline(values: number[]): string {
  const chars = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  return values.map(v => chars[Math.floor((v / max) * 7)]).join("");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANNING & INITIALIZATION MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export function formatPlanningStart(goal: string): string {
  return `
🧠 *Initializing Marathon Mode*

╭─────────────────────────────────╮
│  ⚡ *ULTRA THINKING ENGAGED*    │
│  🎯 Analyzing your goal...      │
│  📋 Creating execution plan...  │
╰─────────────────────────────────╯

*Goal:* _${goal}_

${LOADING_FRAMES[0]} Decomposing into milestones...
`.trim();
}

export function formatPlanningMessage(plan: MarathonPlan, thinkingTokens: number = 24576): string {
  const totalEstimate = plan.milestones.reduce((sum, m) => sum + (m.estimatedMinutes || 15), 0);

  let msg = `
✅ *Marathon Plan Ready*

╭─────────────────────────────────╮
│  🧠 *Thinking:* ${formatTokens(thinkingTokens)} tokens   │
│  📋 *Milestones:* ${plan.milestones.length} tasks         │
│  ⏱️ *Estimate:* ~${totalEstimate} minutes       │
╰─────────────────────────────────╯

*Goal:* ${plan.goal}

`.trim();

  msg += `\n\n*Execution Plan:*\n`;

  for (let i = 0; i < plan.milestones.length; i++) {
    const m = plan.milestones[i];
    const emoji = STATUS_EMOJI[m.status] || "⏳";
    const time = m.estimatedMinutes ? `~${m.estimatedMinutes}m` : "";
    msg += `\n${emoji} \`m${i + 1}\` ${m.title} ${time ? `_(${time})_` : ""}`;
  }

  msg += `\n\n───────────────────────────`;
  msg += `\n_Ready to execute autonomously_ ⚡`;

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-TIME PROGRESS MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export function formatProgressMessage(state: MarathonState, showDetails: boolean = true): string {
  const { plan, status } = state;
  const completed = plan.milestones.filter(m => m.status === "completed").length;
  const inProgress = plan.milestones.find(m => m.status === "in_progress");
  const failed = plan.milestones.filter(m => m.status === "failed").length;
  const total = plan.milestones.length;
  const percentage = Math.round((completed / total) * 100);

  const statusEmoji = status === "executing" ? "⚡" : status === "paused" ? "⏸️" : "🏃";

  let msg = `${statusEmoji} *Marathon ${status === "paused" ? "Paused" : "Running"}*\n\n`;
  msg += `*Goal:* ${plan.goal}\n\n`;

  // Progress bar with percentage
  msg += `${createProgressBar(completed, total, 20)} ${percentage}%\n`;
  msg += `✅ ${completed} done`;
  if (failed > 0) msg += ` • ❌ ${failed} failed`;
  msg += ` • ⏳ ${total - completed - failed} remaining\n`;

  if (showDetails) {
    msg += `\n*Milestones:*\n`;

    for (let i = 0; i < Math.min(plan.milestones.length, 8); i++) {
      const m = plan.milestones[i];
      const emoji = STATUS_EMOJI[m.status] || "⏳";
      const current = m.status === "in_progress" ? " ◀" : "";
      msg += `${emoji} \`m${i + 1}\` ${m.title}${current}\n`;
    }

    if (plan.milestones.length > 8) {
      msg += `_...and ${plan.milestones.length - 8} more_\n`;
    }
  }

  if (inProgress) {
    msg += `\n───────────────────────────`;
    msg += `\n⚡ *Now:* ${inProgress.title}`;
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION STREAMING
// ═══════════════════════════════════════════════════════════════════════════════

export function formatToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  status: "running" | "complete" | "error"
): string {
  const emoji = getToolEmoji(toolName);
  const statusIcon = status === "running" ? "⏳" : status === "complete" ? "✅" : "❌";

  let msg = `${emoji} *${toolName}* ${statusIcon}\n`;

  // Show relevant args based on tool type
  if (toolName === "bash" && args.command) {
    const cmd = String(args.command).slice(0, 60);
    msg += `\`\`\`\n$ ${cmd}${String(args.command).length > 60 ? "..." : ""}\n\`\`\``;
  } else if (toolName === "file_write" && args.path) {
    msg += `📁 \`${String(args.path).split("/").pop()}\``;
  } else if (toolName === "create_project" && args.name) {
    msg += `🏗️ Creating \`${args.name}\``;
  } else if (toolName === "web_fetch" && args.url) {
    msg += `🌐 ${String(args.url).slice(0, 40)}...`;
  }

  return msg;
}

export function formatToolStreamMessage(
  tools: Array<{ name: string; status: string; duration?: number }>
): string {
  let msg = `🔧 *Tool Execution Stream*\n\n`;

  for (const tool of tools.slice(-5)) {
    const emoji = getToolEmoji(tool.name);
    const status = tool.status === "complete" ? "✅" : tool.status === "error" ? "❌" : "⏳";
    const duration = tool.duration ? ` (${formatDuration(tool.duration)})` : "";
    msg += `${status} ${emoji} ${tool.name}${duration}\n`;
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODE DIFF VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

export function formatCodeDiff(
  filename: string,
  linesAdded: number,
  linesRemoved: number,
  preview?: string
): string {
  let msg = `📝 *File Changed:* \`${filename}\`\n`;
  msg += `\`+${linesAdded}\` \`-${linesRemoved}\`\n`;

  if (preview) {
    const lines = preview.split("\n").slice(0, 5);
    msg += `\n\`\`\`\n${lines.join("\n")}${preview.split("\n").length > 5 ? "\n..." : ""}\n\`\`\``;
  }

  return msg;
}

export function formatFilesCreated(files: string[]): string {
  if (files.length === 0) return "";

  let msg = `📁 *Files Created:*\n`;

  for (const file of files.slice(0, 6)) {
    const ext = file.split(".").pop() || "";
    const icon = ext === "ts" || ext === "tsx" ? "📘" :
                 ext === "js" || ext === "jsx" ? "📒" :
                 ext === "css" ? "🎨" :
                 ext === "html" ? "🌐" :
                 ext === "json" ? "📋" :
                 ext === "md" ? "📝" : "📄";
    msg += `${icon} \`${file.split("/").pop()}\`\n`;
  }

  if (files.length > 6) {
    msg += `_...and ${files.length - 6} more files_\n`;
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function formatMilestoneStart(
  milestone: Milestone,
  index: number,
  total: number
): string {
  return `
⚡ *Starting Milestone ${index + 1}/${total}*

╭─────────────────────────────────╮
│  📋 ${milestone.title}
│  ⏱️ ~${milestone.estimatedMinutes || 15} minutes
╰─────────────────────────────────╯

${milestone.description ? `_${milestone.description.slice(0, 100)}..._` : ""}
`.trim();
}

export function formatMilestoneComplete(
  milestone: Milestone,
  index: number,
  total: number,
  duration: number,
  artifacts: string[] = []
): string {
  let msg = `
✅ *Milestone ${index + 1}/${total} Complete!*

${createProgressBar(index + 1, total, 15)} ${Math.round(((index + 1) / total) * 100)}%

📋 ${milestone.title}
⏱️ Completed in ${formatDuration(duration)}
`.trim();

  if (artifacts.length > 0) {
    msg += `\n\n${formatFilesCreated(artifacts)}`;
  }

  return msg;
}

export function formatMilestoneFailed(
  milestone: Milestone,
  index: number,
  error: string,
  retryCount: number,
  maxRetries: number
): string {
  return `
❌ *Milestone ${index + 1} Failed*

📋 ${milestone.title}
🔄 Retry ${retryCount}/${maxRetries}

*Error:*
\`\`\`
${error.slice(0, 200)}${error.length > 200 ? "..." : ""}
\`\`\`

${retryCount < maxRetries ? "⏳ _Attempting recovery..._" : "⛔ _Max retries reached_"}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION & QUALITY
// ═══════════════════════════════════════════════════════════════════════════════

export function formatVerificationStart(milestone: Milestone): string {
  const steps = milestone.verificationSteps || [];

  let msg = `🔍 *Verifying Milestone*\n\n`;

  for (const step of steps.slice(0, 4)) {
    msg += `⏳ ${step}\n`;
  }

  return msg;
}

export function formatVerificationResult(
  passed: boolean,
  results: Array<{ step: string; passed: boolean; output?: string }>
): string {
  let msg = passed ? `✅ *Verification Passed*\n\n` : `❌ *Verification Failed*\n\n`;

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    msg += `${icon} ${r.step}\n`;
    if (!r.passed && r.output) {
      msg += `   \`${r.output.slice(0, 50)}\`\n`;
    }
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export function formatApprovalMessage(
  action: string,
  description: string,
  risk: "low" | "medium" | "high" | "critical",
  details: Record<string, string>
): string {
  let msg = `
🛡️ *Approval Required*

╭─────────────────────────────────╮
│  ${RISK_BADGE[risk]}                          │
╰─────────────────────────────────╯

*Action:* ${action}
${description}

`.trim();

  if (Object.keys(details).length > 0) {
    msg += `\n\n*Details:*\n`;
    for (const [key, value] of Object.entries(details)) {
      msg += `• *${key}:* \`${value}\`\n`;
    }
  }

  msg += `\n\n_🔒 Wispy pauses for your approval on sensitive actions._`;

  return msg;
}

export function createApprovalKeyboard(approvalId: string, risk: string) {
  const buttons = [
    [
      { text: "✅ Approve", callback_data: `approve:${approvalId}` },
      { text: "❌ Deny", callback_data: `deny:${approvalId}` },
    ],
  ];

  // Add "Always Allow" for low-risk actions
  if (risk === "low" || risk === "medium") {
    buttons.push([
      { text: "✅ Always Allow This", callback_data: `always_allow:${approvalId}` },
    ]);
  }

  buttons.push([
    { text: "⏸️ Pause Marathon", callback_data: `pause:${approvalId}` },
  ]);

  return { inline_keyboard: buttons };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTIVE CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

export function createMarathonControlKeyboard(marathonId: string, status: string) {
  const buttons: any[][] = [];

  if (status === "executing") {
    buttons.push([
      { text: "⏸️ Pause", callback_data: `marathon_pause:${marathonId}` },
      { text: "⛔ Abort", callback_data: `marathon_abort:${marathonId}` },
    ]);
    buttons.push([
      { text: "📊 Status", callback_data: `marathon_status:${marathonId}` },
      { text: "⏭️ Skip Current", callback_data: `marathon_skip:${marathonId}` },
    ]);
  } else if (status === "paused") {
    buttons.push([
      { text: "▶️ Resume", callback_data: `marathon_resume:${marathonId}` },
      { text: "⛔ Abort", callback_data: `marathon_abort:${marathonId}` },
    ]);
  }

  buttons.push([
    { text: "🔄 Refresh", callback_data: `marathon_refresh:${marathonId}` },
  ]);

  return { inline_keyboard: buttons };
}

export function createMilestoneKeyboard(milestoneId: string, marathonId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Continue", callback_data: `ms_continue:${milestoneId}:${marathonId}` },
        { text: "⏭️ Skip", callback_data: `ms_skip:${milestoneId}:${marathonId}` },
      ],
      [
        { text: "🔄 Retry", callback_data: `ms_retry:${milestoneId}:${marathonId}` },
        { text: "✏️ Edit", callback_data: `ms_edit:${milestoneId}:${marathonId}` },
      ],
    ],
  };
}

export function createImageFeedbackKeyboard(imageId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Perfect!", callback_data: `img_approve:${imageId}` },
        { text: "🔄 Regenerate", callback_data: `img_regen:${imageId}` },
      ],
      [
        { text: "✏️ Edit Prompt", callback_data: `img_edit:${imageId}` },
        { text: "🎨 Variations", callback_data: `img_vary:${imageId}` },
      ],
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETION & SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

export function formatMarathonComplete(
  state: MarathonState,
  stats: {
    duration: number;
    tokensUsed: number;
    toolCalls: number;
    filesCreated: number;
  },
  artifacts: string[] = []
): string {
  const { plan } = state;
  const completed = plan.milestones.filter(m => m.status === "completed").length;
  const failed = plan.milestones.filter(m => m.status === "failed").length;

  let msg = `
🎉 *Marathon Complete!*

╭─────────────────────────────────╮
│  ✅ *SUCCESS*                   │
╰─────────────────────────────────╯

*Goal:* ${plan.goal}

*Stats:*
📋 Milestones: ${completed}/${plan.milestones.length}${failed > 0 ? ` (${failed} failed)` : ""}
⏱️ Duration: ${formatDuration(stats.duration)}
🧠 Tokens: ${formatTokens(stats.tokensUsed)}
🔧 Tool Calls: ${stats.toolCalls}
📁 Files: ${stats.filesCreated}
`.trim();

  if (artifacts.length > 0) {
    msg += `\n\n*Created:*\n`;
    for (const artifact of artifacts.slice(0, 8)) {
      msg += `• \`${artifact}\`\n`;
    }
    if (artifacts.length > 8) {
      msg += `_...and ${artifacts.length - 8} more_\n`;
    }
  }

  msg += `\n\n───────────────────────────`;
  msg += `\n_Built autonomously with Wispy + Gemini_ ☁️`;

  return msg;
}

export function createCompletionKeyboard(marathonId: string, projectPath?: string) {
  const buttons: any[][] = [
    [
      { text: "🚀 Deploy", callback_data: `deploy:${marathonId}` },
      { text: "📦 Download ZIP", callback_data: `download:${marathonId}` },
    ],
    [
      { text: "📝 View Report", callback_data: `report:${marathonId}` },
      { text: "🔄 Run Again", callback_data: `rerun:${marathonId}` },
    ],
  ];

  if (projectPath) {
    buttons.push([
      { text: "🖥️ Open in Browser", callback_data: `open:${marathonId}` },
    ]);
  }

  return { inline_keyboard: buttons };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THINKING & REASONING DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

export function formatThinkingMessage(thought: string, tokens: number = 0): string {
  const truncated = thought.length > 200 ? thought.slice(0, 200) + "..." : thought;

  return `
💭 *Thinking...*

_"${truncated}"_

${tokens > 0 ? `🧠 ${formatTokens(tokens)} tokens` : ""}
`.trim();
}

export function formatReasoningTrace(
  steps: Array<{ action: string; reason: string }>
): string {
  let msg = `🧠 *Reasoning Trace*\n\n`;

  for (let i = 0; i < Math.min(steps.length, 5); i++) {
    const step = steps[i];
    msg += `${i + 1}. *${step.action}*\n   _${step.reason}_\n\n`;
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEGRAM API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendPlanningMessage(
  chatId: string,
  plan: MarathonPlan,
  marathonId: string,
  thinkingTokens: number = 24576
): Promise<number | null> {
  if (!telegramBot) {
    log.warn("Telegram bot not initialized");
    return null;
  }

  try {
    const message = await telegramBot.api.sendMessage(
      chatId,
      formatPlanningMessage(plan, thinkingTokens),
      {
        parse_mode: "Markdown",
        reply_markup: createMarathonControlKeyboard(marathonId, "executing"),
      }
    );

    activeProgressMessages.set(marathonId, {
      chatId,
      messageId: message.message_id,
      lastUpdate: Date.now(),
    });

    return message.message_id;
  } catch (err) {
    log.error({ err }, "Failed to send planning message");
    return null;
  }
}

export async function updateProgressMessage(
  marathonId: string,
  state: MarathonState
): Promise<boolean> {
  if (!telegramBot) return false;

  const stored = activeProgressMessages.get(marathonId);
  if (!stored) return false;

  // Throttle updates to avoid Telegram rate limits
  const now = Date.now();
  if (now - stored.lastUpdate < 2000) return false;

  try {
    await telegramBot.api.editMessageText(
      stored.chatId,
      stored.messageId,
      formatProgressMessage(state),
      {
        parse_mode: "Markdown",
        reply_markup: createMarathonControlKeyboard(marathonId, state.status),
      }
    );
    stored.lastUpdate = now;
    return true;
  } catch (err) {
    log.debug("Could not update progress message: %s", (err as Error).message);
    return false;
  }
}

export async function sendToolNotification(
  chatId: string,
  toolName: string,
  args: Record<string, unknown>,
  marathonId: string
): Promise<void> {
  if (!telegramBot) return;

  try {
    const msg = formatToolExecution(toolName, args, "running");
    const message = await telegramBot.api.sendMessage(chatId, msg, {
      parse_mode: "Markdown",
    });

    toolStreamMessages.set(`${marathonId}:${toolName}:${Date.now()}`, {
      chatId,
      messageId: message.message_id,
    });
  } catch (err) {
    log.debug("Failed to send tool notification");
  }
}

export async function sendMilestoneNotification(
  chatId: string,
  milestone: Milestone,
  index: number,
  total: number,
  type: "start" | "complete" | "failed",
  extra?: { duration?: number; artifacts?: string[]; error?: string; retryCount?: number }
): Promise<void> {
  if (!telegramBot) return;

  let msg = "";

  if (type === "start") {
    msg = formatMilestoneStart(milestone, index, total);
  } else if (type === "complete") {
    msg = formatMilestoneComplete(milestone, index, total, extra?.duration || 0, extra?.artifacts);
  } else if (type === "failed") {
    msg = formatMilestoneFailed(milestone, index, extra?.error || "Unknown error", extra?.retryCount || 0, milestone.maxRetries || 3);
  }

  try {
    await telegramBot.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  } catch (err) {
    log.debug("Failed to send milestone notification");
  }
}

export async function sendApprovalRequest(
  chatId: string,
  approvalId: string,
  action: string,
  description: string,
  risk: "low" | "medium" | "high" | "critical",
  details: Record<string, string>
): Promise<void> {
  if (!telegramBot) return;

  try {
    await telegramBot.api.sendMessage(
      chatId,
      formatApprovalMessage(action, description, risk, details),
      {
        parse_mode: "Markdown",
        reply_markup: createApprovalKeyboard(approvalId, risk),
      }
    );
  } catch (err) {
    log.error({ err }, "Failed to send approval request");
  }
}

export async function sendMarathonComplete(
  chatId: string,
  state: MarathonState,
  stats: { duration: number; tokensUsed: number; toolCalls: number; filesCreated: number },
  artifacts: string[] = []
): Promise<void> {
  if (!telegramBot) return;

  try {
    await telegramBot.api.sendMessage(
      chatId,
      formatMarathonComplete(state, stats, artifacts),
      {
        parse_mode: "Markdown",
        reply_markup: createCompletionKeyboard(state.id),
      }
    );

    activeProgressMessages.delete(state.id);
  } catch (err) {
    log.error({ err }, "Failed to send completion message");
  }
}

export async function sendThinkingNotification(
  chatId: string,
  thought: string,
  tokens: number = 0
): Promise<number | null> {
  if (!telegramBot) return null;

  try {
    const message = await telegramBot.api.sendMessage(
      chatId,
      formatThinkingMessage(thought, tokens),
      { parse_mode: "Markdown" }
    );
    return message.message_id;
  } catch (err) {
    log.debug("Failed to send thinking notification");
    return null;
  }
}

export async function sendVerificationNotification(
  chatId: string,
  type: "start" | "complete",
  milestone: { title: string; verificationSteps?: string[] },
  results?: Array<{ step: string; passed: boolean; output?: string }>
): Promise<void> {
  if (!telegramBot) return;

  try {
    let msg = "";

    if (type === "start") {
      msg = formatVerificationStart(milestone as any);
    } else if (results) {
      const passed = results.every(r => r.passed);
      msg = formatVerificationResult(passed, results);
    }

    await telegramBot.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  } catch (err) {
    log.debug("Failed to send verification notification");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  initMarathonVisuals,
  formatPlanningStart,
  formatPlanningMessage,
  formatProgressMessage,
  formatToolExecution,
  formatToolStreamMessage,
  formatCodeDiff,
  formatFilesCreated,
  formatMilestoneStart,
  formatMilestoneComplete,
  formatMilestoneFailed,
  formatVerificationStart,
  formatVerificationResult,
  formatApprovalMessage,
  formatMarathonComplete,
  formatThinkingMessage,
  formatReasoningTrace,
  createApprovalKeyboard,
  createMarathonControlKeyboard,
  createMilestoneKeyboard,
  createImageFeedbackKeyboard,
  createCompletionKeyboard,
  sendPlanningMessage,
  updateProgressMessage,
  sendToolNotification,
  sendMilestoneNotification,
  sendApprovalRequest,
  sendMarathonComplete,
  sendThinkingNotification,
  sendVerificationNotification,
};
