# Wispy: The Problem We Solve

---

## THE PROBLEM (In Plain English)

### Current AI Agents Are Broken

| Problem | What Happens Today |
|---------|-------------------|
| **No Memory** | Chat ends, AI forgets everything. Start over tomorrow. |
| **No Money** | AI can't pay for premium APIs, data, or services. Needs human for every transaction. |
| **No Identity** | Anyone can pretend to be an AI agent. No way to verify who you're talking to. |
| **No Autonomy** | Can't work overnight. Can't handle multi-day projects. |
| **No Communication** | AI agents can't talk to other AI agents. Isolated silos. |

### Real-World Impact

**Scenario:** You want an AI to research competitors, gather market data, and produce a report.

**Today's Reality:**
1. You give the task
2. AI researches free sources only (can't pay for premium data)
3. You go to sleep
4. AI "forgets" everything
5. Next morning: start over
6. Repeat for days
7. Final report: shallow, incomplete

**With Wispy:**
1. You give the task via Telegram
2. AI plans the multi-day project
3. AI pays for premium data (x402) - you set the budget
4. You go to sleep - AI keeps working
5. Wake up to progress notifications
6. AI verifies its own work at each step
7. Final report: comprehensive, with premium data, citations

---

## WHAT WISPY SOLVES

### 1. Marathon Mode - "AI That Works While You Sleep"

**The Problem:** AI agents are stateless. One conversation, then forgotten.

**Our Solution:**
- Multi-day autonomous execution
- Milestone planning with verification
- Checkpoint/resume capability
- Self-recovery from failures
- Progress notifications to your phone

**How It Works:**
```
User: "Research African DePIN market and create investment report"
         ↓
Wispy Plans (24K thinking tokens):
  Milestone 1: Identify key players
  Milestone 2: Gather financial data
  Milestone 3: Analyze market trends
  Milestone 4: Write report
  Milestone 5: Verify citations
         ↓
Autonomous Execution (hours/days)
         ↓
Telegram Notifications on Progress
         ↓
Final Report Delivered
```

---

### 2. x402 Payments - "AI With a Wallet"

**The Problem:** AI can't access paid services. Stuck with free, low-quality data.

**Our Solution:**
- Automatic HTTP 402 handling
- USDC payments on Base
- Configurable spending limits
- Trust Controller approval
- Full transaction audit trail

**How It Works:**
```
AI: Fetches https://api.crunchbase.com/data
API: Returns HTTP 402 - Payment Required ($0.50)
         ↓
Wispy Trust Controller: Check budget? ✓
         ↓
Wispy: Pays $0.50 USDC automatically
         ↓
API: Returns premium data
         ↓
AI: Continues task with better data
```

---

### 3. ERC-8004 Identity - "AI You Can Trust"

**The Problem:** No way to verify an AI agent's identity. Anyone can pretend.

**Our Solution:**
- On-chain agent registration
- Verifiable identity (not just a name)
- Reputation system
- Trust scoring

**How It Works:**
```
Other Service: "Are you really Wispy?"
         ↓
Wispy: "Check my registration on Base"
         ↓
Contract: Agent #1 = 0xCcc42F646ad1AB9cDf8868677E5b4FB6F20D89B6
         ↓
Other Service: "Verified. Reputation score: 85. Trusted."
```

---

### 4. A2A Protocol - "AI Talking to AI"

**The Problem:** AI agents are isolated. Can't collaborate or delegate.

**Our Solution:**
- Agent discovery protocol
- Task delegation
- Secure message signing
- Capability matching

**How It Works:**
```
Wispy: "I need financial analysis"
         ↓
Discovers: FinanceBot (via /.well-known/agent.json)
         ↓
Wispy → FinanceBot: "Analyze this dataset"
         ↓
FinanceBot: Returns analysis
         ↓
Wispy: Incorporates into report
```

---

### 5. Telegram Integration - "Control From Your Phone"

**The Problem:** AI agents require laptop/desktop. Can't manage on the go.

**Our Solution:**
- Full control via Telegram
- Start/pause/resume marathons
- Real-time progress notifications
- Approval buttons for sensitive actions

**Commands:**
```
/marathon Build a React dashboard    → Start autonomous task
/status                              → Check progress
/pause                               → Pause execution
/resume                              → Continue
/abort                               → Stop
/approvals                           → See pending trust requests
```

---

## THE COMPLETE PICTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER EXPERIENCE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   📱 TELEGRAM                    💻 WEB DASHBOARD                   │
│   ─────────────                  ──────────────────                  │
│   • Start marathon               • Visual progress                  │
│   • Get notifications            • Cost tracking                    │
│   • Approve payments             • Artifact viewer                  │
│   • Control remotely             • Full logs                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        WISPY CORE                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   🧠 MARATHON ENGINE              💰 PAYMENT ENGINE                 │
│   • Gemini 2.5 Pro               • x402 Protocol                   │
│   • 24K thinking budget          • USDC on Base                    │
│   • Milestone planning           • Budget controls                  │
│   • Self-verification            • Audit trail                      │
│                                                                      │
│   🪪 IDENTITY ENGINE              🤝 COMMUNICATION ENGINE           │
│   • ERC-8004 Registry            • A2A Protocol                    │
│   • On-chain registration        • Agent discovery                  │
│   • Reputation system            • Task delegation                  │
│   • Trust scoring                • Message signing                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BLOCKCHAIN LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Base Sepolia (Coinbase L2)                                        │
│   • Agent Registry: 0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7     │
│   • Wallet: 0xCcc42F646ad1AB9cDf8868677E5b4FB6F20D89B6             │
│   • Payments: USDC via CDP                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## DEMO SHOWCASE ORDER

For the hackathon, show these in order of "wow factor":

### 1. Telegram Control (Immediate Wow)
- Show phone with Telegram
- Type `/marathon Research AI startups in Kenya`
- Show planning happening
- Receive notification

### 2. Marathon Execution (Core Value)
- Show terminal with agent working
- Milestones completing
- Self-verification
- Recovery from a simulated error

### 3. x402 Payment (Money Moment)
- Agent encounters paid API
- Show HTTP 402
- Show automatic payment
- Show BaseScan transaction

### 4. ERC-8004 Identity (Trust)
- Show agent.json
- Show contract on BaseScan
- Explain verifiable identity

### 5. A2A Protocol (Future Vision)
- Show agent card
- Explain agent-to-agent communication
- "This is how AI agents will collaborate"

---

## ONE-SENTENCE SUMMARIES

**For Google Hackathon:**
> "Wispy uses Gemini 2.5's thinking mode to execute multi-day tasks autonomously, with Telegram notifications and self-recovery."

**For Chainlink Hackathon:**
> "Wispy is the first AI agent with automatic crypto payments and on-chain verifiable identity, running trustlessly on Base."

**For ETHGlobal:**
> "Wispy is complete infrastructure for the AI agent economy - agents that think, pay, prove identity, and communicate."

---

## WHY WE WIN

| Competitor | What They Have | What Wispy Has |
|------------|----------------|----------------|
| ChatGPT | Single conversation | Multi-day marathon |
| AutoGPT | Loops until error | Self-recovery + verification |
| AgentGPT | Web interface | Telegram + mobile control |
| LangChain | Framework only | Complete platform |
| Most hackathon projects | 1 protocol | 4 protocols integrated |

**Our Unfair Advantage:**
- Real deployed contract (not mock)
- Real working code (not slides)
- Real Telegram integration (not CLI only)
- Real payments capability (not simulated)
- Real identity verification (on-chain)
