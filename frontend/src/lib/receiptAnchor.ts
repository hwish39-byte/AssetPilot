import { createPublicClient, defineChain, encodeFunctionData, http, isAddress, keccak256, toBytes, type Hex } from "viem";
import type { PerplReceipt, PerplReceiptType } from "@/types/perpl";

export const ANCHOR_CHAIN_ID = Number(process.env.NEXT_PUBLIC_ANCHOR_CHAIN_ID ?? "10143");
export const ANCHOR_CHAIN_HEX = `0x${ANCHOR_CHAIN_ID.toString(16)}` as Hex;
export const ANCHOR_CHAIN_NAME = process.env.NEXT_PUBLIC_ANCHOR_CHAIN_NAME ?? "Monad Testnet";
export const ANCHOR_RPC_URL = process.env.NEXT_PUBLIC_ANCHOR_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const RECEIPT_ANCHOR_ADDRESS = process.env.NEXT_PUBLIC_RECEIPT_ANCHOR_ADDRESS ?? "";
export const ANCHORING_ENABLED = process.env.NEXT_PUBLIC_ANCHORING_ENABLED === "true";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;
const ANCHOR_CONFIRMATION_TIMEOUT_MS = 60_000;

const monadTestnetChain = defineChain({
  id: ANCHOR_CHAIN_ID,
  name: ANCHOR_CHAIN_NAME,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [ANCHOR_RPC_URL] }
  }
});

const receiptAnchorAbi = [
  {
    type: "function",
    name: "anchorReceipt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "receiptHash", type: "bytes32" },
      { name: "workflowHash", type: "bytes32" },
      { name: "previousReceiptHash", type: "bytes32" },
      { name: "receiptType", type: "uint8" }
    ],
    outputs: []
  }
] as const;

const receiptTypeCodes: Record<PerplReceiptType, number> = {
  risk_review: 1,
  user_confirmation: 2,
  execution_intent: 3,
  order_submission: 4,
  order_update: 5,
  order_finalized: 6,
  execution_rejected: 7,
  reconciliation: 8,
  anchor_confirmation: 9
};

export interface AnchorReceiptResult {
  txHash: Hex;
  submitter: Hex;
  contractAddress: Hex;
  chainId: 10143;
}

export function getAnchorConfigStatus() {
  if (!ANCHORING_ENABLED) return { ready: false, reason: "Anchoring disabled" };
  if (!RECEIPT_ANCHOR_ADDRESS) return { ready: false, reason: "Contract not configured" };
  if (!isAddress(RECEIPT_ANCHOR_ADDRESS)) return { ready: false, reason: "Invalid contract address" };
  return { ready: true, reason: "Ready" };
}

export async function anchorReceiptOnchain(receipt: PerplReceipt): Promise<AnchorReceiptResult> {
  const config = getAnchorConfigStatus();
  if (!config.ready) throw new Error(config.reason);
  const ethereum = getEthereum();
  const [account] = await ethereum.request({ method: "eth_requestAccounts" }) as Hex[];
  if (!account || !isAddress(account)) throw new Error("No wallet account connected.");
  await ensureMonadTestnet(ethereum);

  const data = encodeFunctionData({
    abi: receiptAnchorAbi,
    functionName: "anchorReceipt",
    args: [
      normalizeBytes32(receipt.receiptHash, "receiptHash"),
      keccak256(toBytes(receipt.workflowId)),
      receipt.previousReceiptHash ? normalizeBytes32(receipt.previousReceiptHash, "previousReceiptHash") : ZERO_BYTES32,
      receiptTypeCodes[receipt.receiptType] ?? 0
    ]
  });

  const txHash = await sendAnchorTransaction(ethereum, { from: account, to: RECEIPT_ANCHOR_ADDRESS as Hex, data });
  await waitForAnchorTransaction(txHash);

  return { txHash, submitter: account, contractAddress: RECEIPT_ANCHOR_ADDRESS as Hex, chainId: 10143 };
}

export async function waitForAnchorTransaction(txHash: Hex) {
  const client = createPublicClient({
    chain: monadTestnetChain,
    transport: http(ANCHOR_RPC_URL)
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    timeout: ANCHOR_CONFIRMATION_TIMEOUT_MS
  });
  if (receipt.status !== "success") throw new Error("Anchor transaction reverted.");
  return receipt;
}

export function normalizeBytes32(value: string, label: string): Hex {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) throw new Error(`${label} must be 32 bytes.`);
  if (hex === ZERO_BYTES32) throw new Error(`${label} must be non-zero.`);
  return hex as Hex;
}

async function ensureMonadTestnet(ethereum: EthereumProvider) {
  const current = await ethereum.request({ method: "eth_chainId" }) as string;
  if (current.toLowerCase() === ANCHOR_CHAIN_HEX.toLowerCase()) return;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ANCHOR_CHAIN_HEX }] });
  } catch (error) {
    if (isUnknownChainError(error)) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: ANCHOR_CHAIN_HEX,
          chainName: ANCHOR_CHAIN_NAME,
          rpcUrls: [ANCHOR_RPC_URL],
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }
        }]
      });
      return;
    }
    throw error;
  }
}

function getEthereum(): EthereumProvider {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("MetaMask or another EIP-1193 wallet was not found.");
  return window.ethereum;
}

async function sendAnchorTransaction(ethereum: EthereumProvider, tx: { from: Hex; to: Hex; data: Hex }): Promise<Hex> {
  try {
    const txHash = await ethereum.request({ method: "eth_sendTransaction", params: [tx] }) as Hex;
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("Wallet returned an invalid transaction hash.");
    return txHash;
  } catch (error) {
    if (isUserRejectedRequest(error)) throw new Error("Wallet signature was rejected.");
    throw error;
  }
}

function isUnknownChainError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 4902);
}

function isUserRejectedRequest(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 4001);
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
