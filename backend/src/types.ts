// ---------------------------------------------------------------------------
// Legacy MVP types
// Kept only for the old demo endpoints:
// /api/analyze
// /api/generate-strategy
// /api/review-risk
// /api/execution-summary
// Do not use these for new workflow code. New code should use StrategyJson,
// RiskReviewV2, and ExecutionPlan instead of Strategy, RiskReview, and
// executionSummary.
// ---------------------------------------------------------------------------

export type AssetSymbol = string;

export interface PortfolioItem {
  symbol: AssetSymbol;
  valueUsd: number;
}

export interface AnalyzeRequest {
  portfolio: PortfolioItem[];
  marketSnapshot: MarketSnapshotInput;
  userGoal: string;
}

export interface AnalystResult {
  riskScore: number;
  aiExposure: string;
  concentrationRisk: "Low" | "Medium" | "High";
  summary: string;
}

export interface MarketSnapshotInput {
  hash?: string;
  prices?: Record<string, number>;
  [symbol: string]: unknown;
}

export interface PolicyDraft {
  maxSpendUsd: number;
  maxSingleTradeUsd: number;
  maxSlippageBps: number;
  allowedAssets: AssetSymbol[];
  blockedAssets: AssetSymbol[];
}

export interface StrategyAction {
  actionType: "SELL" | "BUY";
  sellToken: AssetSymbol;
  buyToken: AssetSymbol;
  sellAmountUsd: number;
  expectedBuyAmount: number;
  minBuyAmount: number;
}

export interface Strategy {
  goal: string;
  marketSnapshotHash: string;
  actions: StrategyAction[];
  expectedImpact: {
    riskScoreBefore: number;
    riskScoreAfter: number;
    aiExposureBefore: string;
    aiExposureAfter: string;
    cashBufferBefore: string;
    cashBufferAfter: string;
  };
}

export interface GenerateStrategyRequest {
  userGoal: string;
  analystResult: AnalystResult;
  marketSnapshot: MarketSnapshotInput;
  policyDraft: PolicyDraft;
}

export type RejectionReason =
  | "SELL_TOKEN_NOT_ALLOWED"
  | "BUY_TOKEN_NOT_ALLOWED"
  | "SELL_TOKEN_BLOCKED"
  | "BUY_TOKEN_BLOCKED"
  | "MAX_SPEND_EXCEEDED"
  | "MAX_SINGLE_TRADE_EXCEEDED"
  | "SLIPPAGE_TOO_HIGH";

export interface ReviewRiskRequest {
  strategy: Strategy;
  policy: PolicyDraft;
  analystResult: AnalystResult;
}

export interface ApprovedRiskReview {
  status: "APPROVED";
  riskScoreBefore: number;
  riskScoreAfter: number;
  notes: string[];
  warnings: string[];
}

export interface RejectedRiskReview {
  status: "REJECTED";
  reason: RejectionReason;
  details: string;
}

export type RiskReview = ApprovedRiskReview | RejectedRiskReview;

export interface ExecutionSummaryRequest {
  strategy: Strategy;
  policyId: string;
  strategyHash: string;
  marketSnapshotHash: string;
  txResult?: {
    status?: "success" | "rejected" | "failed";
    txHash?: string;
    reason?: RejectionReason;
  };
  riskReview?: RiskReview;
}

export interface ContractCall {
  method: "executeStrategy";
  args: [string, StrategyAction[], string, string];
}

// ---------------------------------------------------------------------------
// V2 typed workflow contract
// Used by /api/workflow/run and all new agent code.
// ---------------------------------------------------------------------------

export type WorkflowState =
  | "draft_strategy"
  | "risk_reviewed"
  | "user_confirmed"
  | "payload_prepared"
  | "simulated"
  | "signed"
  | "executed"
  | "reported";

export type AgentName = "analyse" | "strategy" | "risk" | "execution" | "user";

export type ChainId = string;

export type ProtocolId = string;

export type StrategyActionType =
  | "swap"
  | "deposit"
  | "withdraw"
  | "stake"
  | "unstake"
  | "bridge"
  | "borrow"
  | "repay"
  | "provide_liquidity"
  | "remove_liquidity"
  | "hold";

export interface AmountSpec {
  mode: "exact" | "usd_value" | "percentage_of_position" | "percentage_of_portfolio" | "remaining" | "none";
  value: number | null;
  unit: string | null;
}

export interface PortfolioSnapshot {
  total_value_usd: number;
  asset_allocation: Record<AssetSymbol, number>;
  chain_exposure: Record<ChainId, number>;
  protocol_exposure: Record<ProtocolId, number>;
  stablecoin_ratio: number;
  leverage_ratio: number | null;
  largest_position: {
    symbol: AssetSymbol;
    value_usd: number;
    weight: number;
  } | null;
}

export interface RiskFactor {
  factor_id: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence?: string[];
  affected_assets?: AssetSymbol[];
  affected_chains?: ChainId[];
  affected_protocols?: ProtocolId[];
}

export interface StrategyConstraint {
  constraint: string;
  reason: string;
  hard: boolean;
  constraint_id?: string;
  type?: string;
  description?: string;
  value?: string | number | boolean | null;
}

export interface RiskContext {
  risk_level: "low" | "medium" | "high" | "critical";
  risk_factors: RiskFactor[];
  constraints_for_strategy: StrategyConstraint[];
}

export interface AnalystAgentOutput {
  portfolio_snapshot: PortfolioSnapshot;
  risk_context: RiskContext;
  summary: string;
  market_snapshot_hash?: string;
  human_readable_summary?: string;
}

export interface StrategyObjective {
  type: "rebalance" | "yield" | "hedge" | "exit" | "accumulate" | "custom";
  description: string;
  objective_id?: string;
  priority?: "low" | "medium" | "high" | "critical";
  target_state?: string | null;
}

export interface StrategyActionV2 {
  action_id: string;
  type: StrategyActionType;
  chain: ChainId | null;
  protocol: ProtocolId | null;
  from_asset: AssetSymbol | null;
  to_asset: AssetSymbol | null;
  asset: AssetSymbol | null;
  amount: AmountSpec;
  constraints: Record<string, unknown>;
  preconditions: string[];
  expected_effects: string[];
  rationale: string;
}

export interface StrategyConstraints {
  max_total_value_usd?: number;
  max_action_value_usd?: number;
  max_slippage_bps?: number;
  max_gas_usd?: number | null;
  min_stablecoin_ratio?: number | null;
  max_single_asset_ratio?: number | null;
  allowed_chains?: ChainId[];
  allowed_protocols?: ProtocolId[];
  allowed_assets?: AssetSymbol[];
  blocked_assets?: AssetSymbol[];
  denied_assets?: AssetSymbol[];
  custom?: StrategyConstraint[];
}

export interface StrategyJson {
  strategy_id: string;
  objective: StrategyObjective;
  constraints: StrategyConstraints;
  actions: StrategyActionV2[];
  success_criteria: Record<string, string>;
  assumptions: string[];
}

export interface StrategyAgentOutput {
  strategy: StrategyJson | null;
  status: "generated" | "need_clarification" | "failed";
  clarification_questions?: string[];
  validation_errors?: string[];
  human_readable_summary?: string;
}

export interface ContractActionPayloadV2 {
  action_id: string;
  adapter: "mock_amm";
  contract_method: "executeStrategy";
  sell_token_symbol: string;
  buy_token_symbol: string;
  sell_amount_usd: number;
  expected_buy_amount: number;
  min_buy_amount: number;
  max_slippage_bps: number;
  human_readable: string;
}

export interface ExecutionAdapterResult {
  supported: boolean;
  payload: ContractActionPayloadV2 | null;
  reason: string | null;
}

export interface GenerateStrategyV2Request {
  user_goal: string;
  portfolio_snapshot: PortfolioSnapshot;
  risk_context: RiskContext;
  user_risk_profile?: Record<string, unknown>;
  market_snapshot: MarketSnapshotInput;
  policy_draft: PolicyDraft;
  allowed_chains?: string[];
  allowed_protocols?: string[];
  supported_actions?: StrategyActionType[];
}

export interface RiskIssue {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  suggested_fix?: string | null;
  issue_id?: string;
  action_id?: string | null;
  description?: string;
  recommendation?: string;
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export type RiskDecision = "approve" | "revise" | "reject";

export interface RiskReviewV2 {
  decision: RiskDecision;
  risk_score: number;
  blocking_issues: RiskIssue[];
  warnings: RiskIssue[];
  approved_action_ids: string[];
  revised_strategy_patch: JsonPatchOperation[];
  human_readable_summary: string;
}

export interface ReviewRiskV2Request {
  strategy: StrategyJson;
  portfolio_snapshot: PortfolioSnapshot;
  risk_context: RiskContext;
  user_risk_profile?: Record<string, unknown>;
  policy_draft: PolicyDraft;
  protocol_registry?: Record<string, unknown>;
  market_context?: Record<string, unknown>;
}

export type ExecutionMode = "simulate" | "prepare" | "execute";

export interface ExecutionStep {
  step_id: string;
  action_id: string;
  type: "approve" | StrategyActionType;
  chain: ChainId;
  protocol: ProtocolId | null;
  contract: string | null;
  asset_in: AssetSymbol | null;
  asset_out: AssetSymbol | null;
  amount_in: string | null;
  min_amount_out: string | null;
  calldata: string | null;
  value: string | null;
  human_readable: string;
  requires_user_signature: boolean;
  contract_payload?: ContractActionPayloadV2 | null;
}

export interface SimulationResult {
  required: boolean;
  status: "not_run" | "passed" | "failed";
  summary: string | null;
  gas_estimate_usd?: number | null;
  warnings?: string[];
}

export interface UserConfirmationSummary {
  chains: string[];
  protocols: string[];
  assets_spent: Record<string, string>;
  assets_received_expected: Record<string, string>;
  max_slippage_bps: number | null;
  estimated_gas_usd: number | null;
  approval_requests: unknown[];
  worst_case_summary: string;
}

export interface ExecutionPlan {
  execution_plan_id: string;
  status: "prepared" | "blocked" | "simulation_required" | "ready_for_user_confirmation";
  steps: ExecutionStep[];
  simulation: SimulationResult;
  user_confirmation_summary: UserConfirmationSummary;
  blocked_reason: string | null;
}

export interface ExecutionAgentOutput {
  status: "not_started" | "blocked" | "dry_run_prepared";
  execution_plan: ExecutionPlan | null;
  reason: string;
  human_readable_summary?: string;
}

export interface PrepareExecutionPlanRequest {
  strategy: StrategyJson;
  risk_review: RiskReviewV2;
  wallet?: string;
  execution_mode: "dry_run" | "prepare_payload" | "execute";
  market_snapshot?: MarketSnapshotInput | Record<string, unknown>;
  protocol_adapters?: Record<string, unknown>;
  chain_context?: Record<string, unknown>;
}

export interface OrchestratorRequest {
  user_goal: string;
  portfolio: PortfolioItem[];
  market_snapshot: MarketSnapshotInput;
  policy_draft: PolicyDraft;
  current_state?: WorkflowState;
  wallet?: string;
  chain_context?: Record<string, unknown>;
  protocol_registry?: Record<string, unknown>;
  execution_mode?: "dry_run" | "prepare_payload" | "execute";
  prior_strategy?: StrategyJson;
  prior_risk_review?: RiskReviewV2;
  user_confirmation?: {
    confirmed: boolean;
    notes?: string;
  };
}

export interface OrchestratorResponse {
  analyse_agent: AnalystAgentOutput | null;
  strategy_agent: StrategyAgentOutput | null;
  risk_agent: RiskReviewV2 | null;
  execution_agent: ExecutionAgentOutput | null;
  current_state: WorkflowState;
  next_agent: AgentName;
  next_user_action: string;
  reason: string;
}
