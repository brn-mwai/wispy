# Wispy Use Cases

> Real-world applications and what you can build with Wispy

---

## For Individuals

### 1. Research Assistant
**Problem:** Spending hours researching topics, gathering data, synthesizing reports.

**Solution:**
```
/marathon Research the electric vehicle market in Africa, identify top 5 investment opportunities, analyze competitors, and create a 10-page investment thesis
```

**What Wispy Does:**
- Plans 12-15 milestones automatically
- Searches the web for data
- Analyzes findings with AI reasoning
- Compiles comprehensive report
- Delivers via Telegram when done (even if it takes 6 hours)

---

### 2. Code Generator
**Problem:** Building apps from scratch is time-consuming.

**Solution:**
```
/marathon Build a React dashboard with user authentication, data visualization, and a REST API backend using Node.js
```

**What Wispy Does:**
- Creates project structure
- Writes frontend components
- Builds backend API
- Adds authentication logic
- Tests the code
- Provides setup instructions

---

### 3. Content Creator
**Problem:** Creating consistent content takes hours daily.

**Solution:**
```
/marathon Create a 30-day content calendar for a tech startup, including LinkedIn posts, Twitter threads, and blog outlines
```

**What Wispy Does:**
- Researches trending topics
- Creates posting schedule
- Writes all 30 days of content
- Optimizes for each platform
- Delivers organized calendar

---

### 4. Personal Learning
**Problem:** Learning new skills requires structured curriculum.

**Solution:**
```
/marathon Create a 12-week learning plan to become proficient in machine learning, with weekly goals, resources, and projects
```

**What Wispy Does:**
- Designs curriculum
- Finds best resources
- Creates weekly milestones
- Suggests hands-on projects
- Tracks your progress

---

## For Developers

### 1. SDK Integration

**Add AI capabilities to your app:**

```typescript
import { WispyAgent } from 'wispy-ai';

// Initialize agent
const agent = new WispyAgent({
  apiKey: process.env.GEMINI_API_KEY
});

// Simple chat
const response = await agent.chat("Explain React hooks");

// Autonomous task
const marathon = await agent.marathon("Build a user dashboard");
marathon.on('complete', (result) => {
  // Use generated code in your app
});
```

---

### 2. AI-Powered API

**Build services that use AI:**

```typescript
import express from 'express';
import { WispyAgent } from 'wispy-ai';

const app = express();
const agent = new WispyAgent();

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const result = await agent.chat(req.body.message);
  res.json({ response: result.text });
});

// Research endpoint
app.post('/api/research', async (req, res) => {
  const marathon = await agent.marathon(req.body.topic);
  res.json({ taskId: marathon.id });
});

// Status endpoint
app.get('/api/research/:id', async (req, res) => {
  const status = agent.getMarathonStatus(req.params.id);
  res.json(status);
});
```

---

### 3. Agent-to-Agent Communication

**Build multi-agent systems:**

```typescript
import { WispyAgent, A2AClient } from 'wispy-ai';

// Your main agent
const coordinator = new WispyAgent({ name: 'Coordinator' });

// Discover specialized agents
const researchAgent = new A2AClient('https://research-agent.example.com');
const codeAgent = new A2AClient('https://code-agent.example.com');

// Delegate tasks
const researchResult = await researchAgent.sendTask({
  message: 'Research competitor pricing'
});

const codeResult = await codeAgent.sendTask({
  message: 'Build pricing comparison UI',
  context: researchResult
});
```

---

### 4. Paid AI Services

**Build AI that pays for premium data:**

```typescript
import { WispyAgent } from 'wispy-ai';

const agent = new WispyAgent({
  x402: {
    enabled: true,
    walletKey: process.env.WALLET_KEY,
    maxSpend: '10.00' // USDC per task
  }
});

// Agent automatically pays for premium APIs
const task = await agent.marathon(
  "Get Crunchbase data on African fintechs and create investment report"
);

// When agent encounters paywall:
// 1. Detects HTTP 402
// 2. Checks budget ($10 limit)
// 3. Pays with USDC
// 4. Continues task
```

---

## For Businesses

### 1. Customer Support Bot

**Deploy AI support via Telegram/WhatsApp:**

```yaml
# config.yaml
agent:
  name: SupportBot
  persona: "Helpful customer support agent for TechCorp"

channels:
  telegram:
    enabled: true
    token: ${TELEGRAM_BOT_TOKEN}
  whatsapp:
    enabled: true

trust:
  requireApproval:
    - refund_request
    - account_deletion
```

**Result:** Customers chat with your branded AI agent, which can:
- Answer product questions
- Process simple requests
- Escalate complex issues to humans

---

### 2. Research Operations

**Scale research across multiple agents:**

```typescript
import { WispyAgent } from 'wispy-ai';

const topics = [
  'EV market in Kenya',
  'Fintech regulations in Nigeria',
  'Solar adoption in South Africa',
  'Agritech startups in Ghana'
];

// Launch parallel research
const agents = topics.map(topic => {
  const agent = new WispyAgent();
  return agent.marathon(`Research ${topic} and create market report`);
});

// Collect all results
const reports = await Promise.all(agents);
```

---

### 3. Automated Reporting

**Generate recurring reports:**

```typescript
import { WispyAgent, schedule } from 'wispy-ai';

const agent = new WispyAgent();

// Weekly market report
schedule.weekly('monday', 9, async () => {
  await agent.marathon(
    "Compile weekly market report: crypto prices, tech news, competitor updates"
  );
  // Report delivered to Telegram
});

// Daily social media digest
schedule.daily(8, async () => {
  await agent.marathon(
    "Summarize trending topics and suggest 3 social media posts"
  );
});
```

---

### 4. Document Processing

**Process and analyze documents:**

```typescript
import { WispyAgent } from 'wispy-ai';

const agent = new WispyAgent();

// Upload contract for analysis
const analysis = await agent.chat(
  "Analyze this contract for risks and summarize key terms",
  { attachments: ['./contract.pdf'] }
);

// Batch process invoices
const invoices = await agent.marathon(
  "Process all invoices in ./invoices folder, extract amounts, and create expense report"
);
```

---

## Unique Wispy Capabilities

### What Makes Wispy Different

| Capability | Traditional AI | Wispy |
|------------|----------------|-------|
| Task duration | One conversation | Multi-day marathon |
| Memory | Forgets after session | Checkpoints & resumes |
| Payments | Human approves each | Autonomous with budget |
| Identity | Anonymous | On-chain verifiable |
| Control | Desktop only | Telegram, WhatsApp, API |
| Multi-agent | Isolated | A2A communication |

---

### Marathon Mode Examples

| Task | Milestones | Typical Duration |
|------|------------|------------------|
| "Research AI trends" | 14 | 8-12 hours |
| "Build React app" | 8 | 4-6 hours |
| "Write blog series" | 12 | 6-10 hours |
| "Analyze competitors" | 10 | 5-8 hours |
| "Create business plan" | 16 | 12-18 hours |

---

### x402 Payment Use Cases

| Scenario | How It Works |
|----------|--------------|
| Premium API access | Agent pays $0.50 for Crunchbase query |
| Stock data | Agent pays $0.10 for real-time quotes |
| Research papers | Agent pays $2 for journal access |
| Image generation | Agent pays $0.02 per image |
| Compute resources | Agent pays for cloud GPU time |

---

### ERC-8004 Identity Use Cases

| Scenario | How It Works |
|----------|--------------|
| Agent verification | Service checks agent is registered on-chain |
| Reputation building | Agent accumulates feedback score |
| Trust thresholds | High-value tasks require 80+ reputation |
| Audit trail | All agent actions linked to on-chain ID |

---

## Getting Started

```bash
# Install
npm install -g wispy-ai

# Setup
wispy setup

# Run your first marathon
wispy chat
> /marathon Research the top 10 AI tools for productivity
```

---

**Built for:** Google Gemini Hackathon | Chainlink Convergence | ETHGlobal HackMoney

**By:** Brian Mwai
