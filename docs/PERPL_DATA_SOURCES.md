# Perpl Data Sources

This document describes the clients implemented in this repository. Endpoint names and mappings are based on the source code; the repository does not bundle the previously referenced external `api-docs/*.md` files. Live availability and upstream schema compatibility must be checked against the configured testnet.

## Network configuration

| Variable | Default |
| --- | --- |
| `PERPL_API_URL` | `https://testnet.perpl.xyz/api` |
| `PERPL_WS_URL` | `wss://testnet.perpl.xyz` |
| `PERPL_CHAIN_ID` | `10143` |
| `PERPL_RPC_URL` | `https://testnet-rpc.monad.xyz` |

REST paths below are appended to `PERPL_API_URL`. Public market and authenticated trading WebSockets are separate connections. The trading configuration restricts the network to the documented testnet chain and Perpl hosts.

## Public REST

[PerplPublicClient](../backend/src/perpl/publicClient.ts) implements:

| Method and path | Use |
| --- | --- |
| `GET /v1/pub/context` | Chain, tokens, accounts' collateral context, markets, and current market state |
| `GET /v1/market-data/ticker` | All-market ticker |
| `GET /v1/market-data/:marketId/ticker` | Single-market ticker |
| `GET /v1/market-data/:marketId/book?levels=...` | L2 order-book snapshot |
| `GET /v1/market-data/funding/:from-:to` | Funding across markets |
| `GET /v1/market-data/:marketId/funding/:from-:to` | Market funding history |
| `GET /v1/market-data/:marketId/candles/:resolution/:from-:to` | Market OHLC, volume, and trade-count history |

The implementation constructs history ranges in milliseconds. Candle resolution is expressed in seconds. Public data does not require Perpl API credentials.

## Signed read-only REST

[PerplSignedClient](../backend/src/perpl/signedClient.ts) implements:

| Path | Use |
| --- | --- |
| `/v1/trading/wallet` | Wallet accounts and account statistics |
| `/v1/trading/positions` | Open positions |
| `/v1/trading/orders` | Open orders |
| `/v1/trading/fills` | Fills |
| `/v1/trading/account-history` | Account events |
| `/v1/trading/order-history` | Historical orders |
| `/v1/trading/position-history` | Historical positions |
| `/v1/trading/portfolio/equity/:period` | Equity series |
| `/v1/trading/portfolio/pnl/:period` | PnL series |

These are GET requests signed in the backend using `PERPL_READ_API_KEY` and `PERPL_READ_API_KEY_SECRET`. Paginated methods accept `count` and `page`. Portfolio periods are `all`, `day`, `2weeks`, `week`, and `month`.

The Ed25519 canonical signing message joins these fields with newlines:

```text
chainId
HTTP_METHOD
request_target_including_query
timestamp_ms
nonce
sha256_hex_of_raw_body
```

Requests carry `X-API-Key`, `X-API-Timestamp`, `X-API-Nonce`, and `X-API-Signature`. Retried signed requests get a fresh nonce and signature. The default HTTP timeout is 10 seconds, with up to two retries for network failures and HTTP 429/503; HTTP 401/403 are not retried.

Risk history fetches are bounded rather than exhaustive. See [risk methodology](RISK_METHODOLOGY.md) for pagination and raw-history unit limitations.

## Public market WebSocket and SSE

The public URL is `${PERPL_WS_URL}/ws/v1/market-data`.

| Stream | Purpose |
| --- | --- |
| `heartbeat@<chainId>` | Heartbeat and block information |
| `market-state@<chainId>` | Market ticker state |
| `funding@<chainId>` | Funding updates |
| `order-book@<marketId>` | Order-book snapshots and deltas |

The backend sends subscription frames with message type `5`. It handles subscription responses (`6`), market state (`9`), funding (`10`), book snapshots (`15`), book deltas (`16`), and heartbeat messages (`100`). It maps subscription IDs to market streams, retains shared subscriptions, and checks sequences when supplied.

Browser clients use the backend SSE endpoint, not Perpl credentials:

```text
GET /api/perpl/realtime/stream?markets=1,2&channels=ticker,funding,orderbook,heartbeat
```

Market IDs must come from the actual context response. Defaults allow up to eight markets, send WebSocket heartbeats every 15 seconds, and mark an inactive connection stale after 45 seconds. Defaults can be configured in `backend/.env.example`; the REST-resync interval setting is currently parsed but not scheduled. Frontend REST polling remains a separate fallback.

## Authenticated trading WebSocket

Orders are submitted through `${PERPL_WS_URL}/ws/v1/trading`, **not through a trading REST POST**.

The backend signs in using message type `29` and independent trade credentials. Its signing message is:

```text
chainId
trading-ws-signin
timestamp_ms
nonce
```

After an initial ready/snapshot message, it submits `{ mt: 22, orders: [...] }`. Responses are matched by request ID. Accepted/rejected acknowledgements, timeout, and disconnection are exposed as submission results. Acceptance is not proof of a fill.

This path is enabled only through backend execution intents and capability checks. There is no private account SSE stream or complete fill-tracking service. [executionService.ts](../backend/src/perpl/trading/executionService.ts) currently records existing results during reconciliation without re-querying Perpl.

## Precision and derived analytics

[Normalization](../backend/src/perpl/normalize.ts) returns scaled values as strings. Prices use market `price_decimals`, sizes use `size_decimals`, and normalized collateral amounts use token decimals from context. Derived calculations use decimal.js. This cannot recover precision already lost if an upstream JSON number exceeds JavaScript's safe range. The order builder rejects constructed integers outside that range.

Order-book keys retain raw integer strings; levels are sorted using BigInt comparison. The realtime store retains up to 50 levels per side. Analytics samples 25 levels and derives spreads, sampled depth bands, and book imbalance. Book imbalance is not trader long/short positioning.

Supported analysis windows are `24h`, `7d`, and `30d`; candles are sorted and deduplicated without filling missing time buckets. Context is cached for 30 seconds. Analytics caches requests and limits tracked external concurrency to four. Some calculations use fixed windows even when the selected chart period changes; for example, average trade size currently divides selected-period volume by the 24-hour trade count.

The protocol overview sums market-level volumes, estimated OI in USD, and market TVL values. Current TVL aggregation is a sum, not a cross-instance deduplication algorithm. These are derived views of the returned testnet fields.

The availability matrix declares protocol active users, fees/revenue, deposits, withdrawals, net flows, liquidations, aggregate long/short skew, market share, and historical OI/TVL unavailable. Available declarations are static descriptions of mappings, not successful live probes. Individual metrics and failed-market lists must also be checked.

## Verification

From `backend/`:

```bash
npm run perpl:check
npm run perpl:analytics-check
npm run perpl:realtime-check
npm run perpl:agent-check
npm run perpl:trade-check
npm run perpl:receipt-check
```

Public/analytics/realtime checks need network access. Agent checks need read credentials and do not create API-managed workflow receipts. The trade check inspects capabilities and can sign an authentication frame; it submits no orders. The receipt check verifies local JSONL data; its printed `onchain_anchoring=disabled` is fixed text, not a check of frontend anchor settings.
