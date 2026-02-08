# Wispy Agentic Commerce Integration (x402)

**An AI agent that can spend money on the internet by itself.**

This Wispy integration enables autonomous agent commerce via the x402 protocol on SKALE's blockchain. The agent discovers paid APIs, decides whether they're worth paying for within a budget, pays with crypto, chains multiple paid calls, encrypts sensitive transactions, and produces a complete audit trail — all without human intervention.

Built for the **SF Agentic Commerce x402 Hackathon** (SKALE Labs, Feb 2026) — targeting all 5 tracks.

## Architecture

```
src/integrations/agentic-commerce/
├── index.ts                  # Integration class (11 tools)
├── config.ts                 # SKALE chain config, pricing
├── x402/
│   ├── buyer.ts              # x402 buyer client (@x402/fetch)
│   ├── seller.ts             # Mock x402 seller endpoints (@x402/express)
│   └── tracker.ts            # Per-call spend tracking + audit
├── ap2/
│   ├── mandates.ts           # Intent/Cart/Payment mandates
│   ├── receipts.ts           # Payment receipts + transaction records
│   └── flow.ts               # AP2 orchestration engine
├── defi/
│   ├── swap.ts               # Token swap on SKALE
│   └── risk-engine.ts        # Risk controls + guardrails
├── bite/
│   ├── encrypted-tx.ts       # BITE v2 encrypted transactions
│   └── conditional.ts        # Conditional execution logic
├── demo/
│   ├── server.ts             # Starts all mock services
│   ├── runner.ts             # Runs all 5 track demos
│   ├── verify.ts             # On-chain verification
│   └── scenarios/            # 5 track-specific demos
└── tests/                    # 46 tests (vitest)
```

## Quick Start

```bash
# 1. Install dependencies (from wispy root)
npm install

# 2. Set your agent wallet private key
export AGENT_PRIVATE_KEY=0x...your_private_key...

# 3. Start mock x402 services
npx tsx src/integrations/agentic-commerce/demo/server.ts

# 4. Run all 5 track demos
npx tsx src/integrations/agentic-commerce/demo/runner.ts

# 5. Run tests
npx vitest run src/integrations/agentic-commerce/tests/
```

## Track Coverage

| Track | Prize | What We Demonstrate | Status |
|-------|-------|---------------------|--------|
| 1. Overall Best Agent | $9,500 | End-to-end: discover → decide → pay → deliver | Done |
| 2. x402 Tool Usage | $7,000 | Chained x402 calls, budget awareness, spend logs | Done |
| 3. AP2 Integration | $7,000 | Intent → Cart → Payment → Receipt + failure handling | Done |
| 4. DeFi Agent | $3,000 | Multi-source research, risk engine, swap with guardrails | Done |
| 5. Encrypted Agents | $4,500 | BITE v2 encrypt → condition → execute lifecycle | Done |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENT_PRIVATE_KEY` | Yes | Hex private key for the agent wallet (EIP-3009 signing) |
| `SELLER_PRIVATE_KEY` | No | Hex private key for mock seller (auto-generated if not set) |

## Tools Provided

| Tool | Description |
|------|-------------|
| `x402_pay_and_fetch` | Access paid APIs via x402 protocol |
| `x402_check_budget` | Check daily budget and spending |
| `x402_audit_trail` | Full payment audit trail |
| `ap2_purchase` | AP2 mandate flow (intent → cart → payment → receipt) |
| `ap2_get_receipts` | AP2 transaction records |
| `defi_research` | Multi-source market research |
| `defi_swap` | Risk-controlled token swap |
| `defi_trade_log` | Trade decisions with reason codes |
| `bite_encrypt_payment` | BITE v2 threshold encryption |
| `bite_check_and_execute` | Conditional execution of encrypted tx |
| `bite_lifecycle_report` | Encrypted payment lifecycle |

## Network

- **Chain:** SKALE BITE V2 Sandbox
- **Chain ID:** 103698795
- **RPC:** https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox
- **USDC:** 0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8
- **Facilitator:** https://gateway.kobaru.io
- **Gas:** Free (SKALE is gasless)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| AI Agent | Wispy (TypeScript, Gemini LLM) |
| Blockchain | SKALE BITE V2 Sandbox |
| Payments | x402 protocol (EIP-3009) |
| Wallet | viem + @x402/evm |
| Authorization | AP2 protocol (Google) |
| Encryption | BITE v2 (@skalenetwork/bite) |
| Mock Services | Express.js + @x402/express |

Built by **Wispy AI** — [github.com/brn-mwai/wispy](https://github.com/brn-mwai/wispy)
