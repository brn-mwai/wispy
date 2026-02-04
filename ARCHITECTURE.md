# Wispy Sentinel Architecture

## System Overview

Wispy Sentinel is an autonomous DeFi monitoring agent built on top of Wispy's Marathon Mode. It continuously monitors DeFi protocols, analyzes threats using Gemini 3, and executes protective actions with human approval.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              WISPY SENTINEL                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   TRIGGER   │───▶│   MONITOR   │───▶│   ANALYZE   │───▶│    ACT      │      │
│  │   LAYER     │    │   LAYER     │    │   LAYER     │    │   LAYER     │      │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘      │
│        │                  │                  │                  │               │
│        │                  │                  │                  │               │
│  ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐       │
│  │ CRE Cron  │      │ Uniswap   │      │ Gemini 3  │      │ Trust     │       │
│  │ EVM Event │      │ Aave      │      │ Pro       │      │ Controls  │       │
│  │ Price     │      │ Compound  │      │ (High     │      │ + Human   │       │
│  │ Threshold │      │ + Others  │      │ Thinking) │      │ Approval  │       │
│  └───────────┘      └───────────┘      └───────────┘      └───────────┘       │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        MARATHON MODE (Existing)                           │  │
│  │  • Multi-day execution  • Self-verification  • Loop detection            │  │
│  │  • Checkpoints          • Recovery           • Thought Signatures        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        NOTIFICATION LAYER                                 │  │
│  │  Telegram (primary)  •  WhatsApp  •  Discord  •  Slack  •  Web           │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer Architecture

### Layer 1: Trigger Layer
**Purpose:** Event-driven activation (solves "Polling Tax" problem from research)

```
┌─────────────────────────────────────────────────────────────────┐
│                       TRIGGER LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    CRON     │  │  EVM EVENT  │  │   PRICE     │             │
│  │   TRIGGER   │  │   TRIGGER   │  │  THRESHOLD  │             │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤             │
│  │ */5 * * * * │  │ Swap()      │  │ deviation   │             │
│  │ (every 5m)  │  │ Transfer()  │  │ > 5%        │             │
│  │             │  │ Sync()      │  │             │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │  TRIGGER    │                               │
│                   │  DISPATCHER │                               │
│                   └──────┬──────┘                               │
│                          │                                      │
│                          ▼                                      │
│                   SentinelMonitor.check()                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Interfaces:**

```typescript
// src/triggers/types.ts

type TriggerType = 'cron' | 'evm_event' | 'price_threshold' | 'manual';

interface Trigger {
  id: string;
  type: TriggerType;
  config: TriggerConfig;
  enabled: boolean;
  lastFired?: string;
}

interface CronTriggerConfig {
  schedule: string;  // Cron expression
}

interface EVMEventTriggerConfig {
  chainId: number;
  contractAddress: string;
  eventSignature: string;
  filter?: Record<string, unknown>;
}

interface PriceThresholdConfig {
  asset: string;
  threshold: number;  // Percentage deviation
  direction: 'up' | 'down' | 'both';
}

type TriggerConfig = CronTriggerConfig | EVMEventTriggerConfig | PriceThresholdConfig;

interface TriggerEvent {
  triggerId: string;
  type: TriggerType;
  timestamp: string;
  data: Record<string, unknown>;
}
```

---

### Layer 2: Monitor Layer
**Purpose:** Fetch and aggregate protocol state

```
┌─────────────────────────────────────────────────────────────────┐
│                       MONITOR LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  PROTOCOL REGISTRY                       │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │    │
│  │  │ Uniswap  │  │  Aave    │  │ Compound │  │ Custom  │ │    │
│  │  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter │ │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │    │
│  │       │             │             │             │       │    │
│  └───────┼─────────────┼─────────────┼─────────────┼───────┘    │
│          │             │             │             │             │
│          └─────────────┼─────────────┼─────────────┘             │
│                        ▼             ▼                           │
│               ┌─────────────────────────────┐                   │
│               │     UNIFIED SNAPSHOT        │                   │
│               │  • liquidity                │                   │
│               │  • price                    │                   │
│               │  • volume_24h               │                   │
│               │  • tvl_change               │                   │
│               │  • whale_transactions       │                   │
│               └─────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Interfaces:**

```typescript
// src/defi/types.ts

interface ProtocolAdapter {
  id: string;
  name: string;
  type: 'dex' | 'lending' | 'yield' | 'bridge';

  // Required methods
  getSnapshot(address: string): Promise<ProtocolSnapshot>;
  getHistorical(address: string, days: number): Promise<ProtocolSnapshot[]>;
  subscribeEvents?(callback: (event: ProtocolEvent) => void): void;
}

interface ProtocolSnapshot {
  protocol: string;
  address: string;
  chainId: number;
  timestamp: string;

  // Universal metrics
  tvl: string;
  tvlChange24h: number;
  volume24h: string;

  // Protocol-specific
  metrics: Record<string, unknown>;
}

// Uniswap-specific
interface UniswapPoolSnapshot extends ProtocolSnapshot {
  metrics: {
    tick: number;
    liquidity: string;
    sqrtPrice: string;
    token0: TokenInfo;
    token1: TokenInfo;
    feeTier: number;
    recentSwaps: SwapEvent[];
  };
}

interface SwapEvent {
  sender: string;
  amount0: string;
  amount1: string;
  timestamp: string;
  txHash: string;
}
```

---

### Layer 3: Analyze Layer
**Purpose:** AI-powered threat detection and risk assessment

```
┌─────────────────────────────────────────────────────────────────┐
│                       ANALYZE LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 RULE-BASED DETECTOR                      │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │    │
│  │  │ Liquidity │  │   Price   │  │   Whale   │           │    │
│  │  │   Drop    │  │ Deviation │  │  Movement │           │    │
│  │  │  > 20%    │  │   > 5%    │  │  > 10%    │           │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘           │    │
│  │        │              │              │                  │    │
│  └────────┼──────────────┼──────────────┼──────────────────┘    │
│           │              │              │                        │
│           └──────────────┼──────────────┘                        │
│                          ▼                                       │
│                   ┌─────────────┐                                │
│                   │   SIGNALS   │                                │
│                   │   ARRAY     │                                │
│                   └──────┬──────┘                                │
│                          │                                       │
│                          ▼ (if signals.length > 0)               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 GEMINI 3 ANALYZER                        │    │
│  │                                                          │    │
│  │  Input:                                                  │    │
│  │  • Protocol snapshot                                     │    │
│  │  • Historical data (7 days)                              │    │
│  │  • Risk signals from rule engine                         │    │
│  │  • Known exploit patterns                                │    │
│  │                                                          │    │
│  │  Processing:                                             │    │
│  │  • Thinking Level: HIGH                                  │    │
│  │  • Compare to historical patterns                        │    │
│  │  • Cross-reference exploit database                      │    │
│  │  • Assess probability and impact                         │    │
│  │                                                          │    │
│  │  Output: ThreatAnalysis                                  │    │
│  │  • threatLevel: none|low|medium|high|critical            │    │
│  │  • confidence: 0-100                                     │    │
│  │  • reasoning: string                                     │    │
│  │  • recommendedAction: monitor|alert|withdraw|pause       │    │
│  │  • urgency: low|medium|high|immediate                    │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Interfaces:**

```typescript
// src/sentinel/types.ts

type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type RecommendedAction = 'monitor' | 'alert' | 'withdraw' | 'pause';
type Urgency = 'low' | 'medium' | 'high' | 'immediate';

interface RiskSignal {
  id: string;
  type: 'liquidity_drop' | 'price_deviation' | 'whale_movement' |
        'contract_upgrade' | 'oracle_stale' | 'unusual_volume';
  severity: 'info' | 'warning' | 'danger' | 'critical';
  protocol: string;
  description: string;
  value: number;
  threshold: number;
  detectedAt: string;
}

interface ThreatAnalysis {
  id: string;
  protocol: string;
  timestamp: string;

  // Assessment
  threatLevel: ThreatLevel;
  confidence: number;  // 0-100

  // Explanation
  summary: string;
  reasoning: string;
  indicators: string[];

  // Action
  recommendedAction: RecommendedAction;
  urgency: Urgency;

  // For audit
  signals: RiskSignal[];
  snapshotUsed: ProtocolSnapshot;
}
```

---

### Layer 4: Act Layer
**Purpose:** Execute protective actions with human approval

```
┌─────────────────────────────────────────────────────────────────┐
│                         ACT LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   TRUST CONTROLS                         │    │
│  │                                                          │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │              ACTION CLASSIFIER                     │  │    │
│  │  │                                                    │  │    │
│  │  │  Action + Args ───▶ Risk Level                    │  │    │
│  │  │                                                    │  │    │
│  │  │  LOW:      Read-only (fetch, query)               │  │    │
│  │  │  MEDIUM:   State changes (write file)             │  │    │
│  │  │  HIGH:     Financial (small tx)                   │  │    │
│  │  │  CRITICAL: Financial (large tx), Destructive      │  │    │
│  │  │                                                    │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │                          │                              │    │
│  │                          ▼                              │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │              APPROVAL ROUTER                       │  │    │
│  │  │                                                    │  │    │
│  │  │  LOW ────────────▶ Auto-approve                   │  │    │
│  │  │  MEDIUM ─────────▶ Log + Execute                  │  │    │
│  │  │  HIGH ───────────▶ Request Approval (async)       │  │    │
│  │  │  CRITICAL ───────▶ Request Approval (sync, wait)  │  │    │
│  │  │                                                    │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │                          │                              │    │
│  └──────────────────────────┼──────────────────────────────┘    │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 APPROVAL REQUEST                         │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │               TELEGRAM MESSAGE                   │    │    │
│  │  │                                                  │    │    │
│  │  │  ⚠️ ACTION REQUIRES APPROVAL                    │    │    │
│  │  │                                                  │    │    │
│  │  │  Protocol: Uniswap ETH/USDC                     │    │    │
│  │  │  Threat: HIGH (87% confidence)                  │    │    │
│  │  │  Action: Withdraw liquidity                     │    │    │
│  │  │  Amount: $5,000                                 │    │    │
│  │  │  Reason: 23% liquidity drop in 1 hour           │    │    │
│  │  │                                                  │    │    │
│  │  │  [✅ Approve]  [❌ Reject]  [📊 Details]       │    │    │
│  │  │                                                  │    │    │
│  │  │  ⏱️ Auto-rejects in 5:00                        │    │    │
│  │  │                                                  │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 ACTION EXECUTOR                          │    │
│  │                                                          │    │
│  │  If approved:                                            │    │
│  │    • Execute via existing Wispy tools                    │    │
│  │    • Log to audit trail                                  │    │
│  │    • Update Marathon state                               │    │
│  │    • Notify completion                                   │    │
│  │                                                          │    │
│  │  If rejected:                                            │    │
│  │    • Log rejection                                       │    │
│  │    • Continue monitoring                                 │    │
│  │                                                          │    │
│  │  If timeout:                                             │    │
│  │    • Log timeout                                         │    │
│  │    • Default to safe action (alert only)                 │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Interfaces:**

```typescript
// src/trust/types.ts

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

interface ActionRequest {
  id: string;
  action: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason: string;
  context: {
    protocol?: string;
    threatAnalysis?: ThreatAnalysis;
    estimatedImpact?: string;
  };
  createdAt: string;
}

interface ApprovalRequest extends ActionRequest {
  status: ApprovalStatus;
  channel: 'telegram' | 'whatsapp' | 'web';
  userId: string;
  messageId?: string;
  timeoutMs: number;
  respondedAt?: string;
  respondedBy?: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approved: boolean;
  approvedBy?: string;
  executionResult: 'success' | 'failure';
  error?: string;
}
```

---

## Data Flow

### Normal Monitoring Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  CRON    │───▶│ FETCH    │───▶│ DETECT   │───▶│ NO       │───▶│  SLEEP   │
│ TRIGGER  │    │ SNAPSHOT │    │ ANOMALY  │    │ ANOMALY  │    │ 5 MIN    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                                      │
                                                                      ▼
                                                               (repeat loop)
```

### Threat Detection Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  CRON    │───▶│ FETCH    │───▶│ DETECT   │───▶│ ANOMALY  │
│ TRIGGER  │    │ SNAPSHOT │    │ ANOMALY  │    │ FOUND    │
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                      │
                                                      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ CONTINUE │◀───│ MONITOR  │◀───│  NONE    │◀───│ GEMINI 3 │
│MONITORING│    │  ONLY    │    │ THREAT   │    │ ANALYZE  │
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                      │
                                               threat detected
                                                      │
                                                      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ EXECUTE  │◀───│ APPROVED │◀───│  WAIT    │◀───│ REQUEST  │
│ ACTION   │    │          │    │ RESPONSE │    │ APPROVAL │
└────┬─────┘    └──────────┘    └──────────┘    └──────────┘
     │                               │
     │                               ▼
     │          ┌──────────┐    ┌──────────┐
     │          │ REJECTED │◀───│ TIMEOUT  │
     │          │ OR       │    │          │
     │          │ TIMEOUT  │    │          │
     │          └────┬─────┘    └──────────┘
     │               │
     ▼               ▼
┌──────────┐    ┌──────────┐
│ NOTIFY   │    │ LOG +    │
│ SUCCESS  │    │ CONTINUE │
└──────────┘    └──────────┘
```

---

## File Structure

```
src/
├── triggers/                    # Layer 1: Event Triggers
│   ├── types.ts                 # Trigger interfaces
│   ├── cron.ts                  # Cron-based triggers
│   ├── evm.ts                   # EVM event listeners
│   ├── price.ts                 # Price threshold monitors
│   └── dispatcher.ts            # Routes triggers to handlers
│
├── defi/                        # Layer 2: Protocol Monitors
│   ├── types.ts                 # Protocol interfaces
│   ├── registry.ts              # Protocol adapter registry
│   ├── adapters/
│   │   ├── uniswap.ts          # Uniswap V4 adapter
│   │   ├── aave.ts             # Aave V3 adapter (future)
│   │   └── base.ts             # Base adapter class
│   └── aggregator.ts            # Multi-protocol aggregation
│
├── sentinel/                    # Layer 3: Analysis Engine
│   ├── types.ts                 # Analysis interfaces
│   ├── rules.ts                 # Rule-based detection
│   ├── patterns.ts              # Known exploit patterns
│   ├── analyzer.ts              # Gemini 3 threat analysis
│   └── monitor.ts               # Main sentinel loop
│
├── trust/                       # Layer 4: Trust Controls
│   ├── types.ts                 # Trust interfaces
│   ├── classifier.ts            # Action risk classification
│   ├── approvals.ts             # Approval request management
│   ├── executor.ts              # Approved action execution
│   └── audit.ts                 # Audit trail logging
│
├── marathon/                    # Existing: Core Execution
│   ├── service.ts              ✓ Marathon lifecycle
│   ├── executor.ts             ✓ Milestone execution
│   ├── planner.ts              ✓ Ultra thinking planning
│   └── types.ts                ✓ Marathon types
│
├── channels/                    # Existing: Notifications
│   ├── telegram/
│   │   └── adapter.ts          ✓ + Add inline buttons
│   └── ...
│
├── ai/
│   ├── gemini.ts               ✓ Gemini 3 client
│   └── tools.ts                ✓ + Add sentinel tools
│
└── cre/                         # Chainlink Integration
    ├── workflow.ts              # CRE workflow definitions
    └── actions.ts               # Onchain action execution
```

---

## Integration Points

### 1. Marathon Integration

Sentinel runs AS a Marathon, inheriting:
- Multi-day execution
- Checkpoints and recovery
- Thought Signatures
- Notification system

```typescript
// src/sentinel/monitor.ts

class SentinelMonitor {
  private marathon: MarathonService;

  async start(config: SentinelConfig): Promise<string> {
    // Create a Marathon for continuous monitoring
    return this.marathon.start(
      `Monitor ${config.protocols.map(p => p.name).join(', ')}`,
      this.agent,
      this.apiKey,
      {
        type: 'sentinel',  // New marathon type
        continuous: true,   // Doesn't end after milestones
        config,
      }
    );
  }
}
```

### 2. Executor Integration

Trust controls wrap the existing tool executor:

```typescript
// src/marathon/executor.ts (modified)

private async executeToolWithApproval(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Classify risk
  const risk = this.trustControls.classifyRisk(tool, args);

  // Check if approval needed
  if (risk.requiresApproval) {
    const approved = await this.trustControls.requestApproval({
      action: tool,
      args,
      riskLevel: risk.level,
      reason: risk.reason,
    });

    if (!approved) {
      return { success: false, output: 'Action rejected by user' };
    }
  }

  // Execute via existing tool executor
  return this.toolExecutor.execute(tool, args);
}
```

### 3. Telegram Integration

Add inline keyboard buttons to existing adapter:

```typescript
// src/channels/telegram/adapter.ts (modified)

import { InlineKeyboard } from 'grammy';

export async function sendApprovalRequest(
  chatId: string,
  request: ApprovalRequest
): Promise<string> {
  const keyboard = new InlineKeyboard()
    .text('✅ Approve', `approve:${request.id}`)
    .text('❌ Reject', `reject:${request.id}`)
    .row()
    .text('📊 Details', `details:${request.id}`);

  const message = formatApprovalMessage(request);

  const sent = await bot.api.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });

  return sent.message_id.toString();
}

// Handle callbacks
bot.callbackQuery(/^approve:(.+)$/, handleApprove);
bot.callbackQuery(/^reject:(.+)$/, handleReject);
bot.callbackQuery(/^details:(.+)$/, handleDetails);
```

---

## State Management

### Sentinel State

```typescript
interface SentinelState {
  id: string;
  marathonId: string;           // Links to parent Marathon
  status: 'active' | 'paused' | 'stopped';
  startedAt: string;

  // Configuration
  config: SentinelConfig;

  // Runtime
  lastCheck: string;
  checksPerformed: number;
  anomaliesDetected: number;
  actionsRequested: number;
  actionsApproved: number;
  actionsRejected: number;

  // Pending approvals
  pendingApprovals: ApprovalRequest[];

  // Recent activity
  recentAnalyses: ThreatAnalysis[];  // Last 10
  auditLog: AuditEntry[];            // Last 100
}
```

### State Persistence

```
~/.wispy/
├── marathon/
│   ├── {marathon-id}.json       # Marathon state
│   └── ...
├── sentinel/
│   ├── {sentinel-id}.json       # Sentinel state
│   ├── audit/
│   │   └── {date}.jsonl         # Daily audit logs
│   └── analyses/
│       └── {id}.json            # Threat analyses
└── config.yaml                  # User configuration
```

---

## API Contracts

### Sentinel CLI Commands

```bash
# Start monitoring
wispy sentinel start --protocols uniswap:0x... --notify telegram

# Check status
wispy sentinel status

# Pause monitoring
wispy sentinel pause

# Resume monitoring
wispy sentinel resume

# View recent analyses
wispy sentinel analyses --limit 10

# View audit log
wispy sentinel audit --date 2026-02-01
```

### Telegram Commands

```
/sentinel start uniswap:0x...  - Start monitoring
/sentinel stop                  - Stop monitoring
/sentinel status               - Current status
/sentinel protocols            - List monitored protocols
/history                       - Recent analyses
```

### REST API (via existing web server)

```
GET  /api/sentinel/status
POST /api/sentinel/start       { protocols: [...], config: {...} }
POST /api/sentinel/stop
GET  /api/sentinel/analyses
GET  /api/sentinel/audit
POST /api/sentinel/approve/:id
POST /api/sentinel/reject/:id
```

---

## Error Handling

### Retry Strategy

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: [429, 500, 502, 503, 504],
};
```

### Failure Modes

| Failure | Behavior |
|---------|----------|
| API rate limit | Exponential backoff, continue |
| Network error | Retry 3x, then alert user |
| Gemini 3 error | Fallback to rule-based only |
| Protocol unreachable | Skip, try again next cycle |
| Approval timeout | Default to safe action (no execute) |

### Recovery

- Marathon checkpoints enable recovery from crashes
- Sentinel state persisted after each check
- Audit log survives restarts

---

## Security Considerations

### Action Boundaries

```typescript
// Actions that NEVER execute without approval
const ALWAYS_APPROVE = [
  'wallet_pay',
  'wallet_transfer',
  'contract_call',
];

// Actions that auto-approve
const AUTO_APPROVE = [
  'file_read',
  'web_fetch',
  'memory_search',
];
```

### Secrets Management

- API keys in environment variables
- Wallet keys encrypted with user password
- No secrets logged to audit trail

---

## Performance

### Targets

| Metric | Target |
|--------|--------|
| Check interval | 5 minutes |
| Snapshot fetch | < 2 seconds |
| Rule detection | < 100ms |
| Gemini analysis | < 10 seconds |
| Approval roundtrip | < 30 seconds |
| Memory usage | < 200MB |

### Optimization

- Cache historical data (1 hour TTL)
- Batch subgraph queries
- Skip Gemini for clearly benign states
- Lazy load protocol adapters

---

## Testing Strategy

### Unit Tests
- Rule detection accuracy
- Risk classification correctness
- Approval flow logic

### Integration Tests
- Subgraph query success
- Telegram message delivery
- End-to-end approval flow

### Simulation
- Mock protocol data with anomalies
- Verify correct threat detection
- Time approval flows

---

## Deployment

### HackMoney (Feb 8)
- Uniswap adapter only
- Telegram notifications
- Basic trust controls

### Gemini (Feb 10)
- Same as HackMoney
- Emphasis on Marathon Mode
- Add demo video

### Chainlink (Mar 1)
- Add CRE triggers
- Add onchain actions
- x402 payment integration
