# Hackathon Submission Guide

## Submission Checklist

### All Hackathons
- [x] Working code
- [x] README with demo instructions
- [x] Contract deployed to Base Sepolia
- [x] GitHub repository
- [ ] Demo video (2-3 minutes)
- [ ] Devpost/submission form

---

## 1. Google DeepMind Gemini Hackathon

**Deadline:** February 10, 2026
**Prize:** $100,000+
**Track:** Marathon Agent

### Submission Title
```
Wispy: Multi-Day Autonomous AI Agent with Gemini 2.5 Pro Thinking Mode
```

### Short Description (300 chars)
```
Wispy is the first AI agent that thinks for days using Gemini 2.5 Pro's 24K token thinking budget. It plans multi-day tasks, self-verifies each milestone, auto-recovers from failures, and maintains context across sessions. Built for truly autonomous AI.
```

### Full Description
```markdown
## What it does
Wispy is an autonomous AI agent platform that enables multi-day task execution using Gemini 2.5 Pro's thinking capabilities. Unlike chatbots that forget context, Wispy can:

- **Plan complex tasks** using 24K token thinking budget
- **Execute autonomously** for hours or days
- **Self-verify** each milestone before proceeding
- **Auto-recover** from failures with alternative approaches
- **Checkpoint progress** for pause/resume capability

## How we built it
- **AI**: Gemini 2.5 Pro via Vertex AI with configurable thinking levels
- **Runtime**: TypeScript, Node.js
- **Architecture**: Marathon service with milestone planning, execution, and verification phases
- **Channels**: Telegram, WhatsApp, Discord for remote monitoring

## Gemini Features Used
1. **Thinking Levels**: Ultra (24K tokens) for planning, high for execution
2. **Function Calling**: Native tool execution
3. **Long Context**: Process entire codebases
4. **Vertex AI**: Enterprise-grade reliability

## What's next
- Gemini 3 integration when available
- Multi-agent orchestration
- Production deployment

## Try it
npm i -g wispy-ai && wispy setup
```

### Key Points to Emphasize
1. Marathon Mode = Direct response to hackathon track
2. Thinking budget management (128-24K tokens)
3. Self-verification and recovery
4. Real autonomous execution, not just chat

---

## 2. Chainlink Convergence Hackathon

**Deadline:** February 6 - March 1, 2026
**Prize:** $100,000+
**Track:** Trustless Agents / DeFi

### Submission Title
```
Wispy: Trustless AI Agent with x402 Payments and ERC-8004 On-Chain Identity
```

### Short Description (300 chars)
```
Wispy is an autonomous AI agent with built-in crypto payments (x402/USDC) and on-chain identity (ERC-8004). Agents can pay for services automatically, register verifiable identities, and build reputation - all trustlessly on Base.
```

### Full Description
```markdown
## What it does
Wispy creates trustless AI agents that can:

- **Pay for services automatically** using x402 protocol (USDC on Base)
- **Register on-chain identity** via ERC-8004 standard
- **Build verifiable reputation** through feedback registry
- **Communicate with other agents** via A2A protocol

## The Problem
AI agents need to transact in the real world. They need to:
1. Pay for premium APIs and data
2. Prove their identity to other services
3. Build trust over time

Current solutions require human approval for every transaction. Wispy solves this with autonomous, trustless infrastructure.

## Technical Implementation

### x402 Payments
- Automatic HTTP 402 handling
- USDC payments via Coinbase CDP
- Trust Controller for spending limits
- Full transaction logging

### ERC-8004 Identity
- Agent Registry: 0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7
- On-chain registration
- Reputation system
- Validation framework

### Blockchain
- Network: Base Sepolia
- Standard: ERC-8004 Trustless Agents
- Payment: x402 protocol

## What's next
- Mainnet deployment
- CRE workflow integration
- Cross-chain identity

## Links
- Contract: https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7
- GitHub: https://github.com/brn-mwai/wispy
```

### Key Points to Emphasize
1. Real deployed contract on Base
2. x402 protocol implementation
3. ERC-8004 standard compliance
4. Trustless = no human in the loop

---

## 3. ETHGlobal HackMoney 2026

**Deadline:** January 30 - February 11, 2026
**Prize:** $75,000+
**Track:** DeFi / Agent Infrastructure

### Submission Title
```
Wispy: Full-Stack Autonomous Agent Infrastructure with Payments and Identity
```

### Short Description (300 chars)
```
Wispy is complete infrastructure for autonomous AI agents: multi-day reasoning (Gemini), crypto payments (x402), on-chain identity (ERC-8004), and agent communication (A2A). The foundation for an AI agent economy.
```

### Full Description
```markdown
## What it does
Wispy is the infrastructure layer for autonomous AI agents, combining:

1. **Marathon Mode**: Multi-day autonomous task execution
2. **x402 Payments**: Agents that can spend crypto
3. **ERC-8004 Identity**: Verifiable on-chain registration
4. **A2A Protocol**: Agent-to-agent communication

## Why it matters
We're building the foundation for an AI agent economy where:
- Agents can earn and spend money
- Agents have verifiable identities
- Agents can hire other agents
- All interactions are trustless and on-chain

## Technical Stack
- AI: Gemini 2.5 Pro via Vertex AI
- Blockchain: Base (Coinbase L2)
- Payments: x402 protocol, USDC
- Identity: ERC-8004 standard
- Communication: Google A2A protocol

## Deployed Contracts
- Agent Registry: 0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7
- Network: Base Sepolia (chainId: 84532)

## How to use
npm i -g wispy-ai
wispy setup
wispy agent "Your autonomous task here"

## What's next
- Wispy SDK for developers
- Agent marketplace
- Mainnet deployment
- Revenue model for agents
```

### Key Points to Emphasize
1. Full-stack solution (not just one protocol)
2. Real working implementation
3. Foundation for agent economy
4. Multiple protocol integrations

---

## Video Submission Requirements

### Google Gemini
- Max: 3 minutes
- Focus: Marathon Mode + Gemini thinking
- Show: Planning, execution, recovery

### Chainlink
- Max: 5 minutes
- Focus: x402 + ERC-8004
- Show: Payment transaction, contract on BaseScan

### ETHGlobal
- Max: 3 minutes
- Focus: Full integration demo
- Show: All four protocols working together

---

## Post-Submission

1. **Share on Twitter/X**
   - Tag @GoogleAI, @chainlink, @ETHGlobal
   - Use hackathon hashtags
   - Include demo video clip

2. **Share in Discord**
   - Post in hackathon channels
   - Answer questions
   - Network with judges

3. **Prepare for judging**
   - Have live demo ready
   - Prepare answers to technical questions
   - Know your differentiation

---

## Quick Links

- **GitHub**: https://github.com/brn-mwai/wispy
- **npm**: https://npmjs.com/package/wispy-ai
- **Contract**: https://sepolia.basescan.org/address/0x158B236CC840FD3039a3Cf5D72AEfBF2550045C7
- **Wallet**: 0xCcc42F646ad1AB9cDf8868677E5b4FB6F20D89B6
