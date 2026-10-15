# AssetPilot Proof Contracts

This directory is intentionally small and independent from the Perpl execution path.

`contracts/src/ReceiptAnchor.sol` lets any user anchor an application-layer receipt hash on Monad testnet. It records only compact proof fields:

- `receiptHash`
- `workflowHash`
- `previousReceiptHash`
- `receiptType`
- `submitter`
- `timestamp`

The contract does not execute Perpl trades, does not enforce AssetPilot policy, and does not store full receipt JSON.

`contracts/src/PolicyCommitment.sol` lets any user commit a Trade Guard policy hash before Agent review or execution. It records only:

- `policyHash`
- `submitter`
- `expiresAt`
- `timestamp`

The contract does not store the full policy, does not execute strategies, does not custody funds, and does not enforce risk limits onchain. It is a public audit proof for a user-signed policy hash commitment.

## Build and Test

Install Foundry, then run from the repository root:

```bash
forge build
forge test
```

The repository includes four project-maintained compatibility files under `contracts/lib/forge-std/src/`, explicitly allowed by `.gitignore`. They provide the assertions, cheatcode declarations, script base, and console overloads used by the current tests and deployment scripts. These files are versioned with the project, so a normal clone requires no `forge install` or submodule initialization.

This is a minimal compatibility layer, not the full upstream forge-std distribution. See its [scope and setup notes](lib/forge-std/README.md) before adding new imports. Foundry may download the configured Solidity 0.8.24 compiler on first use; once installed, both commands also support `--offline`.

## Deploy

Set a deployer key and RPC URL outside the repository:

```bash
export PRIVATE_KEY=0x...
export MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

Broadcast the deployment:

```bash
forge script contracts/script/DeployReceiptAnchor.s.sol:DeployReceiptAnchor --rpc-url $MONAD_RPC_URL --broadcast
```

Deploy the policy commitment contract:

```bash
forge script contracts/script/DeployPolicyCommitment.s.sol:DeployPolicyCommitment --rpc-url $MONAD_RPC_URL --broadcast
```

If a verifier is available for the target network, use:

```bash
forge script contracts/script/DeployReceiptAnchor.s.sol:DeployReceiptAnchor --rpc-url $MONAD_RPC_URL --broadcast --verify
```

Record deployment metadata with `deployments/receipt-anchor-monad-testnet.example.json` and `deployments/policy-commitment-monad-testnet.example.json`.

## Frontend Configuration

After deployment, configure the frontend:

```bash
NEXT_PUBLIC_ANCHORING_ENABLED=true
NEXT_PUBLIC_RECEIPT_ANCHOR_ADDRESS=0x...
NEXT_PUBLIC_POLICY_COMMITMENT_ENABLED=true
NEXT_PUBLIC_POLICY_COMMITMENT_ADDRESS=0x...
```

MetaMask is used only for optional proof transactions: policy hash commitment before review and receipt hash anchoring after review/execution. Perpl execution remains backend guarded.
