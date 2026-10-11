# Perpl Data Sources

## Official Sources

Implementation is based on the Perpl official API docs:

- `api-docs/rest-endpoints.md`
- `api-docs/types.md`
- `api-docs/authentication.md`
- `api-docs/websocket.md`

## REST

Public REST:

- `GET /v1/pub/context`
- `GET /v1/market-data/ticker`
- `GET /v1/market-data/:market_id/ticker`
- `GET /v1/market-data/:market_id/book`
- `GET /v1/market-data/funding/:from-:to`
- `GET /v1/market-data/:market_id/funding/:from-:to`
- `GET /v1/market-data/:market_id/candles/:resolution/:from-:to`

Signed read-only REST:

- wallet
- positions
- orders
- fills
- account history
- order history
- position history
- portfolio equity
- portfolio pnl

Trading REST is only used by the guarded execution service after deterministic review, user confirmation, configured trade key, allowed Origin, idempotency, and receipt creation.

## WebSocket

Public realtime uses only:

- `${PERPL_WS_URL}/ws/v1/market-data`
- `heartbeat@<chain_id>`
- `market-state@<chain_id>`
- `funding@<chain_id>`
- `order-book@<market_id>`

Private wallet and trading streams are intentionally not mixed into the public market stream.

## Precision

Scaled fields are kept as strings after normalization:

- price fields use `Market.config.price_decimals`
- size fields use `Market.config.size_decimals`
- collateral and amount fields use the collateral token decimals from context

Raw order-book price keys are stored as strings so frontend updates do not depend on floating-point keys.
