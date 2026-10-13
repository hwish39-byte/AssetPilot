import { createPublicClient, defineChain, encodeFunctionData, http, isAddress, type Hex } from "viem";
import { perplApi } from "@/lib/api";
import type { PerplAgentPolicy } from "@/types/perpl";

export const POLICY_COMMITMENT_ENABLED = process.env.NEXT_PUBLIC_POLICY_COMMITMENT_ENABLED === "true";
export const POLICY_COMMITMENT_ADDRESS = process.env.NEXT_PUBLIC_POLICY_COMMITMENT_ADDRESS ?? "";
export const POLICY_COMMITMENT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_ANCHOR_CHAIN_ID ?? "10143");
export const POLICY_COMMITMENT_CHAIN_HEX = `0x${POLICY_COMMITMENT_CHAIN_ID.toString(16)}` as Hex;
export const POLICY_COMMITMENT_CHAIN_NAME = process.env.NEXT_PUBLIC_ANCHOR_CHAIN_NAME ?? "Monad Testnet";
export const POLICY_COMMITMENT_RPC_URL = process.env.NEXT_PUBLIC_ANCHOR_RPC_URL ?? "https://testnet-rpc.monad.xyz";

const POLICY_COMMITMENT_TIMEOUT_MS = 60_000;

const monadTestnetChain = defineChain({
  id: POLICY_COMMITMENT_CHAIN_ID,
  name: POLICY_COMMITMENT_CHAIN_NAME,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [POLICY_COMMITMENT_RPC_URL] }
  }
});

const policyCommitmentAbi = [
  {
    type: "function",
    name: "commitPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyHash", type: "bytes32" },
      { name: "expiresAt", type: "uint64" }
    ],
    outputs: []
  }
] as const;

export interface PolicyCommitmentResult {
  txHash: Hex;
  submitter: Hex;
  contractAddress: Hex;
  chainId: number;
  policyHash: Hex;
}

export function getPolicyCommitmentConfigStatus() {
  if (!POLICY_COMMITMENT_ENABLED) return { ready: false, reason: "disabled" };
  if (!POLICY_COMMITMENT_ADDRESS) return { ready: false, reason: "contract not configured" };
  if (!isAddress(POLICY_COMMITMENT_ADDRESS)) return { ready: false, reason: "invalid contract address" };
  return { ready: true, reason: "ready" };
}

export async function policyHashFromPolicy(policy: PerplAgentPolicy): Promise<Hex> {
  const { policyHash } = await perplApi.policyHash(policy);
  return normalizeBytes32(policyHash, "policyHash");
}

export async function commitPolicyOnchain(policy: PerplAgentPolicy): Promise<PolicyCommitmentResult> {
  const config = getPolicyCommitmentConfigStatus();
  if (!config.ready) throw new Error(config.reason);
  if (Date.parse(policy.expiresAt) <= Date.now()) throw new Error("Policy is expired. Extend it before committing.");

  const policyHash = await policyHashFromPolicy(policy);
  const expiresAt = Math.floor(Date.parse(policy.expiresAt) / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("Policy expiry must be a valid timestamp.");

  const ethereum = getEthereum();
  const [account] = await ethereum.request({ method: "eth_requestAccounts" }) as Hex[];
  if (!account || !isAddress(account)) throw new Error("No wallet account connected.");
  await ensureMonadTestnet(ethereum);

  const data = encodeFunctionData({
    abi: policyCommitmentAbi,
    functionName: "commitPolicy",
    args: [policyHash, BigInt(expiresAt)]
  });

  const txHash = await sendPolicyCommitmentTransaction(ethereum, { from: account, to: POLICY_COMMITMENT_ADDRESS as Hex, data });
  await waitForPolicyCommitmentTransaction(txHash);

  return { txHash, submitter: account, contractAddress: POLICY_COMMITMENT_ADDRESS as Hex, chainId: POLICY_COMMITMENT_CHAIN_ID, policyHash };
}

export async function waitForPolicyCommitmentTransaction(txHash: Hex) {
  const client = createPublicClient({
    chain: monadTestnetChain,
    transport: http(POLICY_COMMITMENT_RPC_URL)
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    timeout: POLICY_COMMITMENT_TIMEOUT_MS
  });
  if (receipt.status !== "success") throw new Error("Policy commitment transaction reverted.");
  return receipt;
}

function normalizeBytes32(value: string, label: string): Hex {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) throw new Error(`${label} must be 32 bytes.`);
  if (hex === `0x${"0".repeat(64)}`) throw new Error(`${label} must be non-zero.`);
  return hex as Hex;
}

async function ensureMonadTestnet(ethereum: EthereumProvider) {
  const current = await ethereum.request({ method: "eth_chainId" }) as string;
  if (current.toLowerCase() === POLICY_COMMITMENT_CHAIN_HEX.toLowerCase()) return;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLICY_COMMITMENT_CHAIN_HEX }] });
  } catch (error) {
    if (isUnknownChainError(error)) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: POLICY_COMMITMENT_CHAIN_HEX,
          chainName: POLICY_COMMITMENT_CHAIN_NAME,
          rpcUrls: [POLICY_COMMITMENT_RPC_URL],
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

async function sendPolicyCommitmentTransaction(ethereum: EthereumProvider, tx: { from: Hex; to: Hex; data: Hex }): Promise<Hex> {
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
