import { randomBytes } from "node:crypto";
import type { PerplAgentWorkflowRequest, PerplAgentWorkflowResponse, PerplAgentAction } from "../agents/perpl/types.js";
import type { PublicExecutionIntent, TradingCapabilities } from "../perpl/trading/types.js";
import type { PerplReceipt, PolicyAuditSummary, ReceiptBase, ReceiptDataProvenance } from "./types.js";
import { RECEIPT_SCHEMA_VERSION } from "./types.js";
import { stableHash } from "./hashing.js";

export function workflowPlanHash(response: PerplAgentWorkflowResponse): string {
  return stableHash({
    workflowId: response.workflowId,
    execution: response.execution,
    strategy: response.strategy,
    riskDecision: response.riskReview.decision,
    approvedActionIds: response.riskReview.approvedActionIds
  });
}

export function buildRiskReviewReceipt(input: {
  base: Omit<ReceiptBase, "receiptType">;
  request: PerplAgentWorkflowRequest;
  response: PerplAgentWorkflowResponse;
  serverHardLimits: Record<string, string | number | boolean | number[] | null>;
}): PerplReceipt {
  const { response, request } = input;
  return {
    ...input.base,
    receiptType: "risk_review",
    risk: {
      methodologyVersion: response.riskSnapshot.methodologyVersion,
      riskScore: response.riskSnapshot.score,
      riskLevel: response.riskSnapshot.riskLevel,
      scoreCoveragePercent: response.riskSnapshot.scoreCoveragePercent,
      componentSummaries: response.riskSnapshot.components.map(({ id, label, score, weightedContribution, severity, available, applicable }) => ({
        id,
        label,
        score,
        weightedContribution,
        severity,
        available,
        applicable
      })),
      issueCodes: response.riskSnapshot.issues.map((issue) => issue.code),
      highestWeightedContributors: response.riskSnapshot.components
        .filter((component) => component.weightedContribution !== null)
        .sort((left, right) => (right.weightedContribution ?? -1) - (left.weightedContribution ?? -1))
        .slice(0, 3)
        .map((component) => ({ id: component.id, label: component.label, weightedContribution: component.weightedContribution }))
    },
    strategy: {
      objective: response.strategy.objective,
      status: response.strategy.status,
      actionSummaries: response.strategy.actions.map(actionSummary),
      strategyHash: stableHash(response.strategy),
      assumptions: response.strategy.assumptions,
      clarificationStatus: response.strategy.status === "clarification_required" ? "required" : "none"
    },
    simulation: {
      beforeScore: response.simulation?.beforeScore ?? null,
      afterScore: response.simulation?.afterScore ?? null,
      scoreDelta: response.simulation?.scoreDelta ?? null,
      beforeMetricsSummary: summarizeMetrics((response.simulation?.beforeMetrics ?? response.riskSnapshot.walletMetrics) as unknown as Record<string, unknown>),
      afterMetricsSummary: summarizeMetrics((response.simulation?.afterMetrics ?? response.riskSnapshot.walletMetrics) as unknown as Record<string, unknown>),
      simulationHash: response.simulation ? stableHash(response.simulation) : null,
      changedComponents: response.simulation?.changedComponents.map((component) => component.id) ?? [],
      warnings: response.simulation?.warnings ?? []
    },
    policy: policySummary(request, input.serverHardLimits),
    riskDecision: {
      decision: response.riskReview.decision,
      approvedActionIds: response.riskReview.approvedActionIds,
      rejectedActionIds: response.riskReview.rejectedActionIds,
      blockingIssueCodes: response.riskReview.blockingIssues.map((issue) => issue.code),
      warningCodes: response.riskReview.warnings.map((issue) => issue.code),
      deterministicDecision: true,
      llmCanOverride: false
    }
  };
}

export function provenanceFromWorkflow(response: PerplAgentWorkflowResponse): ReceiptDataProvenance {
  return {
    perplNetwork: "monad-testnet",
    perplChainId: 10143,
    dataSources: ["perpl-rest", "assetpilot-risk-engine", "assetpilot-perpl-agent"],
    riskSnapshotFetchedAt: response.riskSnapshot.calculatedAt,
    marketsFetchedAt: response.dataFreshness.marketFetchedAt,
    walletFetchedAt: response.dataFreshness.walletFetchedAt,
    positionsCount: response.riskSnapshot.walletMetrics.openPositionCount,
    ordersCount: response.riskSnapshot.walletMetrics.openOrderCount,
    historyComplete: response.riskSnapshot.history.historyComplete,
    dataFreshness: response.dataFreshness,
    warnings: response.warnings
  };
}

export function baseReceipt(args: {
  sequenceNumber: number;
  createdAt: string;
  workflowId: string;
  parentReceiptId: string | null;
  previousReceiptHash: string | null;
  dataProvenance: ReceiptDataProvenance;
}): Omit<ReceiptBase, "receiptType"> {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    receiptId: `perpl_receipt_${randomBytes(18).toString("base64url")}`,
    sequenceNumber: args.sequenceNumber,
    createdAt: args.createdAt,
    protocol: "perpl",
    network: "monad-testnet",
    chainId: 10143,
    workflowId: args.workflowId,
    parentReceiptId: args.parentReceiptId,
    previousReceiptHash: args.previousReceiptHash,
    receiptHash: "0x",
    hashAlgorithm: "sha256",
    signature: null,
    signingKeyId: null,
    receiptLayer: "application",
    policyEnforcement: "backend_pre_submission",
    onchainEnforced: false,
    onchainAnchored: false,
    onchainTxHash: null,
    source: "assetpilot",
    dataProvenance: args.dataProvenance
  };
}

export function policySummary(request: PerplAgentWorkflowRequest, serverHardLimits: Record<string, string | number | boolean | number[] | null>): PolicyAuditSummary {
  const checksPerformed = [
    "policy_expiry",
    "allowed_accounts",
    "allowed_markets",
    "allowed_actions",
    "max_actions",
    "max_leverage",
    "max_order_notional",
    "max_total_notional",
    "max_slippage",
    "risk_improvement_required",
    "no_calldata",
    "no_signature"
  ];
  return {
    policyHash: stableHash(request.policy),
    policySnapshot: request.policy,
    policyExpiry: request.policy.expiresAt,
    enforcementLayer: "backend_pre_submission",
    checksPerformed,
    passedChecks: checksPerformed,
    failedChecks: [],
    serverHardLimits
  };
}

export function intentProvenance(intent: PublicExecutionIntent, capabilities: TradingCapabilities): ReceiptDataProvenance {
  return {
    perplNetwork: "monad-testnet",
    perplChainId: 10143,
    dataSources: ["perpl-rest", "assetpilot-trade-guard", "assetpilot-execution-intent"],
    riskSnapshotFetchedAt: null,
    marketsFetchedAt: null,
    walletFetchedAt: capabilities.fetchedAt,
    positionsCount: null,
    ordersCount: null,
    historyComplete: null,
    dataFreshness: { capabilitiesFetchedAt: capabilities.fetchedAt },
    warnings: [...intent.warnings, ...capabilities.warnings]
  };
}

function actionSummary(action: PerplAgentAction) {
  return {
    actionId: action.actionId,
    type: action.type,
    targetAccountId: action.targetAccountId,
    summary: action.type === "reduce_position"
      ? `reduce position ${action.positionId} by ${action.percentage}%`
      : action.type === "close_position"
        ? `close position ${action.positionId}`
        : action.type === "cancel_order"
          ? `cancel order ${action.orderId}`
          : action.type
  };
}

function summarizeMetrics(metrics: Record<string, unknown>): Record<string, unknown> {
  const keys = ["grossPositionNotional", "effectiveLeverageEstimate", "largestPositionShare", "openPositionCount", "openOrderCount", "totalBalance"];
  return keys.reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = metrics[key];
    return acc;
  }, {});
}
