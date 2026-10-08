import type {
  AnalyzeRequest,
  ExecutionPlan,
  ExecutionSummaryRequest,
  GenerateStrategyRequest,
  OrchestratorRequest,
  PolicyDraft,
  RiskReviewV2,
  ReviewRiskRequest,
  Strategy,
  StrategyJson
} from "./types.js";

export const strategyJsonSchema = {
  type: "object",
  required: ["goal", "marketSnapshotHash", "actions", "expectedImpact"],
  properties: {
    goal: { type: "string" },
    marketSnapshotHash: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: [
          "actionType",
          "sellToken",
          "buyToken",
          "sellAmountUsd",
          "expectedBuyAmount",
          "minBuyAmount"
        ]
      }
    },
    expectedImpact: { type: "object" }
  }
} as const;

export const strategyJsonV2Schema = {
  type: "object",
  required: ["strategy_id", "objective", "constraints", "actions", "success_criteria", "assumptions"],
  properties: {
    strategy_id: { type: "string" },
    objective: {
      type: "object",
      required: ["type", "description"],
      properties: {
        type: { enum: ["rebalance", "yield", "hedge", "exit", "accumulate", "custom"] },
        description: { type: "string" }
      }
    },
    constraints: {
      type: "object",
      required: [
        "max_slippage_bps",
        "max_gas_usd",
        "min_stablecoin_ratio",
        "max_single_asset_ratio",
        "allowed_chains",
        "allowed_protocols",
        "denied_assets"
      ]
    },
    actions: { type: "array" },
    success_criteria: { type: "object" },
    assumptions: { type: "array", items: { type: "string" } }
  }
} as const;

export const riskReviewV2Schema = {
  type: "object",
  required: [
    "decision",
    "risk_score",
    "blocking_issues",
    "warnings",
    "approved_action_ids",
    "revised_strategy_patch",
    "human_readable_summary"
  ],
  properties: {
    decision: { enum: ["approve", "revise", "reject"] },
    risk_score: { type: "number", minimum: 0, maximum: 100 },
    blocking_issues: { type: "array" },
    warnings: { type: "array" },
    approved_action_ids: { type: "array", items: { type: "string" } },
    revised_strategy_patch: { type: "array" },
    human_readable_summary: { type: "string" }
  }
} as const;

export const executionPlanSchema = {
  type: "object",
  required: [
    "execution_plan_id",
    "status",
    "steps",
    "simulation",
    "user_confirmation_summary",
    "blocked_reason"
  ],
  properties: {
    execution_plan_id: { type: "string" },
    status: { enum: ["prepared", "blocked", "simulation_required", "ready_for_user_confirmation"] },
    steps: { type: "array" },
    simulation: { type: "object" },
    user_confirmation_summary: { type: "object" },
    blocked_reason: { type: ["string", "null"] }
  }
} as const;

export const orchestratorRequestSchema = {
  type: "object",
  required: ["user_goal", "portfolio", "market_snapshot", "policy_draft"],
  properties: {
    user_goal: { type: "string" },
    portfolio: { type: "array" },
    market_snapshot: { type: "object" },
    policy_draft: { type: "object" },
    current_state: {
      enum: [
        "draft_strategy",
        "risk_reviewed",
        "user_confirmed",
        "payload_prepared",
        "simulated",
        "signed",
        "executed",
        "reported"
      ]
    },
    wallet: { type: "string" },
    chain_context: { type: "object" },
    protocol_registry: { type: "object" },
    execution_mode: { enum: ["dry_run", "prepare_payload", "execute"] }
  }
} as const;

export class ValidationError extends Error {
  public readonly statusCode = 400;
  public readonly details: string[];

  constructor(details: string[]) {
    super("Invalid request body");
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

const workflowStates = [
  "draft_strategy",
  "risk_reviewed",
  "user_confirmed",
  "payload_prepared",
  "simulated",
  "signed",
  "executed",
  "reported"
] as const;

const strategyActionTypes = [
  "swap",
  "deposit",
  "withdraw",
  "stake",
  "unstake",
  "bridge",
  "borrow",
  "repay",
  "provide_liquidity",
  "remove_liquidity",
  "hold"
] as const;

const amountModes = [
  "exact",
  "usd_value",
  "percentage_of_position",
  "percentage_of_portfolio",
  "remaining",
  "none"
] as const;

const objectiveTypes = ["rebalance", "yield", "hedge", "exit", "accumulate", "custom"] as const;

const riskDecisions = ["approve", "revise", "reject"] as const;

const executionStatuses = ["prepared", "blocked", "simulation_required", "ready_for_user_confirmation"] as const;

const simulationStatuses = ["not_run", "passed", "failed"] as const;

const executionModes = ["dry_run", "prepare_payload", "execute"] as const;

function validatePortfolioItems(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value) || value.length === 0) {
    return [`${path} must be a non-empty array`];
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object`);
      return;
    }
    if (!isNonEmptyString(item.symbol)) errors.push(`${itemPath}.symbol must be a symbol`);
    if (!isNumber(item.valueUsd) || item.valueUsd < 0) errors.push(`${itemPath}.valueUsd must be non-negative`);
  });
  return errors;
}

function validateAmountSpec(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!isOneOf(value.mode, amountModes)) errors.push(`${path}.mode must be a valid amount mode`);
  if (!isNullableNumber(value.value)) errors.push(`${path}.value must be a number or null`);
  if (!isNullableString(value.unit)) errors.push(`${path}.unit must be a string or null`);
  return errors;
}

function validateRiskIssue(value: unknown, path: string, kind: "blocking" | "warning"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!isNonEmptyString(value.code)) errors.push(`${path}.code must be a non-empty string`);
  const allowedSeverities = kind === "blocking" ? (["medium", "high", "critical"] as const) : (["low", "medium", "high"] as const);
  if (!isOneOf(value.severity, allowedSeverities)) {
    errors.push(`${path}.severity must be ${allowedSeverities.join(", ")}`);
  }
  if (!isNonEmptyString(value.message)) errors.push(`${path}.message must be a non-empty string`);
  if (kind === "blocking" && !isNullableString(value.suggested_fix)) {
    errors.push(`${path}.suggested_fix must be a string or null`);
  }
  return errors;
}

function validateJsonPatchOperation(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!isOneOf(value.op, ["add", "remove", "replace"] as const)) errors.push(`${path}.op must be add, remove, or replace`);
  if (!isNonEmptyString(value.path)) errors.push(`${path}.path must be a non-empty string`);
  return errors;
}

function validateContractActionPayloadV2(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!isNonEmptyString(value.action_id)) errors.push(`${path}.action_id must be a non-empty string`);
  if (value.adapter !== "mock_amm") errors.push(`${path}.adapter must be mock_amm`);
  if (value.contract_method !== "executeStrategy") errors.push(`${path}.contract_method must be executeStrategy`);
  if (!isNonEmptyString(value.sell_token_symbol)) errors.push(`${path}.sell_token_symbol must be a non-empty string`);
  if (!isNonEmptyString(value.buy_token_symbol)) errors.push(`${path}.buy_token_symbol must be a non-empty string`);
  if (!isNumber(value.sell_amount_usd) || value.sell_amount_usd <= 0) errors.push(`${path}.sell_amount_usd must be positive`);
  if (!isNumber(value.expected_buy_amount) || value.expected_buy_amount <= 0) errors.push(`${path}.expected_buy_amount must be positive`);
  if (!isNumber(value.min_buy_amount) || value.min_buy_amount < 0) errors.push(`${path}.min_buy_amount must be non-negative`);
  if (!isNumber(value.max_slippage_bps) || value.max_slippage_bps < 0 || value.max_slippage_bps > 10000) {
    errors.push(`${path}.max_slippage_bps must be between 0 and 10000`);
  }
  if (!isNonEmptyString(value.human_readable)) errors.push(`${path}.human_readable must be a non-empty string`);
  return errors;
}

function validatePolicy(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!isNumber(value.maxSpendUsd) || value.maxSpendUsd < 0) errors.push(`${path}.maxSpendUsd must be a non-negative number`);
  if (!isNumber(value.maxSingleTradeUsd) || value.maxSingleTradeUsd < 0) errors.push(`${path}.maxSingleTradeUsd must be a non-negative number`);
  if (!isNumber(value.maxSlippageBps) || value.maxSlippageBps < 0 || value.maxSlippageBps > 10000) {
    errors.push(`${path}.maxSlippageBps must be between 0 and 10000`);
  }
  if (!Array.isArray(value.allowedAssets) || !value.allowedAssets.every(isNonEmptyString)) {
    errors.push(`${path}.allowedAssets must be an array of symbols`);
  }
  if (!Array.isArray(value.blockedAssets) || !value.blockedAssets.every(isNonEmptyString)) {
    errors.push(`${path}.blockedAssets must be an array of symbols`);
  }
  return errors;
}

export function validateStrategy(value: unknown, path = "strategy"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must match strategy JSON schema`];
  if (!isNonEmptyString(value.goal)) errors.push(`${path}.goal must be a non-empty string`);
  if (!isNonEmptyString(value.marketSnapshotHash)) errors.push(`${path}.marketSnapshotHash must be a non-empty string`);
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    errors.push(`${path}.actions must be a non-empty array`);
  } else {
    value.actions.forEach((action, index) => {
      const actionPath = `${path}.actions[${index}]`;
      if (!isRecord(action)) {
        errors.push(`${actionPath} must be an object`);
        return;
      }
      if (action.actionType !== "SELL" && action.actionType !== "BUY") {
        errors.push(`${actionPath}.actionType must be SELL or BUY`);
      }
      if (!isNonEmptyString(action.sellToken)) errors.push(`${actionPath}.sellToken must be a symbol`);
      if (!isNonEmptyString(action.buyToken)) errors.push(`${actionPath}.buyToken must be a symbol`);
      if (!isNumber(action.sellAmountUsd) || action.sellAmountUsd <= 0) errors.push(`${actionPath}.sellAmountUsd must be positive`);
      if (!isNumber(action.expectedBuyAmount) || action.expectedBuyAmount <= 0) errors.push(`${actionPath}.expectedBuyAmount must be positive`);
      if (!isNumber(action.minBuyAmount) || action.minBuyAmount < 0) errors.push(`${actionPath}.minBuyAmount must be non-negative`);
    });
  }

  if (!isRecord(value.expectedImpact)) {
    errors.push(`${path}.expectedImpact must be an object`);
  } else {
    const impact = value.expectedImpact;
    if (!isNumber(impact.riskScoreBefore)) errors.push(`${path}.expectedImpact.riskScoreBefore must be a number`);
    if (!isNumber(impact.riskScoreAfter)) errors.push(`${path}.expectedImpact.riskScoreAfter must be a number`);
    if (!isNonEmptyString(impact.aiExposureBefore)) errors.push(`${path}.expectedImpact.aiExposureBefore must be a string`);
    if (!isNonEmptyString(impact.aiExposureAfter)) errors.push(`${path}.expectedImpact.aiExposureAfter must be a string`);
    if (!isNonEmptyString(impact.cashBufferBefore)) errors.push(`${path}.expectedImpact.cashBufferBefore must be a string`);
    if (!isNonEmptyString(impact.cashBufferAfter)) errors.push(`${path}.expectedImpact.cashBufferAfter must be a string`);
  }

  return errors;
}

export function validateStrategyJsonV2(value: unknown, path = "strategy"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must match StrategyJson V2 schema`];

  if (!isNonEmptyString(value.strategy_id)) errors.push(`${path}.strategy_id must be a non-empty string`);

  if (!isRecord(value.objective)) {
    errors.push(`${path}.objective must be an object`);
  } else {
    if (!isOneOf(value.objective.type, objectiveTypes)) {
      errors.push(`${path}.objective.type must be rebalance, yield, hedge, exit, accumulate, or custom`);
    }
    if (!isNonEmptyString(value.objective.description)) {
      errors.push(`${path}.objective.description must be a non-empty string`);
    }
  }

  if (!isRecord(value.constraints)) {
    errors.push(`${path}.constraints must be an object`);
  } else {
    const constraints = value.constraints;
    if (!isNumber(constraints.max_slippage_bps) || constraints.max_slippage_bps < 0 || constraints.max_slippage_bps > 10000) {
      errors.push(`${path}.constraints.max_slippage_bps must be between 0 and 10000`);
    }
    if (!isNullableNumber(constraints.max_gas_usd)) errors.push(`${path}.constraints.max_gas_usd must be a number or null`);
    if (!isNullableNumber(constraints.min_stablecoin_ratio)) {
      errors.push(`${path}.constraints.min_stablecoin_ratio must be a number or null`);
    }
    if (!isNullableNumber(constraints.max_single_asset_ratio)) {
      errors.push(`${path}.constraints.max_single_asset_ratio must be a number or null`);
    }
    if (!isNonEmptyStringArray(constraints.allowed_chains)) {
      errors.push(`${path}.constraints.allowed_chains must be an array of non-empty strings`);
    }
    if (!isNonEmptyStringArray(constraints.allowed_protocols)) {
      errors.push(`${path}.constraints.allowed_protocols must be an array of non-empty strings`);
    }
    if (!isNonEmptyStringArray(constraints.denied_assets)) {
      errors.push(`${path}.constraints.denied_assets must be an array of non-empty strings`);
    }
  }

  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    errors.push(`${path}.actions must be a non-empty array`);
  } else {
    value.actions.forEach((action, index) => {
      const actionPath = `${path}.actions[${index}]`;
      if (!isRecord(action)) {
        errors.push(`${actionPath} must be an object`);
        return;
      }

      if ("calldata" in action) {
        errors.push(`${actionPath}.calldata is not allowed in StrategyJson; Execution Agent owns calldata`);
      }
      if (!isNonEmptyString(action.action_id)) errors.push(`${actionPath}.action_id must be a non-empty string`);
      if (!isOneOf(action.type, strategyActionTypes)) errors.push(`${actionPath}.type must be a valid strategy action type`);
      if (!isNonEmptyString(action.chain)) errors.push(`${actionPath}.chain must be a non-empty string`);
      if (!isNullableString(action.protocol)) errors.push(`${actionPath}.protocol must be a string or null`);
      if (!isNullableString(action.from_asset)) errors.push(`${actionPath}.from_asset must be a string or null`);
      if (!isNullableString(action.to_asset)) errors.push(`${actionPath}.to_asset must be a string or null`);
      if (!isNullableString(action.asset)) errors.push(`${actionPath}.asset must be a string or null`);
      errors.push(...validateAmountSpec(action.amount, `${actionPath}.amount`));
      if (!isRecord(action.constraints)) errors.push(`${actionPath}.constraints must be an object`);
      if (!isStringArray(action.preconditions)) errors.push(`${actionPath}.preconditions must be an array of strings`);
      if (!isStringArray(action.expected_effects)) errors.push(`${actionPath}.expected_effects must be an array of strings`);
      if (!isNonEmptyString(action.rationale)) errors.push(`${actionPath}.rationale must be a non-empty string`);

      if (action.type === "swap") {
        if (!isNonEmptyString(action.from_asset)) errors.push(`${actionPath}.from_asset must be a non-empty string for swap`);
        if (!isNonEmptyString(action.to_asset)) errors.push(`${actionPath}.to_asset must be a non-empty string for swap`);
      }
      if (action.type !== "hold" && !isNonEmptyString(action.rationale)) {
        errors.push(`${actionPath}.rationale must be a non-empty string when action type is not hold`);
      }
    });
  }

  if (!isRecord(value.success_criteria)) errors.push(`${path}.success_criteria must be an object`);
  if (!isStringArray(value.assumptions)) errors.push(`${path}.assumptions must be an array of strings`);

  return errors;
}

export function validateRiskReviewV2(value: unknown, path = "risk_review"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must match RiskReviewV2 schema`];

  if (!isOneOf(value.decision, riskDecisions)) errors.push(`${path}.decision must be approve, revise, or reject`);
  if (!isNumber(value.risk_score) || value.risk_score < 0 || value.risk_score > 100) {
    errors.push(`${path}.risk_score must be between 0 and 100`);
  }

  if (!Array.isArray(value.blocking_issues)) {
    errors.push(`${path}.blocking_issues must be an array`);
  } else {
    value.blocking_issues.forEach((issue, index) => {
      errors.push(...validateRiskIssue(issue, `${path}.blocking_issues[${index}]`, "blocking"));
    });
  }

  if (!Array.isArray(value.warnings)) {
    errors.push(`${path}.warnings must be an array`);
  } else {
    value.warnings.forEach((issue, index) => {
      errors.push(...validateRiskIssue(issue, `${path}.warnings[${index}]`, "warning"));
    });
  }

  if (!isStringArray(value.approved_action_ids)) {
    errors.push(`${path}.approved_action_ids must be an array of strings`);
  }

  if (!Array.isArray(value.revised_strategy_patch)) {
    errors.push(`${path}.revised_strategy_patch must be an array`);
  } else {
    value.revised_strategy_patch.forEach((operation, index) => {
      errors.push(...validateJsonPatchOperation(operation, `${path}.revised_strategy_patch[${index}]`));
    });
  }

  if (!isNonEmptyString(value.human_readable_summary)) {
    errors.push(`${path}.human_readable_summary must be a non-empty string`);
  }

  const blockingIssueCount = Array.isArray(value.blocking_issues) ? value.blocking_issues.length : 0;
  const patchCount = Array.isArray(value.revised_strategy_patch) ? value.revised_strategy_patch.length : 0;
  if (value.decision === "approve" && blockingIssueCount > 0) {
    errors.push(`${path}.blocking_issues must be empty when decision is approve`);
  }
  if (value.decision === "reject" && blockingIssueCount === 0) {
    errors.push(`${path}.blocking_issues must contain at least one issue when decision is reject`);
  }
  if (value.decision === "revise" && patchCount === 0 && blockingIssueCount === 0) {
    errors.push(`${path}.revised_strategy_patch or ${path}.blocking_issues must contain at least one item when decision is revise`);
  }

  return errors;
}

export function validateExecutionPlan(value: unknown, path = "execution_plan"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must match ExecutionPlan schema`];

  if (!isNonEmptyString(value.execution_plan_id)) errors.push(`${path}.execution_plan_id must be a non-empty string`);
  if (!isOneOf(value.status, executionStatuses)) {
    errors.push(`${path}.status must be prepared, blocked, simulation_required, or ready_for_user_confirmation`);
  }

  if (!Array.isArray(value.steps)) {
    errors.push(`${path}.steps must be an array`);
  } else {
    value.steps.forEach((step, index) => {
      const stepPath = `${path}.steps[${index}]`;
      if (!isRecord(step)) {
        errors.push(`${stepPath} must be an object`);
        return;
      }
      if (!isNonEmptyString(step.step_id)) errors.push(`${stepPath}.step_id must be a non-empty string`);
      if (!isNonEmptyString(step.action_id)) errors.push(`${stepPath}.action_id must be a non-empty string`);
      if (!isOneOf(step.type, ["approve", ...strategyActionTypes] as const)) {
        errors.push(`${stepPath}.type must be approve or a valid strategy action type`);
      }
      if (!isNonEmptyString(step.chain)) errors.push(`${stepPath}.chain must be a non-empty string`);
      if (!isNullableString(step.protocol)) errors.push(`${stepPath}.protocol must be a string or null`);
      if (!isNullableString(step.contract)) errors.push(`${stepPath}.contract must be a string or null`);
      if (!isNullableString(step.asset_in)) errors.push(`${stepPath}.asset_in must be a string or null`);
      if (!isNullableString(step.asset_out)) errors.push(`${stepPath}.asset_out must be a string or null`);
      if (!isNullableString(step.amount_in)) errors.push(`${stepPath}.amount_in must be a string or null`);
      if (!isNullableString(step.min_amount_out)) errors.push(`${stepPath}.min_amount_out must be a string or null`);
      if (!isNullableString(step.calldata)) errors.push(`${stepPath}.calldata must be a string or null`);
      if (!isNullableString(step.value)) errors.push(`${stepPath}.value must be a string or null`);
      if (!isNonEmptyString(step.human_readable)) errors.push(`${stepPath}.human_readable must be a non-empty string`);
      if (typeof step.requires_user_signature !== "boolean") {
        errors.push(`${stepPath}.requires_user_signature must be a boolean`);
      }
      if (typeof step.calldata === "string" && !step.calldata.startsWith("0x")) {
        errors.push(`${stepPath}.calldata must start with 0x`);
      }
      if (step.contract_payload !== undefined && step.contract_payload !== null) {
        errors.push(...validateContractActionPayloadV2(step.contract_payload, `${stepPath}.contract_payload`));
      }
    });
  }

  if (!isRecord(value.simulation)) {
    errors.push(`${path}.simulation must be an object`);
  } else {
    if (typeof value.simulation.required !== "boolean") errors.push(`${path}.simulation.required must be a boolean`);
    if (!isOneOf(value.simulation.status, simulationStatuses)) {
      errors.push(`${path}.simulation.status must be not_run, passed, or failed`);
    }
    if (!isNullableString(value.simulation.summary)) errors.push(`${path}.simulation.summary must be a string or null`);
  }

  if (!isRecord(value.user_confirmation_summary)) {
    errors.push(`${path}.user_confirmation_summary must be an object`);
  } else {
    const summary = value.user_confirmation_summary;
    if (!isStringArray(summary.chains)) errors.push(`${path}.user_confirmation_summary.chains must be an array of strings`);
    if (!isStringArray(summary.protocols)) errors.push(`${path}.user_confirmation_summary.protocols must be an array of strings`);
    if (!isRecord(summary.assets_spent)) errors.push(`${path}.user_confirmation_summary.assets_spent must be an object`);
    if (!isRecord(summary.assets_received_expected)) {
      errors.push(`${path}.user_confirmation_summary.assets_received_expected must be an object`);
    }
    if (!isNullableNumber(summary.max_slippage_bps)) {
      errors.push(`${path}.user_confirmation_summary.max_slippage_bps must be a number or null`);
    }
    if (!isNullableNumber(summary.estimated_gas_usd)) {
      errors.push(`${path}.user_confirmation_summary.estimated_gas_usd must be a number or null`);
    }
    if (!Array.isArray(summary.approval_requests)) {
      errors.push(`${path}.user_confirmation_summary.approval_requests must be an array`);
    }
    if (typeof summary.worst_case_summary !== "string") {
      errors.push(`${path}.user_confirmation_summary.worst_case_summary must be a string`);
    }
  }

  if (!isNullableString(value.blocked_reason)) errors.push(`${path}.blocked_reason must be a string or null`);
  if (value.status === "blocked" && !isNonEmptyString(value.blocked_reason)) {
    errors.push(`${path}.blocked_reason must be a non-empty string when status is blocked`);
  }
  if (value.status !== "blocked" && Array.isArray(value.steps) && value.steps.length === 0) {
    errors.push(`${path}.steps must contain at least one step when status is not blocked`);
  }

  return errors;
}

export function assertAnalyzeRequest(value: unknown): AnalyzeRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  if (!Array.isArray(value.portfolio) || value.portfolio.length === 0) {
    errors.push("portfolio must be a non-empty array");
  } else {
    value.portfolio.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`portfolio[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(item.symbol)) errors.push(`portfolio[${index}].symbol must be a symbol`);
      if (!isNumber(item.valueUsd) || item.valueUsd < 0) errors.push(`portfolio[${index}].valueUsd must be non-negative`);
    });
  }
  if (!isRecord(value.marketSnapshot)) errors.push("marketSnapshot must be an object");
  if (!isNonEmptyString(value.userGoal)) errors.push("userGoal must be a non-empty string");
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as AnalyzeRequest;
}

export function assertGenerateStrategyRequest(value: unknown): GenerateStrategyRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  if (!isNonEmptyString(value.userGoal)) errors.push("userGoal must be a non-empty string");
  if (!isRecord(value.analystResult)) errors.push("analystResult must be an object");
  if (!isRecord(value.marketSnapshot)) errors.push("marketSnapshot must be an object");
  errors.push(...validatePolicy(value.policyDraft, "policyDraft"));
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as GenerateStrategyRequest;
}

export function assertReviewRiskRequest(value: unknown): ReviewRiskRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  errors.push(...validateStrategy(value.strategy));
  errors.push(...validatePolicy(value.policy, "policy"));
  if (!isRecord(value.analystResult)) errors.push("analystResult must be an object");
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as ReviewRiskRequest;
}

export function assertExecutionSummaryRequest(value: unknown): ExecutionSummaryRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  errors.push(...validateStrategy(value.strategy));
  if (!isNonEmptyString(value.policyId)) errors.push("policyId must be a non-empty string");
  if (!isNonEmptyString(value.strategyHash)) errors.push("strategyHash must be a non-empty string");
  if (!isNonEmptyString(value.marketSnapshotHash)) errors.push("marketSnapshotHash must be a non-empty string");
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as ExecutionSummaryRequest;
}

export function assertOrchestratorRequest(value: unknown): OrchestratorRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);

  if (!isNonEmptyString(value.user_goal)) errors.push("user_goal must be a non-empty string");
  errors.push(...validatePortfolioItems(value.portfolio, "portfolio"));
  if (!isRecord(value.market_snapshot)) errors.push("market_snapshot must be an object");
  errors.push(...validatePolicy(value.policy_draft, "policy_draft"));

  if (value.current_state !== undefined && !isOneOf(value.current_state, workflowStates)) {
    errors.push("current_state must be a valid workflow state");
  }
  if (value.wallet !== undefined && typeof value.wallet !== "string") {
    errors.push("wallet must be a string");
  }
  if (value.chain_context !== undefined && !isRecord(value.chain_context)) {
    errors.push("chain_context must be an object");
  }
  if (value.protocol_registry !== undefined && !isRecord(value.protocol_registry)) {
    errors.push("protocol_registry must be an object");
  }
  if (value.execution_mode !== undefined && !isOneOf(value.execution_mode, executionModes)) {
    errors.push("execution_mode must be dry_run, prepare_payload, or execute");
  }
  if (value.prior_strategy !== undefined) {
    errors.push(...validateStrategyJsonV2(value.prior_strategy, "prior_strategy"));
  }
  if (value.prior_risk_review !== undefined) {
    errors.push(...validateRiskReviewV2(value.prior_risk_review, "prior_risk_review"));
  }
  if (value.user_confirmation !== undefined) {
    if (!isRecord(value.user_confirmation)) {
      errors.push("user_confirmation must be an object");
    } else {
      if (typeof value.user_confirmation.confirmed !== "boolean") {
        errors.push("user_confirmation.confirmed must be a boolean");
      }
      if (value.user_confirmation.notes !== undefined && typeof value.user_confirmation.notes !== "string") {
        errors.push("user_confirmation.notes must be a string");
      }
    }
  }

  if (errors.length) throw new ValidationError(errors);
  return value as unknown as OrchestratorRequest;
}

export function assertStrategy(value: unknown): Strategy {
  const errors = validateStrategy(value);
  if (errors.length) throw new ValidationError(errors);
  return value as Strategy;
}

export function assertStrategyJsonV2(value: unknown): StrategyJson {
  const errors = validateStrategyJsonV2(value);
  if (errors.length) throw new ValidationError(errors);
  return value as StrategyJson;
}

export function assertRiskReviewV2(value: unknown): RiskReviewV2 {
  const errors = validateRiskReviewV2(value);
  if (errors.length) throw new ValidationError(errors);
  return value as RiskReviewV2;
}

export function assertExecutionPlan(value: unknown): ExecutionPlan {
  const errors = validateExecutionPlan(value);
  if (errors.length) throw new ValidationError(errors);
  return value as ExecutionPlan;
}

export function assertPolicy(value: unknown): PolicyDraft {
  const errors = validatePolicy(value, "policy");
  if (errors.length) throw new ValidationError(errors);
  return value as PolicyDraft;
}
