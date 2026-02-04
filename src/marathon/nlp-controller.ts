/**
 * Marathon NLP Controller
 *
 * Natural language interface for durable background agents.
 * Users can interact conversationally:
 *
 * - "Build me a todo app with React" → starts marathon
 * - "How's it going?" → shows status
 * - "Yes, do it" → approves pending request
 * - "Stop for now" → pauses marathon
 * - "What are you working on?" → shows current task
 */

import { createLogger } from "../infra/logger.js";
import type { MarathonService } from "./service.js";
import type { DurableMarathonState, ApprovalRequest } from "./types.js";
import { getPlanProgress } from "./planner.js";

const log = createLogger("marathon-nlp");

// ============================================
// INTENT TYPES
// ============================================

export type MarathonIntent =
  | "start_marathon"
  | "check_status"
  | "check_progress"
  | "pause"
  | "resume"
  | "abort"
  | "approve"
  | "reject"
  | "list_marathons"
  | "show_approvals"
  | "help"
  | "none";

export interface IntentResult {
  intent: MarathonIntent;
  confidence: number;
  extractedGoal?: string;
  extractedReason?: string;
  shouldHandle: boolean;
}

// ============================================
// INTENT PATTERNS
// ============================================

const INTENT_PATTERNS: Record<MarathonIntent, RegExp[]> = {
  start_marathon: [
    /^(build|create|make|develop|code|implement|design|set up|setup)\s+(me\s+)?(a|an|the)?\s*(.+)/i,
    /^(i want|i need|can you|please|could you)\s+(build|create|make|develop)\s+(.+)/i,
    /^(start|begin|kick off|launch)\s+(a\s+)?(project|task|marathon|work)\s*(on|for|to)?\s*(.+)/i,
    /^(work on|get started on|begin work on)\s+(.+)/i,
    /^let'?s\s+(build|create|make|work on)\s+(.+)/i,
  ],
  check_status: [
    /^(what'?s|what is)\s+(the\s+)?(status|progress|state|situation)/i,
    /^(how'?s|how is)\s+(it|everything|the work|the project|progress)\s*(going|coming along)?/i,
    /^(status|progress|update)\s*(please|update|report)?$/i,
    /^(where are we|what'?s happening|what are you doing)/i,
    /^(show|give|tell)\s+(me\s+)?(the\s+)?(status|progress)/i,
  ],
  check_progress: [
    /^(how far|how much)\s+(along|done|complete|left)/i,
    /^(what'?s|what is)\s+(left|remaining|done|completed)/i,
    /^(progress|percentage|percent)\s*(done|complete|remaining)?/i,
    /^(are you|you)\s+(done|finished|complete)/i,
  ],
  pause: [
    /^(pause|stop|wait|hold|halt)\s*(for now|please|it|everything|the work)?$/i,
    /^(take a break|stop working|hold on|one moment)/i,
    /^(i need you to|please)\s+(pause|stop|wait)/i,
    /^stop\s*(what you'?re doing|working|it)?$/i,
  ],
  resume: [
    /^(resume|continue|go on|proceed|carry on|keep going)\s*(please|now|working)?$/i,
    /^(start again|pick up|get back to)\s*(work|it|where you left)?/i,
    /^(okay|ok|alright),?\s*(continue|resume|go|proceed)/i,
    /^let'?s\s+(continue|resume|go|proceed)/i,
  ],
  abort: [
    /^(abort|cancel|stop completely|end|terminate)\s*(everything|the marathon|all|it)?$/i,
    /^(i want to|please)\s+(cancel|abort|stop)\s*(everything|it|the work)/i,
    /^(forget it|never mind|cancel that|scrap it)/i,
    /^(kill|terminate)\s+(it|the task|everything)/i,
  ],
  approve: [
    /^(yes|yeah|yep|yup|sure|ok|okay|alright|affirmative|approved|go ahead|do it|proceed)$/i,
    /^(yes|yeah),?\s*(please|do it|go ahead|proceed|approved)/i,
    /^(that'?s|it'?s|looks)\s+(fine|good|okay|ok|great)/i,
    /^(i approve|approved|confirmed|confirm)/i,
    /^(go|proceed|continue)\s*(ahead|with it)?$/i,
    /^(do it|execute|run it|make it so)/i,
    /^👍|✅|✔️|💯$/,
  ],
  reject: [
    /^(no|nope|nah|don'?t|stop|cancel|deny|denied|rejected)$/i,
    /^(no,?\s*)?(don'?t do that|cancel that|stop that|abort that)/i,
    /^(i don'?t want|please don'?t|do not)\s+(that|it|this)/i,
    /^(reject|denied|disapprove|refuse)/i,
    /^(bad idea|too risky|not safe)/i,
    /^👎|❌|🚫$/,
  ],
  list_marathons: [
    /^(list|show|what are)\s*(my|the|all)?\s*(marathons|tasks|projects|jobs)/i,
    /^(what|which)\s+(marathons|tasks|projects)\s+(do i have|are there|exist)/i,
    /^(my|all)\s+(marathons|tasks|projects)/i,
  ],
  show_approvals: [
    /^(show|list|what are)\s*(the|my|pending)?\s*(approvals|requests|pending)/i,
    /^(any|are there)\s*(pending)?\s*(approvals|requests)/i,
    /^(what needs|what'?s waiting for)\s+(my\s+)?(approval|confirmation)/i,
    /^(pending|waiting)\s*(approvals|requests|actions)?$/i,
  ],
  help: [
    /^(help|what can you do|commands|how do i|how to)/i,
    /^(marathon|task)\s+(help|commands|options)/i,
  ],
  none: [],
};

// ============================================
// CONTEXT TRACKING
// ============================================

interface ConversationContext {
  hasActiveMarathon: boolean;
  hasPendingApproval: boolean;
  lastIntent: MarathonIntent;
  lastApprovalId?: string;
  marathonId?: string;
}

const contextCache = new Map<string, ConversationContext>();

function getContext(userId: string): ConversationContext {
  return contextCache.get(userId) || {
    hasActiveMarathon: false,
    hasPendingApproval: false,
    lastIntent: "none",
  };
}

function updateContext(userId: string, updates: Partial<ConversationContext>): void {
  const current = getContext(userId);
  contextCache.set(userId, { ...current, ...updates });
}

// ============================================
// INTENT DETECTION
// ============================================

/**
 * Detect marathon intent from natural language
 */
export function detectIntent(
  message: string,
  userId: string,
  marathonService?: MarathonService
): IntentResult {
  const text = message.trim();
  const context = getContext(userId);

  // Update context from marathon service
  if (marathonService) {
    const activeMarathon = marathonService.getStatus();
    const pendingApprovals = marathonService.getPendingApprovals();

    context.hasActiveMarathon = !!activeMarathon &&
      (activeMarathon.status === "executing" || activeMarathon.status === "paused");
    context.hasPendingApproval = pendingApprovals.length > 0;
    context.marathonId = activeMarathon?.id;

    if (pendingApprovals.length > 0) {
      context.lastApprovalId = pendingApprovals[0].request.id;
    }

    updateContext(userId, context);
  }

  // Check for approval/rejection first if there's a pending approval
  if (context.hasPendingApproval) {
    for (const pattern of INTENT_PATTERNS.approve) {
      if (pattern.test(text)) {
        return {
          intent: "approve",
          confidence: 0.95,
          shouldHandle: true,
        };
      }
    }
    for (const pattern of INTENT_PATTERNS.reject) {
      if (pattern.test(text)) {
        return {
          intent: "reject",
          confidence: 0.95,
          shouldHandle: true,
        };
      }
    }
  }

  // Check each intent
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === "none") continue;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const result: IntentResult = {
          intent: intent as MarathonIntent,
          confidence: 0.85,
          shouldHandle: true,
        };

        // Extract goal for start_marathon
        if (intent === "start_marathon") {
          // Get the captured group that contains the goal
          const goalParts = match.slice(1).filter(Boolean);
          const goal = goalParts[goalParts.length - 1]?.trim();
          if (goal && goal.length > 3) {
            result.extractedGoal = goal;
            result.confidence = 0.9;
          } else {
            result.shouldHandle = false;
          }
        }

        // Context-based confidence adjustment
        if (intent === "check_status" && !context.hasActiveMarathon) {
          result.confidence = 0.6; // Lower confidence if no active marathon
        }
        if (intent === "pause" && !context.hasActiveMarathon) {
          result.shouldHandle = false;
        }
        if (intent === "resume" && context.hasActiveMarathon) {
          const status = marathonService?.getStatus();
          if (status?.status !== "paused") {
            result.shouldHandle = false;
          }
        }

        if (result.shouldHandle) {
          updateContext(userId, { lastIntent: intent as MarathonIntent });
          return result;
        }
      }
    }
  }

  // Check if this looks like a project request even without explicit triggers
  if (isLikelyProjectRequest(text)) {
    return {
      intent: "start_marathon",
      confidence: 0.7,
      extractedGoal: text,
      shouldHandle: false, // Let the agent decide if it should be a marathon
    };
  }

  return {
    intent: "none",
    confidence: 0,
    shouldHandle: false,
  };
}

/**
 * Check if message looks like a project/task request
 */
function isLikelyProjectRequest(text: string): boolean {
  const projectIndicators = [
    /\b(app|application|website|site|api|server|dashboard|platform)\b/i,
    /\b(with|using|in)\s+(react|vue|next|express|node|python|typescript)\b/i,
    /\b(full[- ]?stack|frontend|backend|database)\b/i,
    /\b(deploy|host|publish)\b/i,
    /\b(authentication|auth|login|signup|crud)\b/i,
  ];

  return projectIndicators.some(pattern => pattern.test(text)) && text.length > 20;
}

// ============================================
// RESPONSE GENERATION
// ============================================

/**
 * Generate natural language response for marathon actions
 */
export function generateResponse(
  intent: MarathonIntent,
  state?: DurableMarathonState,
  details?: Record<string, any>
): string {
  switch (intent) {
    case "start_marathon":
      return `🚀 I'm on it! Starting work on "${details?.goal}".\n\n` +
        `I'll break this down into milestones and work through them autonomously. ` +
        `I'll keep you posted on progress and ask for approval if I need to do anything risky.\n\n` +
        `You can ask "how's it going?" anytime to check status.`;

    case "check_status":
      if (!state) {
        return `I'm not working on any long-running tasks right now. ` +
          `Want me to start something? Just tell me what to build!`;
      }
      return formatStatusNaturally(state);

    case "check_progress":
      if (!state) {
        return `Nothing in progress at the moment. What would you like me to work on?`;
      }
      const progress = getPlanProgress(state.plan);
      return `I'm ${progress.percentage}% done - completed ${progress.completed} of ${progress.total} milestones. ` +
        `About ${progress.estimatedRemainingMinutes} minutes remaining.`;

    case "pause":
      return `⏸️ Paused! I'll hold here until you say "continue" or "resume".`;

    case "resume":
      return `▶️ Resuming work! I'll pick up where I left off.`;

    case "abort":
      return `🛑 Stopped completely. The task has been cancelled. Let me know if you want to start something new.`;

    case "approve":
      return `✅ Got it, proceeding with that action. I'll continue working.`;

    case "reject":
      return `❌ Understood, I won't do that. I'll find another approach or ask you what to do instead.`;

    case "list_marathons":
      if (!details?.marathons || details.marathons.length === 0) {
        return `You don't have any tasks in my history. Want to start one?`;
      }
      return formatMarathonListNaturally(details.marathons);

    case "show_approvals":
      if (!details?.approvals || details.approvals.length === 0) {
        return `Nothing waiting for your approval right now. I'll ask when I need permission for something.`;
      }
      return formatApprovalsNaturally(details.approvals);

    case "help":
      return `I can work on long-running tasks autonomously. Just tell me what to build!\n\n` +
        `**Examples:**\n` +
        `• "Build me a React dashboard with authentication"\n` +
        `• "Create an Express API with user management"\n` +
        `• "How's it going?" - check my progress\n` +
        `• "Pause" / "Continue" - control the work\n` +
        `• "Yes" / "No" - when I ask for approval`;

    default:
      return "";
  }
}

/**
 * Format status in natural language
 */
function formatStatusNaturally(state: DurableMarathonState): string {
  const progress = getPlanProgress(state.plan);
  const currentMilestone = state.plan.milestones.find(m => m.status === "in_progress");

  let response = "";

  switch (state.status) {
    case "executing":
      response = `I'm working on "${state.plan.goal}".\n\n`;
      if (currentMilestone) {
        response += `**Currently:** ${currentMilestone.title}\n`;
      }
      response += `**Progress:** ${progress.completed}/${progress.total} milestones (${progress.percentage}%)\n`;
      response += `**ETA:** About ${progress.estimatedRemainingMinutes} minutes`;
      break;

    case "paused":
      response = `I'm paused on "${state.plan.goal}".\n\n`;
      response += `**Progress:** ${progress.completed}/${progress.total} milestones\n`;
      response += `Say "continue" when you're ready for me to resume.`;
      break;

    case "waiting_human":
      response = `⚠️ I'm waiting for your approval.\n\n`;
      const pendingReq = (state as any).approvalRequests?.find((r: any) => r.status === "pending");
      if (pendingReq) {
        response += `**Action:** ${pendingReq.description}\n`;
        response += `**Risk:** ${pendingReq.risk}\n\n`;
        response += `Reply "yes" to approve or "no" to reject.`;
      }
      break;

    case "completed":
      response = `✅ I finished "${state.plan.goal}"!\n\n`;
      response += `Completed all ${progress.total} milestones.\n`;
      if (state.artifacts.length > 0) {
        response += `\n**Created:**\n${state.artifacts.map(a => `• ${a}`).join("\n")}`;
      }
      break;

    case "failed":
      response = `❌ Unfortunately, I couldn't complete "${state.plan.goal}".\n\n`;
      const failed = state.plan.milestones.filter(m => m.status === "failed");
      response += `**Failed at:** ${failed.map(m => m.title).join(", ")}\n`;
      response += `\nWould you like me to try a different approach?`;
      break;

    default:
      response = `Status: ${state.status} - ${state.plan.goal}`;
  }

  return response;
}

/**
 * Format marathon list naturally
 */
function formatMarathonListNaturally(marathons: DurableMarathonState[]): string {
  let response = `📋 **Your Tasks:**\n\n`;

  for (const m of marathons.slice(0, 5)) {
    const statusEmoji: Record<string, string> = {
      executing: "⚡",
      paused: "⏸️",
      completed: "✅",
      failed: "❌",
      waiting_human: "👤",
    };
    const progress = getPlanProgress(m.plan);
    response += `${statusEmoji[m.status] || "❓"} ${m.plan.goal.slice(0, 50)}...\n`;
    response += `   ${progress.percentage}% complete\n\n`;
  }

  return response;
}

/**
 * Format approvals naturally
 */
function formatApprovalsNaturally(approvals: Array<{ marathonId: string; request: ApprovalRequest }>): string {
  let response = `⚠️ **Waiting for your approval:**\n\n`;

  for (const { request } of approvals) {
    const riskEmoji: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      critical: "🔴",
    };
    response += `${riskEmoji[request.risk] || "⚪"} ${request.description}\n`;
    response += `   Risk: ${request.risk}\n\n`;
  }

  response += `Reply "yes" to approve or "no" to reject.`;
  return response;
}

// ============================================
// MAIN HANDLER
// ============================================

export interface NLPHandlerResult {
  handled: boolean;
  response?: string;
  shouldContinueToAgent?: boolean;
}

/**
 * Main NLP handler for marathon interactions
 */
export async function handleMarathonNLP(
  message: string,
  userId: string,
  marathonService: MarathonService,
  agent: any,
  apiKey: string
): Promise<NLPHandlerResult> {
  const intent = detectIntent(message, userId, marathonService);

  log.debug({ intent, message: message.slice(0, 50) }, "Detected intent");

  if (!intent.shouldHandle) {
    return { handled: false, shouldContinueToAgent: true };
  }

  const context = getContext(userId);

  switch (intent.intent) {
    case "start_marathon": {
      if (!intent.extractedGoal) {
        return {
          handled: true,
          response: "What would you like me to build? Just describe it and I'll get started!",
        };
      }

      // Start the marathon
      try {
        marathonService.startDurable(intent.extractedGoal, agent, apiKey, {
          workingDirectory: process.cwd(),
        }).catch(err => {
          log.error({ err }, "Marathon execution error");
        });

        return {
          handled: true,
          response: generateResponse("start_marathon", undefined, { goal: intent.extractedGoal }),
        };
      } catch (err) {
        return {
          handled: true,
          response: `Oops, I couldn't start that task: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
      }
    }

    case "check_status":
    case "check_progress": {
      const state = marathonService.getStatus() as DurableMarathonState | null;
      return {
        handled: true,
        response: generateResponse(intent.intent, state || undefined),
      };
    }

    case "pause": {
      marathonService.pause();
      return {
        handled: true,
        response: generateResponse("pause"),
      };
    }

    case "resume": {
      const state = marathonService.getStatus();
      if (state && state.status === "paused") {
        marathonService.resume(state.id, agent, apiKey).catch(err => {
          log.error({ err }, "Resume error");
        });
        return {
          handled: true,
          response: generateResponse("resume"),
        };
      }
      return {
        handled: true,
        response: "Nothing to resume - I'm not paused right now.",
      };
    }

    case "abort": {
      marathonService.abort();
      return {
        handled: true,
        response: generateResponse("abort"),
      };
    }

    case "approve": {
      if (context.lastApprovalId && context.marathonId) {
        marathonService.approve(context.marathonId, context.lastApprovalId, `user:${userId}`);
        return {
          handled: true,
          response: generateResponse("approve"),
        };
      }
      return {
        handled: true,
        response: "There's nothing waiting for approval right now.",
      };
    }

    case "reject": {
      if (context.lastApprovalId && context.marathonId) {
        marathonService.reject(context.marathonId, context.lastApprovalId, "User rejected");
        return {
          handled: true,
          response: generateResponse("reject"),
        };
      }
      return {
        handled: true,
        response: "There's nothing to reject right now.",
      };
    }

    case "list_marathons": {
      const marathons = marathonService.listMarathons() as DurableMarathonState[];
      return {
        handled: true,
        response: generateResponse("list_marathons", undefined, { marathons }),
      };
    }

    case "show_approvals": {
      const approvals = marathonService.getPendingApprovals();
      return {
        handled: true,
        response: generateResponse("show_approvals", undefined, { approvals }),
      };
    }

    case "help": {
      return {
        handled: true,
        response: generateResponse("help"),
      };
    }

    default:
      return { handled: false, shouldContinueToAgent: true };
  }
}

/**
 * Check if a message might be marathon-related (for pre-filtering)
 */
export function mightBeMarathonRelated(message: string): boolean {
  const text = message.toLowerCase();

  const keywords = [
    "build", "create", "make", "develop", "code",
    "status", "progress", "how's it going",
    "pause", "stop", "continue", "resume",
    "approve", "reject", "yes", "no",
    "marathon", "task", "project",
  ];

  return keywords.some(kw => text.includes(kw));
}
