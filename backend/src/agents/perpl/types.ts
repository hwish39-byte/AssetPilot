import type { LlmProvider } from "../../llm.js";
import type { PerplMarket, PerplOrder, PerplPosition } from "../../perpl/types.js";
import type {
  PerplRiskAction,
  PerplRiskComponent,
  PerplRiskDataBundle,
  PerplRiskIssue,
  PerplRiskSimulationResult,
  PerplRiskSnapshot
} from "../../risk/perplRiskTypes.js";

export const PERPL_AGENT_METHODOLOGY_VERSION = "assetpilot-perpl-agent-v1" as const;

export type PerplAgentActionType = "reduce_position" | "close_position" | "cancel_order" | "add_collateral" | "place_order" | "hold";
export type PerplAgentWorkflowState =
  | "data_loaded"
  | "analyzed"
  | "strategy_generated"
  | "clarification_required"
  | "risk_reviewed"
  | "dry_run_prepared"
  | "rejected"
  | "failed";
export type PerplAgentDecision = "approve" | "revise" | "reject";

export interface PerplAgentPolicy {
  allowedAccountIds: number[];
  allowedMarketIds: number[];
  allowedActions: PerplAgentActionType[];
  maxActionsPerStrategy: number;
  maxLeverage: number;
  maxOrderNotionalUsd: string;
  maxTotalNotionalUsd: string;
  maxSlippageBps: number;
  maxReductionPercentage: number;
  allowIncreaseExposure: boolean;
  requireSimulation: boolean;
  requireRiskImprovement: boolean;
  minimumRiskScoreImprovement: number;
  expiresAt: string;
}

export interface PerplAgentWorkflowRequest {
  userGoal: string;
  policy: PerplAgentPolicy;
  mode: "dry_run";
  preferredLanguage?: "zh-CN" | "en";
  currentState?: string;
}

export interface PerplAgentActionBase {
  actionId: string;
  type: PerplAgentActionType;
  rationale: string;
  expectedEffects: string[];
  targetAccountId: number;
  confidence: number;
  assumptions: string[];
}

export interface PerplReducePositionAction extends PerplAgentActionBase {
  type: "reduce_position";
  positionId: string;
  percentage: number;
  maxSlippageBps: number;
}

export interface PerplClosePositionAction extends PerplAgentActionBase {
  type: "close_position";
  positionId: string;
  maxSlippageBps: number;
}

export interface PerplCancelOrderAction extends PerplAgentActionBase {
  type: "cancel_order";
  orderId: string;
}

export interface PerplAddCollateralAction extends PerplAgentActionBase {
  type: "add_collateral";
  accountId: number;
  amount: string;
}

export interface PerplPlaceOrderAction extends PerplAgentActionBase {
  type: "place_order";
  marketId: number;
  side: "long" | "short";
  orderType: "market" | "limit";
  size: string;
  limitPrice: string | null;
  leverage: string;
  reduceOnly: boolean;
  maxSlippageBps: number;
  timeInForce: string;
}

export interface PerplHoldAction extends PerplAgentActionBase {
  type: "hold";
  reason: string;
}

export type PerplAgentAction =
  | PerplReducePositionAction
  | PerplClosePositionAction
  | PerplCancelOrderAction
  | PerplAddCollateralAction
  | PerplPlaceOrderAction
  | PerplHoldAction;

export interface PerplAnalystOutput {
  summary: string;
  riskLevel: PerplRiskSnapshot["riskLevel"];
  riskScore: number | null;
  scoreCoveragePercent: number;
  primaryRiskDrivers: Array<{
    componentId: string;
    label: string;
    score: number | null;
    weightedContribution: number | null;
    evidence: string[];
    severity: string;
  }>;
  affectedPositions: Array<{
    positionId: string;
    marketId: number;
    marketSymbol: string | null;
    reasons: string[];
  }>;
  affectedMarkets: Array<{ marketId: number; symbol: string | null; reasons: string[] }>;
  dataQualityConcerns: string[];
  recommendedObjectives: string[];
}

export interface PerplStrategyOutput {
  status: "generated" | "clarification_required" | "failed";
  objective: string;
  actions: PerplAgentAction[];
  expectedRiskDirection: "decrease" | "neutral" | "increase" | "unknown";
  assumptions: string[];
  clarificationQuestions: string[];
  validationErrors: string[];
}

export interface PerplRiskReviewIssue {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  actionId?: string;
  suggestedFix?: string;
}

export interface PerplAgentRiskReview {
  decision: PerplAgentDecision;
  riskScoreBefore: number | null;
  riskScoreAfter: number | null;
  scoreDelta: number | null;
  blockingIssues: PerplRiskReviewIssue[];
  warnings: PerplRiskReviewIssue[];
  approvedActionIds: string[];
  rejectedActionIds: string[];
  revisedActions: PerplAgentAction[];
  humanReadableSummary: string;
}

export interface PerplExecutionDescriptor {
  actionId: string;
  actionType: PerplAgentActionType;
  protocol: "perpl";
  network: "monad-testnet";
  accountId: number;
  marketId: number | null;
  positionId: string | null;
  orderId: string | null;
  humanReadable: string;
  expectedRiskEffect: string;
  requiresUserConfirmation: true;
  signingRequiredLater: boolean;
  executionStatus: "not_submitted";
  calldata: null;
  signature: null;
  txHash: null;
  orderIdAfterExecution: null;
}

export interface PerplExecutionOutput {
  status: "dry_run_prepared" | "blocked";
  descriptors: PerplExecutionDescriptor[];
  reason: string;
}

export interface PerplAgentWorkflowResponse {
  workflowId: string;
  state: PerplAgentWorkflowState;
  startedAt: string;
  completedAt: string;
  source: "assetpilot";
  network: "monad-testnet";
  methodologyVersion: typeof PERPL_AGENT_METHODOLOGY_VERSION;
  dataFreshness: {
    riskCalculatedAt: string | null;
    walletFetchedAt: string | null;
    marketFetchedAt: string | null;
  };
  riskSnapshot: PerplRiskSnapshot;
  analyst: PerplAnalystOutput;
  strategy: PerplStrategyOutput;
  simulation: PerplRiskSimulationResult | null;
  riskReview: PerplAgentRiskReview;
  execution: PerplExecutionOutput;
  auditStatus?: {
    status: "saved" | "failed";
    riskReviewReceiptId: string | null;
    planHash: string | null;
    error: string | null;
  };
  nextUserAction: string;
  warnings: string[];
}

export interface PerplAgentContext {
  request: PerplAgentWorkflowRequest;
  policy: PerplAgentPolicy;
  bundle: PerplRiskDataBundle;
  markets: PerplMarket[];
  riskSnapshot: PerplRiskSnapshot;
  positions: PerplPosition[];
  orders: PerplOrder[];
  llm: LlmProvider;
}

export interface PerplStrategyInput {
  userGoal: string;
  policy: PerplAgentPolicy;
  riskSnapshot: PerplRiskSnapshot;
  analyst: PerplAnalystOutput;
  positions: PerplPosition[];
  orders: PerplOrder[];
  markets: PerplMarket[];
  llm: LlmProvider;
}

export interface PerplRiskReviewInput {
  strategy: PerplStrategyOutput;
  policy: PerplAgentPolicy;
  riskSnapshot: PerplRiskSnapshot;
  positions: PerplPosition[];
  orders: PerplOrder[];
  markets: PerplMarket[];
  simulation: PerplRiskSimulationResult | null;
}

export function toSimulationAction(action: PerplAgentAction): PerplRiskAction | null {
  if (action.type === "reduce_position") return { type: "reduce_position", positionId: action.positionId, percentage: action.percentage };
  if (action.type === "close_position") return { type: "close_position", positionId: action.positionId };
  if (action.type === "cancel_order") return { type: "cancel_order", orderId: action.orderId };
  if (action.type === "add_collateral") return { type: "add_collateral", amount: action.amount };
  if (action.type === "hold") return { type: "hold" };
  return null;
}

export function riskIssueToDriver(issue: PerplRiskIssue): string {
  return `${issue.title}: ${issue.evidence.join("; ") || issue.description}`;
}

export function componentSortValue(component: PerplRiskComponent): number {
  return component.weightedContribution ?? component.score ?? -1;
}
