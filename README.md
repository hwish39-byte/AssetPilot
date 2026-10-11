# AssetPilot

**Policy-controlled AI portfolio execution for tokenized assets.**

AssetPilot is a Web3 AI portfolio assistant that lets users describe portfolio goals in natural language, then uses specialized AI agents and smart contracts to generate, review, execute, or refuse portfolio strategies under user-defined policies.

The MVP uses mock tokenized assets:

- `mNVDA`
- `mAAPL`
- `mSPY`
- `USDC`

The current Perpl testnet track adds a second, explicitly separated flow for Monad testnet perpetuals:

- Public Perpl REST context, ticker, funding, candles, and order book ingestion.
- Public Perpl market-data WebSocket streaming through backend SSE.
- Signed read-only REST for wallet, positions, orders, fills, history, and portfolio once read keys are configured.
- Deterministic Perpl risk analysis and dry-run agent review.
- Optional backend-held trade key execution for approved reduce-only/cancel flows.
- Application-layer immutable receipts for risk review, user confirmation, execution intent, submission, updates, finalization, and reconciliation.

Perpl testnet orders do not currently pass through `PolicyVault`, `StrategyExecutor`, or `ReceiptRegistry`. Perpl receipts are marked `receiptLayer: "application"`, `policyEnforcement: "backend_pre_submission"`, `onchainEnforced: false`, and `onchainAnchored: false`.

## What It Does

AssetPilot helps users safely delegate tokenized portfolio actions to AI.

Example user goal:

> Help me reduce AI stock concentration risk. Use at most 500 USDC, only trade mNVDA, mAAPL, mSPY, and USDC, do not buy mTSLA, and keep slippage below 1%.

AssetPilot will:

1. Analyze the user's portfolio.
2. Generate a structured strategy JSON.
3. Review the strategy with a Risk Agent.
4. Ask the user to create/sign an execution policy.
5. Enforce whitelist, blacklist, spend, expiry, and slippage constraints onchain.
6. Execute valid strategies or refuse invalid ones.
7. Show a clear before/after portfolio comparison.
8. Record execution or refusal receipts.

## Why It Matters

Most AI trading products focus on what the AI wants to trade.

AssetPilot focuses on what the AI is allowed to do.

It is not an AI trading bot. It is a policy-controlled execution layer for AI-assisted portfolio management.

## Core Flow

```text
User Goal
  ↓
Analyst Agent
  ↓
Strategy Agent
  ↓
Risk Agent
  ↓
User Policy
  ↓
Smart Contract Checks
  ↓
Execution or Refusal
  ↓
Receipt
```

## Perpl Testnet Flow

```text
Perpl REST + Public Market WebSocket
  ↓
Risk Engine
  ↓
Deterministic Agent Review
  ↓
Application Receipt
  ↓
User Confirmation
  ↓
Backend Trade Key
  ↓
Perpl Testnet
  ↓
Receipt Reconciliation
```

Public market realtime uses `/ws/v1/market-data` only. Private wallet, risk, and trade state remain on signed REST/polling. The UI labels data as Live, Reconnecting, REST fallback, Stale, or Unavailable so polling data is not presented as live.

## Perpl Commands

Backend:

```bash
cd backend
npm test
npm run build
npm run perpl:check
npm run perpl:analytics-check
npm run perpl:agent-check
npm run perpl:trade-check
npm run perpl:receipt-check
npm run perpl:realtime-check
```

Frontend:

```bash
cd frontend
npm run build
```

`PERPL_READ_API_KEY` and `PERPL_READ_API_KEY_SECRET` unlock private read endpoints. `PERPL_TRADE_API_KEY`, `PERPL_TRADE_API_KEY_SECRET`, and `PERPL_TRADING_ENABLED=true` are additionally required for testnet execution. No Perpl key belongs in frontend or `NEXT_PUBLIC_*` variables.

See `docs/ARCHITECTURE.md`, `docs/PERPL_DATA_SOURCES.md`, `docs/RISK_METHODOLOGY.md`, `docs/SECURITY.md`, `docs/DEMO_SCRIPT.md`, and `docs/BOUNTY_CHECKLIST.md` for the Perpl delivery notes.

## Four-Agent Design

### Analyst Agent

Analyzes the current portfolio:

- Risk score.
- Asset concentration.
- AI/tech exposure.
- Cash buffer.
- Liquidity risk.

### Strategy Agent

Converts natural language goals into structured strategy JSON.

### Risk Agent

Reviews whether the strategy is safe and aligned with user constraints.

### Execution Agent

Submits approved structured actions to the smart contracts. It does not bypass user policies or contract checks.

## Smart Contracts

The MVP contract system includes:

- `MockERC20`: mock tokenized assets.
- `MockPriceOracle`: mock prices and market snapshots.
- `MockAMM`: simulated swaps and slippage.
- `PolicyVault`: user-defined execution policies.
- `StrategyExecutor`: policy checks and execution/refusal logic.
- `ReceiptRegistry`: execution and refusal receipts.

## Policy Enforcement

AssetPilot enforces policies onchain.

Policies include:

- Allowed assets.
- Blocked assets.
- Maximum total spend.
- Maximum single trade size.
- Maximum slippage.
- Expiration time.
- Required simulation flag.

Whitelist and blacklist checks are contract-level checks, not frontend warnings.

## Demo Scenarios

### Successful Rebalance

Before:

| Asset | Weight |
| --- | --- |
| mNVDA | 52% |
| mAAPL | 18% |
| mSPY | 22% |
| USDC | 8% |

After:

| Asset | Weight |
| --- | --- |
| mNVDA | 35% |
| mAAPL | 18% |
| mSPY | 32% |
| USDC | 15% |

Risk score:

```text
82 → 61
```

### Refused Trade

User policy:

```text
Allowed: mNVDA, mAAPL, mSPY, USDC
Blocked: mTSLA
```

Agent attempts to buy `mTSLA`.

Result:

```text
Refused: BUY_TOKEN_NOT_ALLOWED
```

A refusal receipt is recorded.

## Strategy JSON Example

```json
{
  "goal": "Reduce AI sector concentration",
  "marketSnapshotHash": "0xabc",
  "actions": [
    {
      "actionType": "SELL",
      "sellToken": "mNVDA",
      "buyToken": "USDC",
      "sellAmountUsd": 300,
      "expectedBuyAmount": 300,
      "minBuyAmount": 297
    },
    {
      "actionType": "BUY",
      "sellToken": "USDC",
      "buyToken": "mSPY",
      "sellAmountUsd": 200,
      "expectedBuyAmount": 0.36,
      "minBuyAmount": 0.3564
    }
  ],
  "expectedImpact": {
    "riskScoreBefore": 82,
    "riskScoreAfter": 61,
    "aiExposureBefore": "76%",
    "aiExposureAfter": "58%"
  }
}
```

## Suggested Project Structure

```text
assetpilot/
  contracts/
  frontend/
  backend/
  docs/
```

## Recommended Tech Stack

Contracts:

- Solidity
- Foundry or Hardhat
- OpenZeppelin ERC20

Frontend:

- Next.js
- React
- Tailwind CSS
- wagmi
- viem
- Recharts

Backend:

- Node.js or Python
- LLM API
- Structured JSON output

Chain:

- Monad testnet

## MVP Checklist

- [ ] Connect wallet.
- [ ] Display mock tokenized portfolio.
- [ ] Enter natural language goal.
- [ ] Run Analyst Agent.
- [ ] Generate strategy JSON.
- [ ] Run Risk Agent.
- [ ] Create user policy.
- [ ] Enforce whitelist and blacklist onchain.
- [ ] Enforce max spend and slippage onchain.
- [ ] Execute valid strategy.
- [ ] Refuse invalid mTSLA strategy.
- [ ] Show before/after portfolio comparison.
- [ ] Show receipt history.

## Positioning

AssetPilot is not a stock prediction app and not a profit-maximizing AI trading bot.

It is a controlled execution layer for AI-assisted tokenized asset portfolios.

## Compliance Note

This project is a hackathon prototype and uses mock tokenized assets. It does not provide investment advice, does not execute real securities trades, and does not guarantee returns.
