# AssetPilot

AssetPilot is an onchain-verifiable risk guard for AI trading agents on Perpl / Monad testnet.

AssetPilot originated as a policy-controlled asset execution prototype and has been narrowed to one production demo path:

```text
Perpl Data
  -> Analytics
  -> Wallet Risk
  -> Optional User Policy Commitment
  -> Agent Strategy
  -> Deterministic Review
  -> Trade Guard
  -> Optional Perpl Testnet Execution
  -> Application Receipt
  -> User-signed Onchain Receipt Anchoring
```

## Perpl Scope

AssetPilot integrates:

- Perpl public REST for context, markets, ticker, funding, candles, and order book snapshots.
- Perpl signed read REST for wallet, positions, orders, fills, account history, order history, position history, and portfolio curves.
- Perpl public market-data WebSocket for realtime market state, funding, order book, and heartbeat updates.
- Protocol and market analytics.
- Wallet risk scoring and deterministic risk simulation.
- Perpl Agent workflow for strategy generation, deterministic review, and dry-run execution descriptors.
- Trade Guard for user confirmation, execution intent creation, optional testnet submission, reconciliation, and audit receipts.
- Application-level JSONL receipts with deterministic hashes and hash-chain verification.
- Optional user-signed policy hash commitment through `PolicyCommitment` on Monad testnet.
- Optional user-signed receipt hash anchoring through `ReceiptAnchor` on Monad testnet.

## Safety Boundary

Perpl execution is guarded in the backend before submission:

- Trading is disabled by default.
- Read keys and trade keys are separate.
- Testnet execution requires `PERPL_TRADING_ENABLED=true`.
- The browser never receives Perpl API secrets, signatures, or full request headers.
- MetaMask is used only for optional `PolicyCommitment` and `ReceiptAnchor` proof transactions.
- The current product does not handle withdrawals or transfers.
- Policy commitment is not onchain policy enforcement; it proves the user committed to a policy hash before or around analysis.
- Full policy JSON remains in application-layer workflow and receipt data, not in the `PolicyCommitment` contract.
- Receipt anchoring is not onchain policy enforcement.
- Anchor transaction hashes are not Perpl order IDs.
- Full receipt JSON remains offchain in the application-layer JSONL store and frontend exports.

Every Perpl receipt keeps these explicit facts:

```json
{
  "receiptLayer": "application",
  "policyEnforcement": "backend_pre_submission",
  "onchainEnforced": false,
  "onchainAnchored": false
}
```

When a user anchors a receipt hash, AssetPilot appends a separate `anchor_confirmation` receipt. The original receipt is not mutated, so its hash-chain verification remains stable.

## Routes

Frontend dashboard routes:

- `/overview`
- `/markets`
- `/markets/[marketId]`
- `/wallet`
- `/trade-guard`
- `/receipts`

Backend API groups:

- `/api/perpl/health`
- `/api/perpl/context`
- `/api/perpl/markets`
- `/api/perpl/wallet`
- `/api/perpl/positions`
- `/api/perpl/orders`
- `/api/perpl/fills`
- `/api/perpl/overview`
- `/api/perpl/markets/:marketId`
- `/api/perpl/risk`
- `POST /api/perpl/policy/hash`
- `/api/perpl/agent/run`
- `/api/perpl/trading/*`
- `/api/perpl/execution/intents/*`
- `/api/perpl/receipts/*`
- `GET /api/perpl/receipts/:receiptId/anchor-status`
- `POST /api/perpl/receipts/:receiptId/anchor`
- `/api/perpl/realtime/*`
- `/api/system/status`

## Environment

Backend Perpl variables:

```bash
PERPL_API_URL=https://testnet.perpl.xyz/api
PERPL_WS_URL=wss://testnet.perpl.xyz
PERPL_CHAIN_ID=10143
PERPL_RPC_URL=https://testnet-rpc.monad.xyz
PERPL_EXCHANGE_ADDRESS=0x1964c32f0be608e7d29302aff5e61268e72080cc
PERPL_COLLATERAL_TOKEN=0xdf5b718d8fcc173335185a2a1513ee8151e3c027
PERPL_READ_API_KEY=
PERPL_READ_API_KEY_SECRET=
PERPL_TRADE_API_KEY=
PERPL_TRADE_API_KEY_SECRET=
PERPL_TRADING_ENABLED=false
```

No Perpl key belongs in frontend or `NEXT_PUBLIC_*` variables.

Frontend receipt anchoring variables:

```bash
NEXT_PUBLIC_ANCHORING_ENABLED=false
NEXT_PUBLIC_ANCHOR_CHAIN_ID=10143
NEXT_PUBLIC_ANCHOR_CHAIN_NAME=Monad Testnet
NEXT_PUBLIC_ANCHOR_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_RECEIPT_ANCHOR_ADDRESS=
NEXT_PUBLIC_POLICY_COMMITMENT_ENABLED=false
NEXT_PUBLIC_POLICY_COMMITMENT_ADDRESS=
```

## Verification

Backend:

```bash
cd backend
npm test
npm run build
npm run perpl:check
npm run perpl:analytics-check
LLM_API_KEY= npm run perpl:agent-check
npm run perpl:trade-check
npm run perpl:receipt-check
npm run perpl:realtime-check
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

Contracts:

```bash
cd /Users/quanpiao/project/AssetPilot
forge test
```

If Foundry is installed, `forge test` verifies the standalone `ReceiptAnchor` and `PolicyCommitment` contracts. Perpl execution remains routed through backend guarded testnet submission and application-level receipts.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/PERPL_DATA_SOURCES.md`
- `docs/RISK_METHODOLOGY.md`
- `docs/SECURITY.md`
- `docs/DEMO_SCRIPT.md`
- `docs/BOUNTY_CHECKLIST.md`
