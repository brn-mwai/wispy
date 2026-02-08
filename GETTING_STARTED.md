# Getting Started with Wispy

> **The autonomous AI agent that thinks for days, pays for services, and proves its identity on-chain.**

---

## Quick Install (2 minutes)

```bash
# Install globally
npm install -g wispy-ai

# Run setup wizard
wispy setup

# Start chatting
wispy chat
```

That's it! You now have an autonomous AI agent.

---

## What Wispy Enables You To Do

### For Individuals

| Use Case | Command | What Happens |
|----------|---------|--------------|
| **Research Assistant** | `/marathon Research competitors in my industry` | Agent works for hours, delivers comprehensive report |
| **Code Generator** | `/marathon Build a React dashboard for my startup` | Creates complete working application |
| **Content Creator** | `/marathon Write a 10-part blog series on AI` | Produces full content calendar |
| **Data Analyst** | `/marathon Analyze sales data and create insights report` | Processes data, generates visualizations |
| **Personal Assistant** | `Summarize my emails from this week` | Quick AI responses |

### For Developers

| Capability | What It Enables |
|------------|-----------------|
| **SDK Integration** | Embed Wispy agent in your apps |
| **A2A Protocol** | Let your app discover and use AI agents |
| **x402 Payments** | Build apps where AI pays for premium APIs |
| **ERC-8004 Identity** | Verify AI agents on-chain |
| **Webhook Callbacks** | Get notified when tasks complete |

### For Businesses

| Solution | Description |
|----------|-------------|
| **Autonomous Operations** | AI agents that work 24/7 on business tasks |
| **Self-Service AI** | Customers interact with branded AI via Telegram/WhatsApp |
| **Research at Scale** | Deploy multiple agents for parallel research |
| **Cost-Controlled AI** | Set budgets, agents pay only what's approved |

---

## Installation Options

### Option 1: Global CLI (Recommended)

```bash
npm install -g wispy-ai
wispy setup
```

### Option 2: Project Dependency

```bash
npm install wispy-ai
npx wispy setup
```

### Option 3: From Source

```bash
git clone https://github.com/brn-mwai/wispy.git
cd wispy
npm install
npm run build
node bin/wispy.js setup
```

---

## Setup Wizard Walkthrough

When you run `wispy setup`, you'll configure:

### Step 1: AI Provider
```
Choose your AI provider:
1) Google Gemini (Recommended - Free tier available)
2) Vertex AI (Enterprise - requires GCP)
3) OpenAI (GPT-4)
```

### Step 2: API Key
```
Enter your Gemini API key:
→ Get one free at: https://aistudio.google.com/apikey
```

### Step 3: Channels
```
Enable communication channels:
[x] Terminal (always on)
[ ] Telegram - Control from phone
[ ] WhatsApp - Control from phone
[ ] Discord - Team collaboration
[ ] REST API - Programmatic access
```

### Step 4: Blockchain (Optional)
```
Enable blockchain features?
[ ] x402 Payments - Agent pays for premium APIs
[ ] ERC-8004 Identity - On-chain agent registration
[ ] Wallet Generation - Create agent wallet

Note: Requires Base Sepolia testnet ETH for gas
```

### Step 5: Confirmation
```
✓ Configuration saved to ~/.wispy/config.yaml
✓ Agent ready!

Run 'wispy chat' to start
Run 'wispy gateway' for full features
```

---

## First Commands to Try

### Basic Chat
```bash
wispy chat
> What can you help me with?
```

### Start a Marathon (Autonomous Task)
```bash
wispy chat
> /marathon Research the top 10 AI tools for startups
```

### Check Status
```bash
wispy chat
> /status
```

### Enable Telegram
```bash
wispy telegram enable YOUR_BOT_TOKEN
wispy gateway
```

---

## Configuration Files

After setup, Wispy creates:

```
~/.wispy/
├── config.yaml          # Main configuration
├── integrations.json    # API keys, wallet, contracts
├── device-identity.json # Unique device keys
├── memory/             # Conversation history
└── checkpoints/        # Marathon state
```

### config.yaml Example

```yaml
agent:
  name: my-wispy
  model: gemini-2.5-pro

marathon:
  thinkingLevel: ultra      # 24K token budget
  maxMilestones: 20
  checkpointInterval: 5

channels:
  telegram:
    enabled: true
    token: ${TELEGRAM_BOT_TOKEN}

x402:
  enabled: true
  maxSpendPerTask: 10.00    # USDC limit
  network: base-sepolia

erc8004:
  enabled: true
  autoRegister: true
```

---

## Deployment Options

### Local Development
```bash
wispy gateway
# Access at http://localhost:4001
```

### Docker
```dockerfile
FROM node:20-alpine
RUN npm install -g wispy-ai
COPY .env .env
CMD ["wispy", "gateway"]
```

```bash
docker build -t my-wispy .
docker run -p 4001:4001 my-wispy
```

### Cloud Platforms

#### Railway
```bash
# railway.json
{
  "build": { "builder": "nixpacks" },
  "deploy": { "startCommand": "wispy gateway" }
}
```

#### Render
```yaml
# render.yaml
services:
  - type: web
    name: wispy-agent
    env: node
    buildCommand: npm install -g wispy-ai
    startCommand: wispy gateway
```

#### Vercel (Serverless)
```javascript
// api/wispy.js
import { WispyAgent } from 'wispy-ai';

export default async function handler(req, res) {
  const agent = new WispyAgent();
  const result = await agent.chat(req.body.message);
  res.json(result);
}
```

---

## SDK Usage

### Basic Agent

```typescript
import { WispyAgent } from 'wispy-ai';

const agent = new WispyAgent({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.5-pro'
});

// Simple chat
const response = await agent.chat("What's the weather like?");
console.log(response.text);

// Marathon task
const marathon = await agent.marathon("Research AI trends");
marathon.on('milestone', (m) => console.log(`Done: ${m.title}`));
marathon.on('complete', (result) => console.log(result));
```

### With Payments (x402)

```typescript
import { WispyAgent, X402Client } from 'wispy-ai';

const agent = new WispyAgent({
  x402: {
    enabled: true,
    wallet: process.env.WALLET_PRIVATE_KEY,
    maxSpend: '5.00' // USDC
  }
});

// Agent will automatically pay for premium APIs
const data = await agent.fetch('https://api.crunchbase.com/v4/data');
```

### With Identity (ERC-8004)

```typescript
import { WispyAgent, ERC8004Client } from 'wispy-ai';

const agent = new WispyAgent({
  erc8004: {
    enabled: true,
    registry: '0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7'
  }
});

// Register agent on-chain
const agentId = await agent.register({
  name: 'My Agent',
  description: 'Autonomous research assistant'
});

// Verify another agent
const isValid = await agent.verify(otherAgentId);
```

### A2A Communication

```typescript
import { A2AClient } from 'wispy-ai';

// Discover another agent
const client = new A2AClient('https://other-agent.com');
const card = await client.discover();

// Delegate task
const result = await client.sendTask({
  message: 'Analyze this dataset',
  data: myData
});
```

---

## Environment Variables

Create `.env` file:

```env
# Required
GEMINI_API_KEY=your_gemini_key

# Optional: Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# Optional: Blockchain
WALLET_PRIVATE_KEY=your_wallet_key
CDP_API_KEY_ID=your_cdp_key
CDP_API_KEY_SECRET=your_cdp_secret

# Optional: Vertex AI (Enterprise)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_CLOUD_PROJECT=your-project-id
```

---

## Troubleshooting

### "API key not found"
```bash
# Set environment variable
export GEMINI_API_KEY=your_key

# Or add to .env file
echo "GEMINI_API_KEY=your_key" >> .env
```

### "Port already in use"
```bash
# Use different port
wispy gateway --port 4002
```

### "Telegram bot not responding"
```bash
# Check token is valid
wispy doctor

# Restart gateway
wispy gateway
```

### "Insufficient funds for gas"
```bash
# Get testnet ETH
# Visit: https://faucet.quicknode.com/base/sepolia
```

---

## Next Steps

1. **Join Community**: [Discord](https://discord.gg/wispy) | [Twitter](https://twitter.com/wispyai)
2. **Read Docs**: [Full Documentation](https://docs.wispy.ai)
3. **Contribute**: [GitHub](https://github.com/brn-mwai/wispy)
4. **Get Support**: [Issues](https://github.com/brn-mwai/wispy/issues)

---

## Example Projects

### Research Bot
```bash
wispy chat
> /marathon Research the electric vehicle market in Africa, identify top 5 opportunities, and create investment thesis
```

### Code Generator
```bash
wispy chat
> /marathon Build a Next.js SaaS boilerplate with authentication, payments, and dashboard
```

### Content Creator
```bash
wispy chat
> /marathon Create a 30-day social media content calendar for a tech startup
```

---

**Built by Brian Mwai** | **MIT License** | **Powered by Gemini**
