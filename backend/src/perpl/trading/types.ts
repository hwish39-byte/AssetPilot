import type { PerplAgentAction, PerplAgentWorkflowRequest, PerplAgentWorkflowResponse } from "../../agents/perpl/types.js";
import type { PerplMarket } from "../types.js";

export type TradingNetwork = "testnet";
export type TradingIntentStatus = "prepared" | "submitted" | "accepted" | "rejected" | "expired" | "cancelled" | "reconciled";
export type TradingWsConnectionState = "idle" | "connecting" | "authenticating" | "snapshotting" | "ready" | "closed" | "error";
export type SupportedTradingActionType = "reduce_position" | "close_position" | "cancel_order";

export interface PerplTradingConfig {
  enabled: boolean;
  network: TradingNetwork;
  apiUrl: string;
  wsUrl: string;
  chainId: number;
  tradeApiKey?: string;
  tradeApiKeySecret?: string;
  allowedFrontendOrigins: string[];
  allowedMarketIds: number[];
  maxOrderNotionalUsd: string;
  maxLeverage: number;
  maxSlippageBps: number;
  intentTtlMs: number;
  cooldownMs: number;
}

export interface TradingCapabilities {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  tradingEnabled: boolean;
  credentialsConfigured: boolean;
  readonlyKeyConfigured: boolean;
  testnetOnly: true;
  canPrepareIntent: boolean;
  canSubmitOrder: boolean;
  allowedMarketIds: number[];
  allowedActions: SupportedTradingActionType[];
  limits: {
    maxOrderNotionalUsd: string;
    maxLeverage: number;
    maxSlippageBps: number;
    intentTtlSeconds: number;
    cooldownSeconds: number;
  };
  wallet: {
    address: string | null;
    forwardingEnabled: boolean | null;
    frozen: boolean | null;
    accounts: Array<{ accountId: number; allowsForwarding: boolean; isFrozen: boolean; lastForwardedRequestId: string }>;
  };
  reasons: string[];
  warnings: string[];
}

export interface PerplOrderSpec {
  rq: number;
  mkt: number;
  acc: number;
  oid?: number;
  t: number;
  p?: number;
  s: number;
  a?: number;
  ms?: number;
  mnp?: number;
  tif?: number;
  fl: number;
  tp?: number;
  tpc?: number;
  tr?: number;
  lp?: number;
  lv: number;
  lb: number;
  bf?: number;
}

export interface ExactOrderPreview {
  actionId: string;
  actionType: SupportedTradingActionType;
  accountId: number;
  marketId: number;
  marketSymbol: string | null;
  requestId: number;
  orderSpec: PerplOrderSpec;
  reduceOnly: boolean;
  expectedSide: "close_long" | "close_short" | "cancel";
  size: string;
  sizeRaw: string;
  notionalUsdEstimate: string | null;
  markPrice: string | null;
  worstAcceptablePrice: string | null;
  maxSlippageBps: number | null;
  leverage: string | null;
  humanReadable: string;
  warnings: string[];
}

export interface StoredWorkflow {
  request: PerplAgentWorkflowRequest;
  response: PerplAgentWorkflowResponse;
  recordedAt: string;
  riskReviewReceiptId: string | null;
  userConfirmationReceiptId: string | null;
  confirmedAt: string | null;
}

export interface ExecutionIntent {
  intentId: string;
  workflowId: string;
  status: TradingIntentStatus;
  source: "assetpilot";
  protocol: "perpl";
  network: "monad-testnet";
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  planHash: string;
  riskFingerprint: string;
  idempotencyKey: string;
  preview: ExactOrderPreview;
  approvedAction: PerplAgentAction;
  perplResult: PerplOrderSubmissionResult | null;
  reasons: string[];
  warnings: string[];
  executionIntentReceiptId: string | null;
  orderSubmissionReceiptId: string | null;
  orderUpdateReceiptId: string | null;
  orderFinalizedReceiptId: string | null;
  reconciliationReceiptId: string | null;
}

export interface CreateExecutionIntentResponse {
  intent: PublicExecutionIntent;
  capabilities: TradingCapabilities;
  executionIntentReceiptId: string | null;
}

export interface PublicExecutionIntent {
  intentId: string;
  workflowId: string;
  status: TradingIntentStatus;
  source: "assetpilot";
  protocol: "perpl";
  network: "monad-testnet";
  createdAt: string;
  expiresAt: string;
  planHash: string;
  riskFingerprint: string;
  idempotencyKey: string;
  preview: ExactOrderPreview;
  perplResult: PerplOrderSubmissionResult | null;
  reasons: string[];
  warnings: string[];
  executionIntentReceiptId?: string | null;
  orderSubmissionReceiptId?: string | null;
  orderUpdateReceiptId?: string | null;
  orderFinalizedReceiptId?: string | null;
  reconciliationReceiptId?: string | null;
}

export interface ExecuteIntentRequest {
  planHash: string;
  idempotencyKey: string;
  confirmationText: string;
}

export interface PerplOrderSubmissionResult {
  status: "accepted" | "rejected" | "timeout" | "disconnected";
  requestId: number;
  orderId: string | null;
  perplStatus: number | null;
  perplStatusReason: number | null;
  message: string;
  receivedAt: string;
}

export interface PerplTradingClient {
  submitOrder(order: PerplOrderSpec): Promise<PerplOrderSubmissionResult>;
}

export interface TradingValidationContext {
  markets: PerplMarket[];
  capabilities: TradingCapabilities;
}
