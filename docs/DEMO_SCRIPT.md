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
- onchain enforcement is shown as false
- anchoring is optional and initially not present unless the receipt has an `anchor_confirmation`

## 5. Optional Policy Commitment

Deploy `PolicyCommitment` or configure an existing deployed address.

Set frontend env:

```bash
NEXT_PUBLIC_POLICY_COMMITMENT_ENABLED=true
NEXT_PUBLIC_POLICY_COMMITMENT_ADDRESS=0x...
```

Restart the frontend, open `/trade-guard`, configure the policy, and click **Commit policy onchain**. MetaMask switches to Monad testnet if needed and asks the user to submit `commitPolicy(policyHash, expiresAt)`.

Confirm the UI displays the policy hash, transaction hash, and submitter. If the policy changes after confirmation, the UI marks the commitment stale.

This is a policy hash commitment for public audit proof. It is not Perpl execution, not strategy execution, not fund custody, and not onchain policy enforcement.

## 6. Guarded Testnet Execution

Only with a configured trade key and explicit demo intent, confirm a guarded reduce-only/cancel action. Confirm execution intent, order submission/update/finalization, and reconciliation receipts appear.

Do not present Perpl order IDs as transaction hashes.

## 7. Optional Onchain Receipt Anchoring

Deploy `ReceiptAnchor` or configure an existing deployed address.

Set frontend env:

```bash
NEXT_PUBLIC_ANCHORING_ENABLED=true
NEXT_PUBLIC_RECEIPT_ANCHOR_ADDRESS=0x...
```

Restart the frontend, open `/receipts`, and select a `risk_review`, `user_confirmation`, `execution_intent`, or `order_submission` receipt.

Click **Anchor onchain**. MetaMask switches to Monad testnet if needed and asks the user to submit the transaction. AssetPilot waits for transaction confirmation, then the backend records an `anchor_confirmation` receipt. Receipt detail shows anchored status and the anchor transaction hash.

This is a receipt hash anchor transaction. It is not Perpl execution, not onchain policy enforcement, and it does not store full receipt JSON.
