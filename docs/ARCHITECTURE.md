# AssetPilot Perpl Architecture

## Runtime Boundary

AssetPilot now has two execution tracks:

- Mock tokenized-asset demo through the existing contracts.
- Perpl Monad testnet flow through backend REST, public market WebSocket, risk analysis, agent review, optional backend trade-key execution, and application receipts.

The Perpl path does not route orders through `PolicyVault`, `StrategyExecutor`, or `ReceiptRegistry`. Any Perpl receipt is application-layer audit evidence, not onchain enforcement.

## Perpl Data Path

```text
Perpl REST context/ticker/funding/book
  + Perpl public market WebSocket
  ↓
backend/src/perpl service + realtime store
  ↓
analytics + risk services
  ↓
Perpl agent workflow
  ↓
receipt service
  ↓
frontend dashboards and trade guard
```

## Realtime

The backend owns one shared public market-data WebSocket and exposes Server-Sent Events:

- `GET /api/perpl/realtime/stream?markets=&channels=`
- `GET /api/perpl/realtime/status`

Before subscribing a market, the backend fetches REST context and an order-book snapshot. Order-book deltas are only applied after a base snapshot exists. If an official `sn` sequence is present, duplicates are ignored and gaps trigger stale marking plus REST resync. If a message has no sequence, AssetPilot treats it as a weaker freshness signal instead of inventing ordering guarantees.

## Auditing

Receipts are append-only JSONL records with deterministic SHA-256 hashes. Each receipt links to the previous receipt hash and optional parent receipt. Receipt signing is optional and uses a separate receipt signing key, never Perpl API keys.

## System Status

`GET /api/system/status` summarizes Perpl REST, public WS, read API, risk, analytics, agent, trading, receipt store, Monad RPC, and contract path status. Contract status is intentionally shown as not in the Perpl execution path.
