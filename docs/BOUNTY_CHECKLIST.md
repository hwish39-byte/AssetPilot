# Bounty Checklist

- [x] Perpl public REST data layer.
- [x] Signed read-only Perpl REST layer.
- [x] Perpl risk engine.
- [x] Protocol and market analytics.
- [x] Perpl Agent workflow.
- [x] Guarded Trade Guard execution path.
- [x] Safe Perpl testnet trade-key integration.
- [x] Application-layer deterministic receipts.
- [x] Public market-data WebSocket with REST fallback.
- [x] SSE stream to frontend.
- [x] Realtime status UI.
- [x] System status API.
- [x] Tests mock external calls.
- [x] No Perpl key in frontend or public env vars.
- [x] Perpl receipts clearly identify `onchainEnforced: false` and `onchainAnchored: false`.
- [x] Optional user-signed ReceiptAnchor contract for receipt hash anchoring.
- [x] Anchor confirmation receipts preserve original receipt hash validity.
- [x] MetaMask is used only for anchoring, not Perpl order signing.

## Verification Commands

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

```bash
cd frontend
npm run build
```

```bash
forge test
```
