import type {
  AmountSpec,
  ContractActionPayloadV2,
  ContractCall,
  ExecutionAgentOutput,
  ExecutionPlan,
  ExecutionStep,
  ExecutionSummaryRequest,
  PrepareExecutionPlanRequest,
  RejectionReason,
  StrategyActionV2,
  UserConfirmationSummary
} from "../types.js";
import { validateExecutionPlan, validateRiskReviewV2, validateStrategyJsonV2 } from "../validation.js";
import { buildMockAmmContractPayload } from "./executionAdapters.js";

const refusalSummary: Record<RejectionReason, string> = {
  SELL_TOKEN_NOT_ALLOWED: "策略已被拒绝，因为卖出资产不在允许列表中。",
  BUY_TOKEN_NOT_ALLOWED: "策略已被拒绝，因为目标资产不在允许列表中。",
  SELL_TOKEN_BLOCKED: "策略已被拒绝，因为卖出资产在黑名单中。",
  BUY_TOKEN_BLOCKED: "策略已被拒绝，因为目标资产在黑名单中。",
  MAX_SPEND_EXCEEDED: "策略已被拒绝，因为总交易金额超过策略上限。",
  MAX_SINGLE_TRADE_EXCEEDED: "策略已被拒绝，因为单笔交易金额超过策略上限。",
  SLIPPAGE_TOO_HIGH: "策略已被拒绝，因为滑点保护不足。"
};

/**
 * @deprecated Legacy MVP endpoint helper. New code should use prepareExecutionPlan via runWorkflow.
 */
export function executionSummary(input: ExecutionSummaryRequest) {
  const contractCall: ContractCall = {
    method: "executeStrategy",
    args: [input.policyId, input.strategy.actions, input.strategyHash, input.marketSnapshotHash]
  };

  const reviewReason = input.riskReview?.status === "REJECTED" ? input.riskReview.reason : undefined;
  const txReason = input.txResult?.reason;
  const refusalReason = reviewReason ?? txReason;

  if (refusalReason || input.txResult?.status === "rejected" || input.txResult?.status === "failed") {
    return {
      status: "REFUSED",
      reason: refusalReason ?? "SLIPPAGE_TOO_HIGH",
      summary: refusalSummary[refusalReason ?? "SLIPPAGE_TOO_HIGH"],
      contractCall,
      txHash: input.txResult?.txHash
    };
  }

  return {
    status: "EXECUTED",
    summary: `策略已执行，风险评分从 ${input.strategy.expectedImpact.riskScoreBefore} 降低到 ${input.strategy.expectedImpact.riskScoreAfter}。`,
    contractCall,
    txHash: input.txResult?.txHash
  };
}

export function prepareExecutionPlan(input: PrepareExecutionPlanRequest): ExecutionAgentOutput {
  const strategyErrors = validateStrategyJsonV2(input.strategy);
  if (strategyErrors.length > 0) {
    return blockedOutput(`Strategy validation failed: ${strategyErrors.join("; ")}`);
  }

  const riskErrors = validateRiskReviewV2(input.risk_review);
  if (riskErrors.length > 0) {
    return blockedOutput(`Risk review validation failed: ${riskErrors.join("; ")}`);
  }

  if (input.risk_review.decision !== "approve") {
    return blockedOutput("Risk Agent decision is not approve.");
  }

  if (input.execution_mode === "execute") {
    return blockedOutput(
      "Real execution is not enabled in Step 12; contract payload descriptors are dry-run metadata only."
    );
  }

  if (input.risk_review.approved_action_ids.length === 0) {
    return blockedOutput("Risk Agent approved the strategy but did not provide approved action ids.");
  }

  const approvedActionIds = new Set(input.risk_review.approved_action_ids);
  const unapprovedActionIds = input.strategy.actions
    .filter((action) => !approvedActionIds.has(action.action_id))
    .map((action) => action.action_id);
  const approvedActions = input.strategy.actions.filter((action) => approvedActionIds.has(action.action_id));

  for (const action of approvedActions) {
    if (action.type !== "swap" && action.type !== "hold") {
      return blockedOutput(`Execution adapter for action type ${action.type} is not implemented in MVP.`);
    }
  }

  const payloadsByActionId = new Map<string, ContractActionPayloadV2>();
  for (const action of approvedActions) {
    if (action.type === "hold") continue;
    const adapterResult = buildMockAmmContractPayload(action, input.strategy, input.market_snapshot ?? {});
    if (!adapterResult.supported || !adapterResult.payload) {
      return blockedOutput(adapterResult.reason ?? `Execution adapter could not build payload for ${action.action_id}.`);
    }
    payloadsByActionId.set(action.action_id, adapterResult.payload);
  }

  const steps = approvedActions.map((action, index) => mapStrategyActionToExecutionStep(action, index, payloadsByActionId.get(action.action_id) ?? null));
  const skippedReason = unapprovedActionIds.length > 0
    ? ` Unapproved actions were skipped: ${unapprovedActionIds.join(", ")}.`
    : "";
  const plan = buildExecutionPlan(
    input.execution_mode === "dry_run" ? "simulation_required" : "prepared",
    steps,
    input.strategy.constraints.max_slippage_bps ?? null,
    skippedReason.trim() || null
  );

  return validatePlanOutput({
    status: "dry_run_prepared",
    execution_plan: plan,
    reason: reasonForExecutionMode(input.execution_mode, skippedReason.trim())
  });
}

function mapStrategyActionToExecutionStep(
  action: StrategyActionV2,
  index: number,
  contractPayload: ContractActionPayloadV2 | null
): ExecutionStep {
  if (action.type === "hold") {
    return {
      step_id: `step_${index + 1}_${action.action_id}`,
      action_id: action.action_id,
      type: "hold",
      chain: action.chain ?? "unknown",
      protocol: null,
      contract: null,
      asset_in: null,
      asset_out: null,
      amount_in: null,
      min_amount_out: null,
      calldata: null,
      value: "0",
      human_readable: "Hold current portfolio; no transaction required.",
      requires_user_signature: false,
      contract_payload: null
    };
  }

  const amount = formatAmount(action.amount);
  const minReceiveAmount = contractPayload
    ? String(contractPayload.min_buy_amount)
    : typeof action.constraints.min_receive_amount === "string"
      ? action.constraints.min_receive_amount
      : null;

  return {
    step_id: `step_${index + 1}_${action.action_id}`,
    action_id: action.action_id,
    type: "swap",
    chain: action.chain ?? "unknown",
    protocol: action.protocol,
    contract: null,
    asset_in: action.from_asset,
    asset_out: action.to_asset,
    amount_in: amount,
    min_amount_out: minReceiveAmount,
    calldata: null,
    value: "0",
    human_readable: `Swap ${amount ?? "specified amount"} worth of ${action.from_asset ?? "asset"} to ${action.to_asset ?? "asset"} on ${action.chain ?? "unknown"} via ${action.protocol ?? "unknown protocol"}. Prepared mock_amm contract payload descriptor; calldata is not generated in dry-run.`,
    requires_user_signature: true,
    contract_payload: contractPayload
  };
}

function formatAmount(amount: AmountSpec): string | null {
  if (amount.mode === "none" || amount.value === null) return null;
  return amount.unit ? `${amount.value} ${amount.unit}` : String(amount.value);
}

function buildExecutionPlan(
  status: ExecutionPlan["status"],
  steps: ExecutionStep[],
  maxSlippageBps: number | null,
  blockedReason: string | null
): ExecutionPlan {
  return {
    execution_plan_id: `execution_plan_${Date.now()}`,
    status,
    steps,
    simulation: {
      required: true,
      status: "not_run",
      summary: status === "blocked" ? null : "Simulation is required before user confirmation."
    },
    user_confirmation_summary: buildUserConfirmationSummary(steps, maxSlippageBps),
    blocked_reason: status === "blocked" ? blockedReason : null
  };
}

function buildUserConfirmationSummary(steps: ExecutionStep[], maxSlippageBps: number | null): UserConfirmationSummary {
  const assetsSpent: Record<string, string> = {};
  const assetsReceivedExpected: Record<string, string> = {};
  const approvalRequests: UserConfirmationSummary["approval_requests"] = [];

  for (const step of steps) {
    if (step.type !== "swap") continue;
    if (step.contract_payload) {
      assetsSpent[step.contract_payload.sell_token_symbol] = `${step.contract_payload.sell_amount_usd} USD`;
      assetsReceivedExpected[step.contract_payload.buy_token_symbol] = `>= ${step.contract_payload.min_buy_amount}`;
      approvalRequests.push({
        asset: step.contract_payload.sell_token_symbol,
        spender: "StrategyExecutor",
        amount: "exact",
        reason: "Required for executeStrategy swap action"
      });
      continue;
    }
    if (step.asset_in && step.amount_in) assetsSpent[step.asset_in] = step.amount_in;
    if (step.asset_out) assetsReceivedExpected[step.asset_out] = "subject to route quote and slippage";
  }

  return {
    chains: unique(steps.map((step) => step.chain)),
    protocols: unique(steps.map((step) => step.protocol).filter((protocol): protocol is string => protocol !== null)),
    assets_spent: assetsSpent,
    assets_received_expected: assetsReceivedExpected,
    max_slippage_bps: maxSlippageBps,
    estimated_gas_usd: null,
    approval_requests: approvalRequests,
    worst_case_summary:
      maxSlippageBps === 100
        ? "Worst case before revert is approximately 1% slippage, subject to adapter quote."
        : `Worst case before revert follows max_slippage_bps=${maxSlippageBps}.`
  };
}

function reasonForExecutionMode(executionMode: PrepareExecutionPlanRequest["execution_mode"], skippedReason: string): string {
  if (skippedReason) return skippedReason;
  if (executionMode === "prepare_payload") {
    return "Contract payload descriptor prepared; calldata generation is not enabled yet.";
  }
  return "Execution plan prepared for dry-run; contract payload descriptor is available and calldata is not generated.";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function blockedOutput(reason: string): ExecutionAgentOutput {
  return validatePlanOutput({
    status: "blocked",
    execution_plan: buildExecutionPlan("blocked", [], null, reason),
    reason
  });
}

function validatePlanOutput(output: ExecutionAgentOutput): ExecutionAgentOutput {
  if (!output.execution_plan) return output;
  const errors = validateExecutionPlan(output.execution_plan);
  if (errors.length === 0) return output;

  const reason = `INVALID_EXECUTION_PLAN_OUTPUT: ${errors.join("; ")}`;
  return {
    status: "blocked",
    execution_plan: buildExecutionPlan("blocked", [], null, reason),
    reason
  };
}
