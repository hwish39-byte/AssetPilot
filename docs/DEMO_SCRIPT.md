# Demo Script

## 1. Start Services

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

## 2. Public Data Without Keys

Open `/overview` and `/markets`. Confirm:

- protocol metrics load from Perpl REST
- realtime badge shows Live, Reconnecting, REST fallback, Stale, or Unavailable
- market detail shows REST analytics and live public book/ticker values when WS is connected

## 3. Private Read Data

Configure read-only Perpl keys, restart backend, then open `/wallet` and `/trade-guard`. Confirm wallet, positions, orders, fills, risk, analytics, and agent review unlock.

## 4. Receipts

Run a Trade Guard dry-run. Open `/receipts` and verify:

- `risk_review` receipt is present
- hash verification passes
- chain verification passes
- onchain enforcement and anchoring are shown as false

## 5. Guarded Testnet Execution

Only with a configured trade key and explicit demo intent, confirm a guarded reduce-only/cancel action. Confirm execution intent, order submission/update/finalization, and reconciliation receipts appear.

Do not present Perpl order IDs as transaction hashes.
