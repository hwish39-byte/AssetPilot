# Demo Script

This walkthrough presents the current Perpl / Monad testnet MVP. The default demonstration uses public data, read-only account access, Agent dry-runs, and local receipt verification. Testnet order submission and wallet proof transactions are separate optional steps.

## 1. Prepare the environment

Use Node.js 22.15+ or 24 and npm. The market and trading clients need the runtime's global `WebSocket`. Public data requires access to the configured Perpl testnet. Account analysis additionally requires valid read credentials. No wallet or deployed contract is needed for the default flow.

From the repository root, start the backend:

```bash
cd backend
npm ci
cp -n .env.example .env
npm run dev
```

In a second terminal, also starting from the repository root:

```bash
cd frontend
npm ci
cp -n .env.example .env.local
npm run dev
```

`cp -n` preserves existing environment files. The frontend defaults to `http://localhost:3000`; the backend defaults to `http://localhost:8787`. Keep `NEXT_PUBLIC_API_BASE_URL` and `PERPL_ALLOWED_FRONTEND_ORIGINS` aligned if ports change.

For the first pass, leave trading and proof features disabled:

```dotenv
# backend/.env
PERPL_TRADING_ENABLED=false
LLM_API_KEY=
```

```dotenv
# frontend/.env.local
NEXT_PUBLIC_POLICY_COMMITMENT_ENABLED=false
NEXT_PUBLIC_ANCHORING_ENABLED=false
```

The example receipt path is `backend/.data/perpl-receipts.jsonl`, interpreted relative to the process working directory. Starting from `backend/` therefore writes to `backend/backend/.data/perpl-receipts.jsonl` relative to the repository. For a new setup, you can explicitly set `PERPL_RECEIPT_STORE_PATH=.data/perpl-receipts.jsonl` when running from `backend/`. For an existing setup, preserve or back up the current store before switching paths; otherwise previous demo receipts will disappear from the selected store.

## 2. Show public market intelligence

Open `/overview`, then `/markets`, and select a market to open `/markets/[marketId]`.

Check the protocol summary, 24h/7d/30d analytics, market filters, price/funding history, and sampled order book. Explain estimated OI in USD, data availability, missing fields, and partial market failures rather than presenting every tile as guaranteed data.

Inspect the realtime badge. Live WebSocket updates are conditional on a working upstream connection. Reconnecting, REST fallback, stale, or unavailable states are meaningful demo results. Frontend REST polling continues independently.

At this stage, private account views may report missing credentials. That is expected; public market access does not require them.

## 3. Enable read-only account analysis

Fill in a valid testnet pair in `backend/.env` and restart the backend:

```dotenv
PERPL_READ_API_KEY=<read-only-api-key>
PERPL_READ_API_KEY_SECRET=<32-byte-hex-ed25519-secret>
PERPL_TRADING_ENABLED=false
```

Do not put these values in frontend variables. Open `/wallet` and inspect accounts, positions, orders, fills, exposure, concentration, estimated leverage, performance, and score coverage.

Liquidation price/distance are unavailable in the current mapping. Historical PnL/fee units and history pagination have limitations described in [risk methodology](RISK_METHODOLOGY.md). Empty positions are valid and may lead the Agent to choose `hold`.

## 4. Run an Agent dry-run

Open `/trade-guard` and use **Agent plan**:

1. Enter a goal such as “Reduce current Perpl risk without increasing exposure.”
2. Review allowed accounts, markets, and actions; keep exposure increases disabled.
3. Review limits, reduction fraction, expiry, simulation requirements, and minimum score improvement.
4. Click **Run analysis**.
5. Inspect Analyst findings, proposed actions, before/after simulation, deterministic decision, and dry-run descriptors.

LLM configuration is optional. With no key, the deterministic fallback runs. To enable a model, set a valid `LLM_API_KEY`, nonempty `LLM_MODEL`, `LLM_BASE_URL`, and `LLM_API_STYLE` (`chat_completions` or `responses`). The example contains blank model/base-URL entries; fill them explicitly when enabling model access.

A result can be approved, rejected, require revision, or need clarification. Low coverage or incomplete data can block a recommendation; do not alter data to force approval. A zero minimum improvement permits an unchanged score. Running analysis never submits an order.

The workflow API attempts to save a risk-review receipt. Check its reported audit status. The standalone `perpl:agent-check` script does not go through that receipt-saving API path.

Optionally use **Manual simulation** to compare hold, reduction, closure, cancellation, or hypothetical added collateral. This panel neither approves a plan nor creates an execution intent.

## 5. Verify application receipts

Open `/receipts` and locate the workflow's `risk_review` record. Filter by type or decision, inspect the timeline, verify the record and chain, and export JSON.

Expected results for the default unsigned, unanchored flow:

- Hash and chain checks pass for an intact store.
- `receiptLayer` is `application`.
- `policyEnforcement` is `backend_pre_submission`.
- `onchainEnforced` is `false`.
- There is no anchor confirmation until a separate proof transaction is reported.

An application hash check establishes internal consistency, not correctness of the market inputs or successful exchange execution. Preserve the exported JSON for comparison if demonstrating a later anchor.

## 6. Optional: commit a policy onchain

Use an EIP-1193 wallet such as MetaMask, testnet MON, and an existing `PolicyCommitment` deployment. For deployment scripts, see [contracts/README.md](../contracts/README.md).

Foundry tests and scripts use the repository's [minimal forge-std compatibility layer](../contracts/lib/forge-std/README.md). Its required files are included in the repository, so a normal clone needs no separate Solidity library installation or submodule setup. Install Foundry and run `forge build` and `forge test` from the root; first use may download the configured Solidity 0.8.24 compiler.

Set the frontend variables and restart it:

```dotenv
NEXT_PUBLIC_ANCHOR_CHAIN_ID=10143
NEXT_PUBLIC_ANCHOR_CHAIN_NAME=Monad Testnet
NEXT_PUBLIC_ANCHOR_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_POLICY_COMMITMENT_ENABLED=true
NEXT_PUBLIC_POLICY_COMMITMENT_ADDRESS=<deployed-policy-commitment-address>
```

In Trade Guard, choose a valid future policy expiry, then click **Commit policy onchain**. Review the wallet network and destination before submitting. The frontend waits for a successful transaction, then displays the policy hash, transaction hash, and submitter.

Change a policy field to show that the local commitment display becomes stale. This proof is optional: it does not gate backend approval or submission, and local commitment UI state does not survive a full reload. The contract records a commitment; it does not enforce trading limits.

## 7. Optional: inspect guarded testnet execution

Keep the presentation in dry-run mode unless you intend to submit a real testnet request. Current submission limitations are documented in [security notes](SECURITY.md).

**Known blocker for reduction demonstrations:** Agent/simulator fractions and order-builder percentages differ. `0.25` simulates 25% but constructs 0.25% before rounding. Do not demonstrate a reduction as matching its simulation until the quantity units are corrected and verified. A permitted cancellation can demonstrate the submission path without that reduction conversion, but is still an actual testnet operation.

Execution additionally needs independent trade credentials and an enabled backend:

```dotenv
PERPL_TRADE_API_KEY=<trade-api-key>
PERPL_TRADE_API_KEY_SECRET=<32-byte-hex-ed25519-secret>
PERPL_TRADING_ENABLED=true
```

Restart the backend. Check `/api/perpl/trading/capabilities`: the read credentials must also be configured, and all checked accounts must allow forwarding and be unfrozen. Current defaults limit notional to 100 USD, leverage to 5, and slippage to 50 bps. Default UI policy values are looser, so align them with the server limits. A hold-only or multi-action approved strategy cannot create an executable intent.

For exactly one approved supported action:

1. Click **Approve dry-run plan** for local approval.
2. Click **Prepare intent**. The frontend sends backend workflow confirmation, then requests an intent and exact order preview.
3. Inspect the request ID, action, quantity, estimated notional, price protection, and expiry.
4. Only when ready, type `SUBMIT TESTNET ORDER` and click **Submit testnet order**.

The request travels through the authenticated Perpl trading WebSocket. Expected audit branches are:

| Result | Receipt expectation |
| --- | --- |
| Backend confirmation | `user_confirmation` |
| Prepared intent | `execution_intent` |
| Accepted submission acknowledgement | `order_submission`; not a fill confirmation |
| Rejected acknowledgement | `order_submission` and rejected `order_finalized` |
| Timeout/disconnection result | `order_update` with an unknown result |
| Click **Reconcile** after a stored result | `reconciliation` based on that saved result |

There is no automatic complete fill lifecycle. The current service may label a timeout/disconnection intent `rejected` while its receipt describes the outcome as unknown; neither label proves that no exchange action occurred. Check Perpl directly after an uncertain response. **Reconcile** does not independently query orders, fills, or positions. A connection/authentication exception can fail before a submission-result receipt is created.

Changing goals, policies, or observed risk can invalidate local confirmation. Restarting the backend loses workflows and intents; rerun analysis before proceeding. Perpl order IDs must be shown separately from proof transaction hashes.

## 8. Optional: anchor a receipt hash

Configure a deployed `ReceiptAnchor` address and restart the frontend:

```dotenv
NEXT_PUBLIC_ANCHORING_ENABLED=true
NEXT_PUBLIC_RECEIPT_ANCHOR_ADDRESS=<deployed-receipt-anchor-address>
```

Use the same Monad testnet chain/RPC settings as the policy step. In `/receipts`, select a record such as `risk_review`, `user_confirmation`, `execution_intent`, or `order_submission`, then click **Anchor onchain**.

The wallet submits the hash and compact metadata. The frontend waits for transaction success and reports metadata to the backend, which appends an `anchor_confirmation`. Recheck the original receipt: its hash must remain unchanged, and chain verification should still pass.

For independently verifiable evidence, inspect the expected contract's storage/event using a trusted RPC or explorer. The backend currently validates metadata format only; its recorded anchored badge is not an independent chain verification. Full JSON remains offchain, and policy enforcement remains in the application.

## 9. Checks and troubleshooting

From `backend/`:

```bash
npm test
npm run build
npm run perpl:check
npm run perpl:analytics-check
npm run perpl:agent-check
npm run perpl:trade-check
npm run perpl:receipt-check
npm run perpl:realtime-check
```

From `frontend/`:

```bash
npm run lint
npm run build
```

From the root, with Foundry and its required library available:

```bash
forge test
```

Automated backend tests mock external services. Live check requirements differ; see [data sources](PERPL_DATA_SOURCES.md). The trade check submits no orders. A successful local test suite does not prove live account access, successful trading, contract deployment, or performance under load.

| Symptom | What to check |
| --- | --- |
| Missing private data / HTTP 503 | Both read credential values and backend restart |
| Public requests fail | Actual testnet access and the specific live-check output |
| REST works but realtime fails | Global WebSocket availability, upstream subscriptions, and connection state |
| Intent preparation fails | Exactly one supported action, policy expiry, audit save status, forwarding, frozen state, and local confirmation |
| Submission locked | Trading flag, independent trade credentials, server limits, origin, and intent expiry |
| Receipts disappear after restart/config change | Selected JSONL path and the backend working directory |
| Forge imports fail after cloning | Confirm all four bundled files under `contracts/lib/forge-std/src/` are present and run from the repository root |

`/health` checks the process; `/api/perpl/health` mainly reports configuration. `/api/system/status` is a configuration/module summary plus current realtime and receipt state, not a live probe of every external dependency.
