# Security and Trust Boundaries

AssetPilot is a testnet MVP using one set of backend-configured Perpl credentials. The application has submission checks and audit records, but it does not implement production user authentication, tenant isolation, or a complete exchange reconciliation service.

## Credentials and model data

Keep these values in the backend environment only:

- `PERPL_READ_API_KEY` and `PERPL_READ_API_KEY_SECRET`
- `PERPL_TRADE_API_KEY` and `PERPL_TRADE_API_KEY_SECRET`
- `LLM_API_KEY`, when model assistance is enabled
- Independent receipt signing credentials, when enabled

Perpl API secrets are Ed25519 key material; they are separate from the EVM wallet key used for proof transactions. No secret belongs in frontend code, `NEXT_PUBLIC_*`, committed environment files, goals, screenshots, or exported demo material. Frontend public variables are exposed to the browser. The backend does not enroll Perpl API keys programmatically.

Typed Perpl errors are sanitized before returning to clients. Receipt construction redacts recognized sensitive field names. These are targeted filters, not a general guarantee that arbitrary strings or unhandled server logs cannot contain secrets.

When enabled, the LLM receives selected risk facts and, for strategy generation, the user's goal, policy, and position/order context. API credentials are not part of that payload. Account IDs and financial context can still be sensitive. Leaving the model key unset uses the deterministic fallback without sending those model requests.

## Submission controls

| Stage | Implemented controls |
| --- | --- |
| Agent request | Requires dry-run mode and validates policy; rejects client-supplied wallet, position, price, credential, and simulation fields |
| Risk review | Deterministic action and policy checks; simulation and score-improvement checks when required |
| Workflow confirmation | Approval, policy expiry, plan hash, explicit confirmation, and required risk-review receipt |
| Intent creation | Exactly one approved reduction, closure, or cancellation; refreshed account/market/order inputs and an exact preview |
| Submission | Trading enabled, read and trade credentials, wallet forwarding/frozen state, prepared intent and expiry, matching plan hash and idempotency key, exact confirmation text, and server limits |

Trading is disabled by default with `PERPL_TRADING_ENABLED=false`. Network configuration is restricted to Perpl testnet and chain ID `10143`. Defaults cap estimated order notional at 100 USD, leverage at 5, slippage at 50 bps, and intent lifetime at 180 seconds. Server market restrictions apply when `PERPL_TRADING_ALLOWED_MARKET_IDS` is nonempty.

Guarded execution routes require an allowed `Origin`, JSON content type, and an in-memory rate limit of 20 requests per minute per Origin/remote-address pair. Submission requires `SUBMIT TESTNET ORDER`. The intent is consumed before attempting network submission, which prevents an ordinary sequential retry from reusing it after an uncertain result.

## Limits of those controls

- Origin checks are not user authentication: non-browser clients can supply an Origin header. Global CORS is permissive, and read/receipt endpoints have no login or ownership checks. Keep credential-bearing instances within a trusted environment until authentication and authorization are implemented.
- User confirmation records an application request, not a wallet-signed attestation of account ownership. Connecting a proof wallet does not bind it to the backend's Perpl account.
- Workflows and intents are in memory. Idempotency is not durable across restarts or coordinated across multiple processes, and concurrent execution requests are not protected by a transactional lock.
- Submission rechecks capabilities and configured limits but does not recompute the full risk simulation, compare the saved risk fingerprint, or revalidate all policy conditions against current positions. A valid intent TTL is not proof that its plan is still appropriate.
- `PERPL_TRADING_COOLDOWN_SECONDS` is parsed and reported but not enforced by an execution cooldown mechanism. Rate limiting is separate.
- Policy checks differ by action. Total-notional checks are not a cumulative multi-action budget, and checks that require unavailable prices may not establish a complete notional bound.
- Reduction quantity uses inconsistent units between Agent simulation and order construction. See [risk methodology](RISK_METHODOLOGY.md). Do not use the dry-run reduction percentage as proof of the actual submitted quantity.
- Timeout/disconnection does not establish whether the exchange received an order. Current reconciliation records saved results without independently checking external orders or fills. Inspect Perpl directly before considering another action.

## Receipts and signatures

Receipts are application-layer evidence with these base fields:

```json
{
  "receiptLayer": "application",
  "policyEnforcement": "backend_pre_submission",
  "onchainEnforced": false,
  "onchainAnchored": false
}
```

Canonical JSON and SHA-256 links detect changes relative to a retained chain. They do not make the local file immutable: a party controlling the entire store can rewrite and recompute an unanchored chain. Single-record verification and chain verification do not prove the underlying market facts or exchange execution.

`PERPL_RECEIPT_SIGNING_ENABLED` enables a separate Ed25519 signing path. Private key and key ID are required to sign, and the corresponding public key is required to verify. The default flow is unsigned. Validate a persisted sign/verify round trip before relying on enabled signing; signing metadata is assigned during finalization and is included in hash input, so the unsigned flow's checks alone do not establish signed-store correctness.

Receipt initialization rejects malformed JSON, hash mismatches, and invalid chain links. Execution receipts are required by default. JSONL storage and its in-process append queue are not a distributed transactional audit log. Back up existing receipts before changing store paths.

## Onchain proof boundaries

MetaMask or another EIP-1193 wallet is used for two optional proof transactions: `PolicyCommitment` and `ReceiptAnchor`. Perpl order authentication uses the backend trade key.

The contracts store hashes and metadata; they neither custody funds nor enforce the application's trading policy. A policy commitment is optional and is not checked as a backend prerequisite for Agent review or execution. The selected EVM wallet is not required to match the Perpl account.

The browser waits for transaction success, then reports receipt-anchor metadata to the backend. That endpoint checks field formats and chain ID but does not independently verify deployed bytecode, transaction destination, receipt success, submitter, event fields, or anchored hash. It has no application authentication gate. Consequently, an `anchor_confirmation` record alone is not independent proof of an onchain anchor; verify the expected contract storage/event through a trusted RPC or explorer.

The original receipt remains unchanged after anchoring. A new confirmation records the reported transaction hash; `onchainEnforced` remains `false`. A Perpl order ID, application plan hash, receipt hash, and Monad transaction hash are distinct identifiers.

## Realtime and operational scope

Public market SSE does not intentionally carry API credentials or private trading streams. It includes public market state and service status. There is no blanket private-data protection for the rest of the backend's unauthenticated read endpoints.

The process binds without an explicit loopback host. A local development URL does not itself restrict network access. Authentication, transport security, access control, durable execution state, independent chain verification, and external reconciliation remain deployment work.

For demo boundaries and expected results, see [the demo script](DEMO_SCRIPT.md). For the data flow, see [architecture](ARCHITECTURE.md).
