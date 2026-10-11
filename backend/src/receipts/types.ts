import type { PerplAgentAction, PerplAgentPolicy } from "../agents/perpl/types.js";
import type { ExactOrderPreview, PerplOrderSubmissionResult } from "../perpl/trading/types.js";
import type { PerplRiskComponent, PerplWalletMetrics } from "../risk/perplRiskTypes.js";

export const RECEIPT_SCHEMA_VERSION = "assetpilot-perpl-receipt-v1" as const;

export type ReceiptType =
  | "risk_review"
  | "user_confirmation"
  | "execution_intent"
  | "order_submission"
  | "order_update"
  | "order_finalized"
  | "execution_rejected"
  | "reconciliation";

export interface ReceiptBase {
  schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  receiptId: string;
  receiptType: ReceiptType;
  sequenceNumber: number;
  createdAt: string;
  protocol: "perpl";
  network: "monad-testnet";
  chainId: 10143;
  workflowId: string;
  parentReceiptId: string | null;
  previousReceiptHash: string | null;
  receiptHash: string;
  hashAlgorithm: "sha256";
  signature: string | null;
  signingKeyId: string | null;
  receiptLayer: "application";
  policyEnforcement: "backend_pre_submission";
  onchainEnforced: false;
  onchainAnchored: false;
  onchainTxHash: null;
  source: "assetpilot";
  dataProvenance: ReceiptDataProvenance;
}

export interface ReceiptDataProvenance {
  perplNetwork: "monad-testnet";
  perplChainId: 10143;
  dataSources: string[];
  riskSnapshotFetchedAt: string | null;
  marketsFetchedAt: string | null;
  walletFetchedAt: string | null;
  positionsCount: number | null;
  ordersCount: number | null;
  historyComplete: boolean | null;
  dataFreshness: Record<string, string | null>;
  warnings: string[];
}

export interface PolicyAuditSummary {
  policyHash: string;
  policySnapshot: PerplAgentPolicy;
  policyExpiry: string;
  enforcementLayer: "backend_pre_submission";
  checksPerformed: string[];
  passedChecks: string[];
  failedChecks: string[];
  serverHardLimits: Record<string, string | number | boolean | number[] | null>;
}

export interface RiskReviewReceipt extends ReceiptBase {
  receiptType: "risk_review";
  risk: {
    methodologyVersion: string;
    riskScore: number | null;
    riskLevel: string;
    scoreCoveragePercent: number;
    componentSummaries: Array<Pick<PerplRiskComponent, "id" | "label" | "score" | "weightedContribution" | "severity" | "available" | "applicable">>;
    issueCodes: string[];
    highestWeightedContributors: Array<{ id: string; label: string; weightedContribution: number | null }>;
  };
  strategy: {
    objective: string;
    status: string;
    actionSummaries: Array<{ actionId: string; type: string; targetAccountId: number; summary: string }>;
    strategyHash: string;
    assumptions: string[];
    clarificationStatus: "none" | "required";
  };
  simulation: {
    beforeScore: number | null;
    afterScore: number | null;
    scoreDelta: number | null;
    beforeMetricsSummary: Partial<PerplWalletMetrics>;
    afterMetricsSummary: Partial<PerplWalletMetrics>;
    simulationHash: string | null;
    changedComponents: string[];
    warnings: string[];
  };
  policy: PolicyAuditSummary;
  riskDecision: {
    decision: "approve" | "revise" | "reject";
    approvedActionIds: string[];
    rejectedActionIds: string[];
    blockingIssueCodes: string[];
    warningCodes: string[];
    deterministicDecision: true;
    llmCanOverride: false;
  };
}

export interface UserConfirmationReceipt extends ReceiptBase {
  receiptType: "user_confirmation";
  userConfirmedAt: string;
  planHash: string;
  riskReviewReceiptId: string;
  confirmationScope: "approved_agent_execution_plan";
  confirmationSource: "assetpilot_trade_guard";
  policyExpiry: string;
  noOrderSubmitted: true;
}

export interface ExecutionIntentReceipt extends ReceiptBase {
  receiptType: "execution_intent";
  intentId: string;
  intentExpiry: string;
  planHash: string;
  approvedAction: PerplAgentAction;
  preview: ExactOrderPreview;
  policy: PolicyAuditSummary;
  validation: {
    preSubmissionValidationResults: string[];
    orderForwardingEnabled: boolean | null;
    accountFrozen: boolean | null;
    tradingEnabled: boolean;
    userConfirmationReceiptId: string;
  };
}

export interface OrderSubmissionReceipt extends ReceiptBase {
  receiptType: "order_submission";
  requestId: number;
  orderId: string | null;
  submittedAt: string;
  actionType: string;
  marketId: number;
  accountId: number;
  executionTransport: "perpl-trading-websocket";
  orderStatus: string;
  reduceOnly: boolean;
  size: string;
  protectedPrice: string | null;
  maxSlippageBps: number | null;
  planHash: string;
  acknowledgement: PerplOrderSubmissionResult;
}

export interface OrderUpdateReceipt extends ReceiptBase {
  receiptType: "order_update";
  orderId: string | null;
  requestId: number;
  previousStatus: string | null;
  currentStatus: string;
  filledSize: string | null;
  remainingSize: string | null;
  averageFillPrice: string | null;
  fees: string | null;
  updatedAt: string;
}

export interface OrderFinalizedReceipt extends ReceiptBase {
  receiptType: "order_finalized";
  finalStatus: string;
  requestId: number;
  orderId: string | null;
  totalFilledSize: string | null;
  averageFillPrice: string | null;
  totalFees: string | null;
  realizedPnl: string | null;
  finalPositionSummary: unknown;
  finalizedAt: string;
}

export interface ExecutionRejectedReceipt extends ReceiptBase {
  receiptType: "execution_rejected";
  intentId: string | null;
  planHash: string | null;
  reason: string;
  rejectedAt: string;
}

export interface ReconciliationReceipt extends ReceiptBase {
  receiptType: "reconciliation";
  previousUnknownReceiptId: string | null;
  dataSourcesChecked: string[];
  reconciledStatus: string;
  matchedRequestId: number | null;
  matchedOrderId: string | null;
  matchedFillIds: string[];
  reconciledAt: string;
}

export type PerplReceipt =
  | RiskReviewReceipt
  | UserConfirmationReceipt
  | ExecutionIntentReceipt
  | OrderSubmissionReceipt
  | OrderUpdateReceipt
  | OrderFinalizedReceipt
  | ExecutionRejectedReceipt
  | ReconciliationReceipt;

export interface ReceiptVerificationResult {
  receiptHashValid: boolean;
  chainLinkValid: boolean;
  parentValid: boolean;
  signaturePresent: boolean;
  signatureValid: boolean | null;
  onchainAnchored: false;
  verificationErrors: string[];
}

export interface ChainVerificationResult {
  valid: boolean;
  receiptCount: number;
  firstSequence: number | null;
  lastSequence: number | null;
  lastReceiptHash: string | null;
  corruptedSequence: number | null;
  errors: string[];
}

export interface ReceiptListQuery {
  type?: ReceiptType;
  decision?: "approve" | "revise" | "reject";
  executionStatus?: string;
  workflowId?: string;
  cursor?: string;
  limit?: number;
}

export interface ReceiptListResponse {
  data: PerplReceipt[];
  nextCursor: string | null;
}
