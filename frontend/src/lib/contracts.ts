import type { Address } from "viem";

export const addresses = {
  policyVault: process.env.NEXT_PUBLIC_POLICY_VAULT_ADDRESS as Address | undefined,
  strategyExecutor: process.env.NEXT_PUBLIC_STRATEGY_EXECUTOR_ADDRESS as Address | undefined,
  receiptRegistry: process.env.NEXT_PUBLIC_RECEIPT_REGISTRY_ADDRESS as Address | undefined,
  agent: (process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? "0xA6e7100000000000000000000000000000000000") as Address,
  tokens: {
    mNVDA: process.env.NEXT_PUBLIC_TOKEN_MNVDA_ADDRESS as Address | undefined,
    mAAPL: process.env.NEXT_PUBLIC_TOKEN_MAAPL_ADDRESS as Address | undefined,
    mSPY: process.env.NEXT_PUBLIC_TOKEN_MSPY_ADDRESS as Address | undefined,
    USDC: process.env.NEXT_PUBLIC_TOKEN_USDC_ADDRESS as Address | undefined,
    mTSLA: process.env.NEXT_PUBLIC_TOKEN_MTSLA_ADDRESS as Address | undefined
  }
};

export const hasPolicyContract = Boolean(addresses.policyVault);
export const hasExecutorContract = Boolean(addresses.strategyExecutor);
export const hasReceiptContract = Boolean(addresses.receiptRegistry);

export const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const policyVaultAbi = [
  {
    type: "function",
    name: "createPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "maxSpendUsd", type: "uint256" },
      { name: "maxSingleTradeUsd", type: "uint256" },
      { name: "maxSlippageBps", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "requireSimulation", type: "bool" },
      { name: "allowedAssets", type: "address[]" },
      { name: "blockedAssets", type: "address[]" }
    ],
    outputs: [{ name: "policyId", type: "bytes32" }]
  },
  {
    type: "event",
    name: "PolicyCreated",
    inputs: [
      { name: "policyId", type: "bytes32", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "nonce", type: "uint256", indexed: false }
    ]
  }
] as const;

export const strategyExecutorAbi = [
  {
    type: "function",
    name: "executeStrategy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "bytes32" },
      {
        name: "actions",
        type: "tuple[]",
        components: [
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "sellAmount", type: "uint256" },
          { name: "expectedBuyAmount", type: "uint256" },
          { name: "minBuyAmount", type: "uint256" }
        ]
      },
      {
        name: "meta",
        type: "tuple",
        components: [
          { name: "authorizationHash", type: "bytes32" },
          { name: "strategyHash", type: "bytes32" },
          { name: "marketSnapshotHash", type: "bytes32" },
          { name: "summary", type: "string" }
        ]
      }
    ],
    outputs: [
      { name: "success", type: "bool" },
      { name: "receiptId", type: "uint256" },
      { name: "reason", type: "string" }
    ]
  }
] as const;

export const receiptRegistryAbi = [
  {
    type: "function",
    name: "getReceiptsByUser",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }]
  },
  {
    type: "function",
    name: "getReceipt",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "user", type: "address" },
          { name: "agent", type: "address" },
          { name: "authorizedBy", type: "address" },
          { name: "policyId", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "authorizationHash", type: "bytes32" },
          { name: "strategyHash", type: "bytes32" },
          { name: "marketSnapshotHash", type: "bytes32" },
          { name: "receiptType", type: "uint8" },
          { name: "summary", type: "string" },
          { name: "reason", type: "string" },
          { name: "timestamp", type: "uint256" },
          { name: "executionTxHash", type: "bytes32" }
        ]
      }
    ]
  }
] as const;
