import { decimalOrNull, Decimal } from "../../risk/decimal.js";
import type { PerplAgentAction, PerplAgentRiskReview, PerplRiskReviewInput, PerplRiskReviewIssue } from "./types.js";
import { validateStrategyOutput } from "./validation.js";

export function reviewPerplStrategy(input: PerplRiskReviewInput): PerplAgentRiskReview {
  const blockingIssues: PerplRiskReviewIssue[] = [];
  const warnings: PerplRiskReviewIssue[] = [];
  const revisedActions: PerplAgentAction[] = [];

  const schemaErrors = validateStrategyOutput(input.strategy);
  for (const message of schemaErrors) {
    blockingIssues.push(issue("SCHEMA_INVALID", "critical", message));
  }

  if (Date.parse(input.policy.expiresAt) <= Date.now()) {
    blockingIssues.push(issue("POLICY_EXPIRED", "critical", "Perpl agent policy has expired."));
  }

  const seen = new Set<string>();
  for (const action of input.strategy.actions) {
    if (seen.has(action.actionId)) blockingIssues.push(issue("DUPLICATE_ACTION_ID", "critical", "Action IDs must be unique.", action.actionId));
    seen.add(action.actionId);
  }

  if (input.strategy.actions.length > input.policy.maxActionsPerStrategy) {
    blockingIssues.push(issue("TOO_MANY_ACTIONS", "critical", "Strategy exceeds maxActionsPerStrategy."));
  }

  for (const action of input.strategy.actions) {
    reviewAction(action, input, blockingIssues, warnings, revisedActions);
  }

  if (input.policy.requireSimulation && input.strategy.actions.some((action) => action.type !== "hold") && !input.simulation) {
    blockingIssues.push(issue("SIMULATION_REQUIRED", "critical", "Policy requires a successful simulation before dry-run execution."));
  }

  if (input.simulation) {
    if (input.simulation.after.scoreCoveragePercent < input.riskSnapshot.scoreCoveragePercent) {
      blockingIssues.push(issue("SIMULATION_COVERAGE_REGRESSION", "high", "Simulation reduced risk score coverage."));
    }
    if (input.policy.requireRiskImprovement && input.strategy.actions.some((action) => action.type !== "hold")) {
      const before = input.simulation.beforeScore;
      const after = input.simulation.afterScore;
      if (before === null || after === null) {
        blockingIssues.push(issue("RISK_IMPROVEMENT_UNAVAILABLE", "high", "Risk improvement cannot be confirmed from available data."));
      } else if (before - after < input.policy.minimumRiskScoreImprovement) {
        blockingIssues.push(
          issue(
            "RISK_IMPROVEMENT_TOO_SMALL",
            "high",
            `Risk score improvement ${before - after} is below required ${input.policy.minimumRiskScoreImprovement}.`
          )
        );
      }
    }
    for (const warning of input.simulation.warnings) warnings.push(issue("SIMULATION_WARNING", "medium", warning));
  }

  const hasRevisions = revisedActions.length > 0;
  const decision = blockingIssues.length > 0 ? (hasRevisions ? "revise" : "reject") : "approve";
  const approvedActionIds = decision === "approve" ? input.strategy.actions.map((action) => action.actionId) : [];
  const rejectedActionIds = decision === "approve" ? [] : input.strategy.actions.map((action) => action.actionId);

  return {
    decision,
    riskScoreBefore: input.simulation?.beforeScore ?? input.riskSnapshot.score,
    riskScoreAfter: input.simulation?.afterScore ?? null,
    scoreDelta: input.simulation?.scoreDelta ?? null,
    blockingIssues,
    warnings,
    approvedActionIds,
    rejectedActionIds,
    revisedActions,
    humanReadableSummary: summary(decision, blockingIssues, warnings)
  };
}

function reviewAction(
  action: PerplAgentAction,
  input: PerplRiskReviewInput,
  blockingIssues: PerplRiskReviewIssue[],
  warnings: PerplRiskReviewIssue[],
  revisedActions: PerplAgentAction[]
): void {
  if (!input.policy.allowedActions.includes(action.type)) {
    blockingIssues.push(issue("ACTION_NOT_ALLOWED", "critical", `${action.type} is not allowed by policy.`, action.actionId));
  }
  if (!input.policy.allowedAccountIds.includes(action.targetAccountId)) {
    blockingIssues.push(issue("ACCOUNT_NOT_ALLOWED", "critical", `Account ${action.targetAccountId} is not allowed by policy.`, action.actionId));
  }
  if (hasForbiddenExecutionMaterial(action)) {
    blockingIssues.push(issue("EXECUTION_MATERIAL_FORBIDDEN", "critical", "Dry-run action must not include calldata, signatures, headers, or transaction payloads.", action.actionId));
  }

  if (action.type === "hold") return;

  if (action.type === "reduce_position" || action.type === "close_position") {
    const position = input.positions.find((candidate) => candidate.positionId === action.positionId);
    if (!position) {
      blockingIssues.push(issue("POSITION_NOT_FOUND", "critical", `Position ${action.positionId} was not found.`, action.actionId));
      return;
    }
    checkMarket(position.marketId, action.actionId, input, blockingIssues);
    checkSlippage(action.maxSlippageBps, action.actionId, input, blockingIssues);
    checkPositionLeverage(position.leverage, action.actionId, input, warnings);
    if (action.type === "reduce_position" && action.percentage > input.policy.maxReductionPercentage) {
      revisedActions.push({ ...action, percentage: input.policy.maxReductionPercentage });
      blockingIssues.push(issue("REDUCTION_TOO_LARGE", "high", "Reduction percentage exceeds policy maximum.", action.actionId, "Lower percentage to policy maximum."));
    }
  } else if (action.type === "cancel_order") {
    const order = input.orders.find((candidate) => candidate.orderId === action.orderId);
    if (!order) {
      blockingIssues.push(issue("ORDER_NOT_FOUND", "critical", `Order ${action.orderId} was not found.`, action.actionId));
      return;
    }
    checkMarket(order.marketId, action.actionId, input, blockingIssues);
    checkOrderNotional(order.originalSize, order.limitPrice, action.actionId, input, blockingIssues);
  } else if (action.type === "add_collateral") {
    if (!input.policy.allowedAccountIds.includes(action.accountId)) {
      blockingIssues.push(issue("ACCOUNT_NOT_ALLOWED", "critical", `Collateral target account ${action.accountId} is not allowed.`, action.actionId));
    }
  } else if (action.type === "place_order") {
    checkMarket(action.marketId, action.actionId, input, blockingIssues);
    checkSlippage(action.maxSlippageBps, action.actionId, input, blockingIssues);
    checkOrderNotional(action.size, action.limitPrice ?? marketPrice(action.marketId, input), action.actionId, input, blockingIssues);
    if (!action.reduceOnly || !input.policy.allowIncreaseExposure) {
      blockingIssues.push(
        issue("PLACE_ORDER_BLOCKED", "critical", "place_order remains dry-run only and must be reduceOnly unless later explicitly supported.", action.actionId)
      );
    }
    if (Number(action.leverage) > input.policy.maxLeverage) {
      blockingIssues.push(issue("LEVERAGE_TOO_HIGH", "critical", "Requested leverage exceeds policy maximum.", action.actionId));
    }
  }
}

function checkMarket(marketId: number, actionId: string, input: PerplRiskReviewInput, issues: PerplRiskReviewIssue[]): void {
  if (!input.policy.allowedMarketIds.includes(marketId)) {
    issues.push(issue("MARKET_NOT_ALLOWED", "critical", `Market ${marketId} is not allowed by policy.`, actionId));
  }
  if (!input.markets.some((market) => market.id === marketId)) {
    issues.push(issue("MARKET_NOT_FOUND", "critical", `Market ${marketId} was not found in Perpl context.`, actionId));
  }
}

function checkSlippage(value: number, actionId: string, input: PerplRiskReviewInput, issues: PerplRiskReviewIssue[]): void {
  if (value > input.policy.maxSlippageBps) {
    issues.push(issue("SLIPPAGE_TOO_HIGH", "critical", "Action slippage exceeds policy maximum.", actionId));
  }
}

function checkPositionLeverage(value: string, actionId: string, input: PerplRiskReviewInput, warnings: PerplRiskReviewIssue[]): void {
  const leverage = Number(value);
  if (Number.isFinite(leverage) && leverage > input.policy.maxLeverage) {
    warnings.push(issue("EXISTING_LEVERAGE_ABOVE_POLICY", "medium", "Existing position leverage is above policy maximum; only reductions are considered.", actionId));
  }
}

function checkOrderNotional(
  sizeValue: string | null,
  priceValue: string | null,
  actionId: string,
  input: PerplRiskReviewInput,
  issues: PerplRiskReviewIssue[]
): void {
  const size = decimalOrNull(sizeValue);
  const price = decimalOrNull(priceValue);
  if (!size || !price) return;
  const notional = size.abs().mul(price.abs());
  const maxOrder = new Decimal(input.policy.maxOrderNotionalUsd);
  const maxTotal = new Decimal(input.policy.maxTotalNotionalUsd);
  if (notional.gt(maxOrder)) issues.push(issue("ORDER_NOTIONAL_TOO_HIGH", "critical", "Action notional exceeds maxOrderNotionalUsd.", actionId));
  if (notional.gt(maxTotal)) issues.push(issue("TOTAL_NOTIONAL_TOO_HIGH", "critical", "Action notional exceeds maxTotalNotionalUsd.", actionId));
}

function marketPrice(marketId: number, input: PerplRiskReviewInput): string | null {
  const market = input.markets.find((candidate) => candidate.id === marketId);
  return market?.markPrice ?? market?.midPrice ?? market?.lastPrice ?? null;
}

function hasForbiddenExecutionMaterial(action: PerplAgentAction): boolean {
  const text = JSON.stringify(action);
  return /calldata|signature|signed|txHash|headers|x-api-key|x-api-signature/i.test(text);
}

function issue(code: string, severity: PerplRiskReviewIssue["severity"], message: string, actionId?: string, suggestedFix?: string): PerplRiskReviewIssue {
  return { code, severity, message, actionId, suggestedFix };
}

function summary(decision: PerplAgentRiskReview["decision"], blocking: PerplRiskReviewIssue[], warnings: PerplRiskReviewIssue[]): string {
  if (decision === "approve") return warnings.length ? "Approved with deterministic warnings." : "Approved by deterministic Perpl risk review.";
  if (decision === "revise") return "Strategy needs deterministic revision before dry-run execution.";
  return `Rejected by deterministic Perpl risk review with ${blocking.length} blocking issue(s).`;
}
