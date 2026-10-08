// ---------------------------------------------------------------------------
// Archived legacy UI/demo types
// Not used by the primary V2 workflow. New UI/workflow code should use
// StrategyJson, RiskReviewV2, and ExecutionPlan instead of Strategy,
// RiskReview, and executionSummary.
// ---------------------------------------------------------------------------

export type AgentStatus = "pending" | "running" | "completed" | "failed" | "rejected";

export type ReceiptStatus = "EXECUTED" | "REFUSED";

export interface PortfolioAsset {
  symbol: "mNVDA" | "mAAPL" | "mSPY" | "USDC";
  valueUsd: number;
  weight: number;
  color: string;
}

export interface AnalystResult {
  riskScore: number;
  aiExposure: string;
  concentrationRisk: "Low" | "Medium" | "High";
  summary: string;
}

export interface PolicyDraft {
  maxSpendUsd: number;
  maxSingleTradeUsd: number;
  maxSlippageBps: number;
  allowedAssets: string[];
  blockedAssets: string[];
}

export interface StrategyAction {
  actionType: "SELL" | "BUY";
  sellToken: string;
  buyToken: string;
  sellAmountUsd: number;
  expectedBuyAmount: number;
  minBuyAmount: number;
}

export interface Strategy {
  goal: string;
  marketSnapshotHash: `0x${string}`;
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

export type RiskReview =
  | {
      status: "APPROVED";
      riskScoreBefore: number;
      riskScoreAfter: number;
      notes: string[];
      warnings: string[];
    }
  | {
      status: "REJECTED";
      reason: string;
      details: string;
    };

export interface AgentStep {
  id: "analyst" | "strategy" | "risk" | "execution";
  name: string;
  description: string;
  status: AgentStatus;
  output: string;
}

export interface StrategyReceipt {
  id: string;
  time: string;
  goal: string;
  status: ReceiptStatus;
  riskDelta: string;
  reason: string;
  txHash: string;
  user: string;
  agent: string;
  authorizedBy: string;
  policyId: string;
  policyHash: string;
  authorizationHash: string;
  strategyHash: string;
  strategyContentHash: string;
  marketSnapshotHash: string;
}

// ---------------------------------------------------------------------------
// V2 typed workflow types
// Used by /api/workflow/run and all new workflow UI code.
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
  asset_allocation: Record<string, number>;
  chain_exposure: Record<string, number>;
  protocol_exposure: Record<string, number>;
  stablecoin_ratio: number;
  leverage_ratio: number | null;
  largest_position: {
    symbol: string;
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
  affected_assets?: string[];
  affected_chains?: string[];
  affected_protocols?: string[];
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
  chain: string | null;
  protocol: string | null;
  from_asset: string | null;
  to_asset: string | null;
  asset: string | null;
  amount: AmountSpec;
  constraints: Record<string, unknown>;
  preconditions: string[];
  expected_effects: string[];
  rationale: string;
}

export interface StrategyConstraintsV2 {
  max_total_value_usd?: number;
  max_action_value_usd?: number;
  max_slippage_bps?: number;
  max_gas_usd?: number | null;
  min_stablecoin_ratio?: number | null;
  max_single_asset_ratio?: number | null;
  allowed_chains?: string[];
  allowed_protocols?: string[];
  allowed_assets?: string[];
  blocked_assets?: string[];
  denied_assets?: string[];
  custom?: StrategyConstraint[];
}

export interface StrategyJson {
  strategy_id: string;
  objective: StrategyObjective;
  constraints: StrategyConstraintsV2;
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

export interface RiskIssueV2 {
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
  blocking_issues: RiskIssueV2[];
  warnings: RiskIssueV2[];
  approved_action_ids: string[];
  revised_strategy_patch: JsonPatchOperation[];
  human_readable_summary: string;
}

export type ExecutionMode = "dry_run" | "prepare_payload" | "execute";

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

export interface ExecutionStep {
  step_id: string;
  action_id: string;
  type: "approve" | StrategyActionType;
  chain: string;
  protocol: string | null;
  contract: string | null;
  asset_in: string | null;
  asset_out: string | null;
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

export interface OrchestratorRequest {
  user_goal: string;
  portfolio: { symbol: string; valueUsd: number }[];
  market_snapshot: Record<string, unknown>;
  policy_draft: PolicyDraft;
  current_state?: WorkflowState;
  wallet?: string;
  chain_context?: Record<string, unknown>;
  protocol_registry?: Record<string, unknown>;
  execution_mode?: ExecutionMode;
}

export interface OrchestratorResponse {
  current_state: WorkflowState;
  next_agent: AgentName;
  analyse_agent: AnalystAgentOutput | null;
  strategy_agent: StrategyAgentOutput | null;
  risk_agent: RiskReviewV2 | null;
  execution_agent: ExecutionAgentOutput | null;
  next_user_action: string;
  reason: string;
}
