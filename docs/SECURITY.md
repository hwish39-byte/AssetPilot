# Security Notes

## Secrets

Perpl API keys are backend-only:

- `PERPL_READ_API_KEY`
- `PERPL_READ_API_KEY_SECRET`
- `PERPL_TRADE_API_KEY`
- `PERPL_TRADE_API_KEY_SECRET`

No Perpl key should be placed in frontend code or `NEXT_PUBLIC_*` variables. Error responses redact keys, secrets, signatures, nonces, and request headers.

## Trading Guardrails

Perpl execution requires:

- `PERPL_TRADING_ENABLED=true`
- trade API key and secret
- allowed frontend Origin
- JSON request body
- deterministic approved workflow
- user confirmation
- idempotency key
- execution receipt creation when receipt enforcement is enabled

The backend does not implement programmatic API key enrollment.

## Receipts

Receipts are application-layer records. They are not Monad transactions, not digital signatures unless receipt signing is explicitly enabled, and not proof that a Perpl order passed through onchain policy contracts.

## Realtime

Realtime is public market data only. SSE responses never include Perpl API keys, signatures, wallet secrets, or full request headers.
