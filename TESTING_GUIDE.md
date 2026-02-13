# Wispy Agentic Commerce -- Testing Guide

## What We Have

Wispy Agentic Commerce is an autonomous AI agent that pays for APIs by itself using x402 on SKALE. It covers all 5 tracks of the SF Agentic Commerce x402 Hackathon.

### Integration Tools (11 total)

| Tool | What It Does |
|------|-------------|
| `x402_pay_and_fetch` | Access paid APIs via x402 (HTTP 402, EIP-3009, Kobaru) |
| `x402_check_budget` | Check daily budget and spending |
| `x402_audit_trail` | Full payment audit trail |
| `ap2_purchase` | AP2 mandate flow (intent, cart, payment, receipt) |
| `ap2_get_receipts` | AP2 transaction records |
| `defi_research` | Multi-source market research |
| `defi_swap` | Risk-controlled token swap |
| `defi_trade_log` | Trade decisions with reason codes |
| `bite_encrypt_payment` | BITE v2 BLS threshold encryption |
| `bite_check_and_execute` | Conditional execution of encrypted tx |
| `bite_lifecycle_report` | Encrypted payment lifecycle |

### Architecture

```
src/integrations/agentic-commerce/
  config.ts                 SKALE chain config, USDC address, Algebra contracts
  index.ts                  Integration class (11 Gemini tools)
  x402/
    buyer.ts                x402 buyer (@x402/fetch, EIP-3009 signing)
    seller.ts               Mock x402 seller (@x402/express, Kobaru facilitator)
    tracker.ts              Spend tracking + audit reports
  ap2/
    mandates.ts             Intent/Cart/Payment mandates (EIP-191 signed)
    receipts.ts             Receipts + transaction records
    flow.ts                 AP2 orchestration engine
  defi/
    swap.ts                 Algebra DEX integration (SwapRouter on SKALE)
    risk-engine.ts          6-check risk controls + guardrails
  bite/
    encrypted-tx.ts         BITE v2 BLS encryption (@skalenetwork/bite)
    conditional.ts          Time-lock + delivery-proof conditions
  identity/
    erc8004.ts              ERC-8004 agent identity registration
  demo/
    runner.ts               Runs all 5 tracks in sequence
    preflight.ts            Balance checks before live run
    verify.ts               On-chain tx verification via RPC
    server.ts               Starts mock x402 seller services
    scenarios/
      track1-overall.ts     Track 1: End-to-end agent workflow
      track2-x402.ts        Track 2: Chained x402 calls with budget awareness
      track3-ap2.ts         Track 3: AP2 mandate chain + failure handling
      track4-defi.ts        Track 4: DeFi trading with risk engine
      track5-bite.ts        Track 5: BITE encrypted transactions
  tests/                    Unit tests (vitest)
```

### Network

| Detail | Value |
|--------|-------|
| Chain | SKALE BITE V2 Sandbox |
| Chain ID | 103698795 |
| RPC | https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox |
| USDC | 0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8 |
| Facilitator | https://gateway.kobaru.io (Kobaru) |
| Gas | Free (SKALE is gasless) |
| Agent Wallet | 0xcf6B036F5B201eEc1f3c3e9C08A0b0Ee8B30C32A |

### Verified On-Chain Transactions

| Transaction | Type | Block | Tx Hash |
|-------------|------|-------|---------|
| DeFi Trade 1 | USDC Transfer | 26842 | `0x39b126ab04c25ebbe0946f93383e4ca1d524747c171a32eacf808e4623da6752` |
| DeFi Trade 2 | USDC Transfer | 26843 | `0x122939784a55504d6fed18bfa5f99569a4f8644ff81621c33c85f3b77347cef8` |
| BITE Encrypted | BLS Encrypted | 26844 | `0xfe12466c68602e3c3ac3a41f7d85f9145a8be40a19de628a9dcb9ee572833d41` |
| BITE Time-Lock | BLS Encrypted | 26845 | `0x1c5f82afe320d8fbcd148a0102a5f27942122c40fd7f19431892041893a4e9b4` |

Explorer: https://base-sepolia-testnet-explorer.skalenodes.com:10032/tx/{hash}

---

## How to Test

### Prerequisites

```bash
cd C:\Users\Windows\Downloads\wispy
npm install
```

### Option 1: Run the Full Demo (All 5 Tracks)

**Simulation mode** (no wallet needed):
```bash
npx tsx src/integrations/agentic-commerce/demo/runner.ts
```

**LIVE mode** (real on-chain transactions):
```bash
set AGENT_PRIVATE_KEY=0xcedc5a67d97a15e76a88282a6b12d250044b21a5adb6d5d582e9a14e3d692d76
npx tsx src/integrations/agentic-commerce/demo/runner.ts
```

This runs all 5 tracks in sequence and produces formatted output.

### Option 2: Run Individual Tracks

```bash
set AGENT_PRIVATE_KEY=0xcedc5a67d97a15e76a88282a6b12d250044b21a5adb6d5d582e9a14e3d692d76

# Track 1: Overall Best Agent
npx tsx src/integrations/agentic-commerce/demo/scenarios/track1-overall.ts

# Track 2: x402 Tool Usage
npx tsx src/integrations/agentic-commerce/demo/scenarios/track2-x402.ts

# Track 3: AP2 Integration
npx tsx src/integrations/agentic-commerce/demo/scenarios/track3-ap2.ts

# Track 4: DeFi Agent
npx tsx src/integrations/agentic-commerce/demo/scenarios/track4-defi.ts

# Track 5: BITE Encryption
npx tsx src/integrations/agentic-commerce/demo/scenarios/track5-bite.ts
```

### Option 3: Wispy CLI (Interactive)

Talk to the agent naturally and it uses the commerce tools.

**Terminal 1** -- Start seller services:
```bash
cd C:\Users\Windows\Downloads\wispy
set AGENT_PRIVATE_KEY=0xcedc5a67d97a15e76a88282a6b12d250044b21a5adb6d5d582e9a14e3d692d76
npx tsx src/integrations/agentic-commerce/demo/server.ts
```

**Terminal 2** -- Start Wispy CLI:
```bash
cd C:\Users\Windows\Downloads\wispy
set AGENT_PRIVATE_KEY=0xcedc5a67d97a15e76a88282a6b12d250044b21a5adb6d5d582e9a14e3d692d76
npx wispy chat
```

Then talk to the agent:
- "Check my x402 budget"
- "Fetch weather data for Nairobi from http://localhost:4021/weather?city=Nairobi"
- "Buy sentiment analysis for Lagos markets from http://localhost:4022/analyze"
- "Research ETH market conditions"
- "Swap 0.001 USDC to ETH because market looks good"
- "Encrypt a payment to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28 with a 30-second time lock"

### Option 4: Telegram Bot (via Gateway)

**Terminal 1** -- Start seller services (same as above)

**Terminal 2** -- Start gateway:
```bash
cd C:\Users\Windows\Downloads\wispy
set AGENT_PRIVATE_KEY=0xcedc5a67d97a15e76a88282a6b12d250044b21a5adb6d5d582e9a14e3d692d76
npx wispy gateway
```

Then message your Telegram bot with the same prompts.

### Option 5: Run Tests

```bash
cd C:\Users\Windows\Downloads\wispy
npx vitest run src/integrations/agentic-commerce/tests/
```

---

## Config

The agentic-commerce integration is enabled in `~/.wispy/config.yaml`:

```yaml
integrations:
  - agentic-commerce
```

The integration requires `AGENT_PRIVATE_KEY` environment variable. Without it, the integration loads but fails to enable, and the agent works normally without commerce tools.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| AI Agent | Wispy (TypeScript, Gemini 2.5 Pro) |
| Blockchain | SKALE BITE V2 Sandbox (gasless, encrypted) |
| Payments | x402 protocol (EIP-3009, Kobaru facilitator) |
| Wallet | viem + @x402/evm |
| Authorization | AP2 protocol (Google mandate system) |
| Encryption | BITE v2 (@skalenetwork/bite, BLS threshold) |
| DeFi | Algebra DEX (Integral v1.2.2, SwapRouter) |
| Identity | ERC-8004 agent identity |
| Mock Services | Express.js + @x402/express |
| Tests | Vitest |

---

## Repos

| Repo | URL |
|------|-----|
| Hackathon fork | https://github.com/hausorlabs/wispy |
| Main repo | https://github.com/brn-mwai/wispy |
| npm | https://www.npmjs.com/package/wispy-ai |

---

## Team

| Name | Role | GitHub |
|------|------|--------|
| Brian Mwai | Lead Developer | [@brn-mwai](https://github.com/brn-mwai) |
| Joy C. Langat | Developer | [@JoyyCLangat](https://github.com/JoyyCLangat) |
