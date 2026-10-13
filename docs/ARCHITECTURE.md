# AssetPilot Perpl Architecture

## Runtime Boundary

AssetPilot now has two execution tracks:

- Perpl Monad testnet flow through backend REST/WS, risk analysis, agent review, optional backend Perpl execution, and application receipts.
- Optional `ReceiptAnchor` contract for user-signed receipt hash anchoring.

The Perpl path does not route orders through an onchain policy executor. Any Perpl receipt is application-layer audit evidence. Optional anchoring records the receipt hash onchain, not the full receipt and not a policy enforcement action.

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

## Onchain Receipt Anchoring

`ReceiptAnchor` stores a compact hash proof: receipt hash, workflow hash, previous receipt hash, receipt type, submitter, and timestamp. The full receipt JSON remains in the backend JSONL store and frontend export path.

After a user submits and confirms a Monad testnet anchor transaction, the backend appends an `anchor_confirmation` receipt. That confirmation links the application-layer hash chain to the user-submitted Monad transaction.

The original receipt is not mutated, so its receipt hash remains stable and existing verification semantics continue to hold. Anchoring proves existence and integrity of the receipt hash. It does not prove correctness of Perpl execution, does not make policy enforcement onchain, and does not turn a Perpl order ID into a transaction hash.

`onchainEnforced` remains `false`.

## Realtime

The backend owns one shared public market-data WebSocket and exposes Server-Sent Events:

- `GET /api/perpl/realtime/stream?markets=&channels=`
- `GET /api/perpl/realtime/status`

Before subscribing a market, the backend fetches REST context and an order-book snapshot. Order-book deltas are only applied after a base snapshot exists. If an official `sn` sequence is present, duplicates are ignored and gaps trigger stale marking plus REST resync. If a message has no sequence, AssetPilot treats it as a weaker freshness signal instead of inventing ordering guarantees.

## Auditing

Receipts are append-only JSONL records with deterministic SHA-256 hashes. Each receipt links to the previous receipt hash and optional parent receipt. Receipt signing is optional and uses a separate receipt signing key, never Perpl API keys.

## System Status

`GET /api/system/status` summarizes Perpl REST, public WS, read API, risk, analytics, agent, trading, receipt store, Monad RPC, and contract path status. Contract status is intentionally shown as not in the Perpl execution path.
