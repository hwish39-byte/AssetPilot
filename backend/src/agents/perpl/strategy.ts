import type { PerplMarket, PerplOrder, PerplPosition } from "../../perpl/types.js";
import type { PerplPositionRisk, PerplRiskIssue, PerplRiskSnapshot } from "../../risk/perplRiskTypes.js";
import { perplStrategyPrompt } from "./prompts.js";
import type {
  PerplAgentAction,
  PerplAgentPolicy,
  PerplAnalystOutput,
  PerplStrategyInput,
  PerplStrategyOutput
} from "./types.js";
import { validateStrategyOutput } from "./validation.js";

export async function generatePerplStrategy(input: PerplStrategyInput): Promise<PerplStrategyOutput> {
  const fallback = deterministicStrategy(input);
  const llmCandidate = await input.llm.generateJson<PerplStrategyOutput>(perplStrategyPrompt, llmPayload(input));
  const llmStrategy = sanitizeLlmStrategy(llmCandidate, input);
  return llmStrategy ?? fallback;
}

export function deterministicStrategy(input: PerplStrategyInput): PerplStrategyOutput {
  const validationErrors: string[] = [];
  const baseAssumptions = [
    "Strategy is app-layer dry-run guidance only.",
    "No Perpl orders or transactions are submitted by this workflow."
  ];

  if (input.riskSnapshot.noExposure) {
    return holdStrategy("No open Perpl exposure was detected.", "hold due to no exposure", input);
  }

  if (input.riskSnapshot.scoreCoveragePercent < 60 || input.analyst.dataQualityConcerns.length > 0) {
    return {
      status: "clarification_required",
      objective: "Pause Perpl action because risk data coverage is insufficient.",
      actions: [holdAction(input, "Perpl risk data coverage is insufficient for an automated recommendation.")],
      expectedRiskDirection: "neutral",
      assumptions: baseAssumptions,
      clarificationQuestions: ["Please refresh Perpl data or provide missing read-only data before generating a risk-reducing plan."],
      validationErrors
    };
  }

  const riskyOrder = firstAllowedOrder(input);
  if (riskyOrder && hasIssue(input.riskSnapshot, "OPEN_ORDER_EXPOSURE")) {
    return generatedStrategy("Cancel open Perpl order exposure.", [cancelOrderAction(riskyOrder, input)], baseAssumptions);
  }

  const target = selectRiskyPosition(input.riskSnapshot.positions, input.policy);
  if (target) {
    const action = buildPositionAction(target, input);
    if (action) {
      return generatedStrategy(`Reduce Perpl ${target.marketSymbol ?? `market ${target.marketId}`} exposure.`, [action], baseAssumptions);
    }
  }

  if (wantsCollateral(input.userGoal) && input.policy.allowedActions.includes("add_collateral")) {
    const accountId = input.riskSnapshot.accountIds.find((id) => input.policy.allowedAccountIds.includes(id));
    if (accountId !== undefined) {
      return generatedStrategy(
        "Improve collateral buffer without changing directional exposure.",
        [
          {
            actionId: "act_1_add_collateral",
            type: "add_collateral",
            targetAccountId: accountId,
            accountId,
            amount: "1",
            rationale: "User goal mentions collateral and adding collateral can reduce effective leverage in simulation.",
            expectedEffects: ["Increase simulated account balance.", "Reduce effective leverage estimate."],
            confidence: 0.55,
            assumptions: [...baseAssumptions, "Amount is a placeholder for dry-run review and must be chosen by the user later."]
          }
        ],
        baseAssumptions
      );
    }
  }

  return holdStrategy("No policy-compliant risk-reducing Perpl action was available.", "hold because no safe action was selected", input);
}

function sanitizeLlmStrategy(candidate: PerplStrategyOutput | null, input: PerplStrategyInput): PerplStrategyOutput | null {
  if (!candidate) return null;
  const errors = validateStrategyOutput(candidate);
  if (errors.length > 0) return null;
  if (candidate.expectedRiskDirection === "increase") return null;
  if (candidate.actions.length > input.policy.maxActionsPerStrategy) return null;
  if (candidate.actions.some((action) => !input.policy.allowedActions.includes(action.type))) return null;
  if (candidate.actions.some((action) => !input.policy.allowedAccountIds.includes(action.targetAccountId))) return null;
  if (candidate.actions.some((action) => referencesUnknownTarget(action, input))) return null;
  if (candidate.actions.some((action) => action.type === "place_order" && (!action.reduceOnly || !input.policy.allowIncreaseExposure))) return null;
  return {
    status: candidate.status,
    objective: candidate.objective.slice(0, 300),
    actions: candidate.actions.slice(0, input.policy.maxActionsPerStrategy),
    expectedRiskDirection: candidate.expectedRiskDirection,
    assumptions: candidate.assumptions.slice(0, 8),
    clarificationQuestions: candidate.clarificationQuestions.slice(0, 5),
    validationErrors: candidate.validationErrors
  };
}

function llmPayload(input: PerplStrategyInput): unknown {
  return {
    userGoal: input.userGoal,
    policy: input.policy,
    analyst: input.analyst,
    riskSnapshot: {
      riskLevel: input.riskSnapshot.riskLevel,
      score: input.riskSnapshot.score,
      scoreCoveragePercent: input.riskSnapshot.scoreCoveragePercent,
      accountIds: input.riskSnapshot.accountIds,
      walletMetrics: input.riskSnapshot.walletMetrics,
      positions: input.riskSnapshot.positions,
      issues: input.riskSnapshot.issues
    },
    positions: input.positions.map((position) => ({
      positionId: position.positionId,
      accountId: position.accountId,
      marketId: position.marketId,
      side: position.side,
      size: position.size,
      leverage: position.leverage
    })),
    orders: input.orders.map((order) => ({
      orderId: order.orderId,
      accountId: order.accountId,
      marketId: order.marketId,
      originalSize: order.originalSize,
      limitPrice: order.limitPrice,
      leverage: order.leverage
    }))
  };
}

function generatedStrategy(objective: string, actions: PerplAgentAction[], assumptions: string[]): PerplStrategyOutput {
  return {
    status: "generated",
    objective,
    actions,
    expectedRiskDirection: actions.every((action) => action.type === "hold") ? "neutral" : "decrease",
    assumptions,
    clarificationQuestions: [],
    validationErrors: []
  };
}

function holdStrategy(objective: string, reason: string, input: PerplStrategyInput): PerplStrategyOutput {
  return generatedStrategy(objective, [holdAction(input, reason)], [
    "Strategy is app-layer dry-run guidance only.",
    "No Perpl orders or transactions are submitted by this workflow."
  ]);
}

function holdAction(input: Pick<PerplStrategyInput, "riskSnapshot">, reason: string): PerplAgentAction {
  return {
    actionId: "act_1_hold",
    type: "hold",
    targetAccountId: input.riskSnapshot.accountIds[0] ?? 0,
    reason,
    rationale: reason,
    expectedEffects: ["No simulated portfolio change."],
    confidence: 0.7,
    assumptions: ["Holding avoids adding exposure."]
  };
}

function cancelOrderAction(order: PerplOrder, input: PerplStrategyInput): PerplAgentAction {
  return {
    actionId: `act_1_cancel_${cleanId(order.orderId)}`,
    type: "cancel_order",
    targetAccountId: order.accountId,
    orderId: order.orderId,
    rationale: "Canceling an open order can remove latent exposure without placing a new trade.",
    expectedEffects: ["Remove the open order from simulated risk.", "Avoid increasing directional exposure."],
    confidence: 0.78,
    assumptions: input.analyst.recommendedObjectives
  };
}

function buildPositionAction(position: PerplPositionRisk, input: PerplStrategyInput): PerplAgentAction | null {
  const percentage = Math.min(input.policy.maxReductionPercentage, position.leverage === "0" ? 0.25 : input.riskSnapshot.riskLevel === "critical" ? 0.5 : 0.25);
  if (percentage <= 0) return null;
  const base = {
    targetAccountId: position.accountId,
    rationale: "Selected the highest-risk existing position and only reduces exposure.",
    expectedEffects: ["Reduce gross position notional.", "Lower concentration or leverage pressure in simulation."],
    confidence: input.riskSnapshot.riskLevel === "critical" ? 0.82 : 0.72,
    assumptions: input.analyst.recommendedObjectives
  };

  if (input.policy.allowedActions.includes("reduce_position")) {
    return {
      ...base,
      actionId: `act_1_reduce_${cleanId(position.positionId)}`,
      type: "reduce_position",
      positionId: position.positionId,
      percentage,
      maxSlippageBps: input.policy.maxSlippageBps
    };
  }

  if (input.policy.allowedActions.includes("close_position") && input.riskSnapshot.riskLevel === "critical") {
    return {
      ...base,
      actionId: `act_1_close_${cleanId(position.positionId)}`,
      type: "close_position",
      positionId: position.positionId,
      maxSlippageBps: input.policy.maxSlippageBps
    };
  }

  return null;
}

function selectRiskyPosition(positions: PerplPositionRisk[], policy: PerplAgentPolicy): PerplPositionRisk | null {
  return [...positions]
    .filter((position) => policy.allowedAccountIds.includes(position.accountId))
    .filter((position) => policy.allowedMarketIds.includes(position.marketId))
    .sort((left, right) => positionRank(right) - positionRank(left))[0] ?? null;
}

function positionRank(position: PerplPositionRisk): number {
  return (
    Number(position.leverage) * 10 +
    (position.concentrationShare ?? 0) * 100 +
    Math.abs(position.fundingRateRaw ?? 0) / 100 +
    (position.liquidationDistancePercent === null ? 10 : Math.max(0, 20 - position.liquidationDistancePercent))
  );
}

function firstAllowedOrder(input: PerplStrategyInput): PerplOrder | null {
  return (
    input.orders.find((order) => input.policy.allowedAccountIds.includes(order.accountId) && input.policy.allowedMarketIds.includes(order.marketId)) ??
    null
  );
}

function referencesUnknownTarget(action: PerplAgentAction, input: Pick<PerplStrategyInput, "positions" | "orders" | "markets">): boolean {
  if (action.type === "reduce_position" || action.type === "close_position") {
    return !input.positions.some((position) => position.positionId === action.positionId);
  }
  if (action.type === "cancel_order") return !input.orders.some((order) => order.orderId === action.orderId);
  if (action.type === "place_order") return !input.markets.some((market) => market.id === action.marketId);
  return false;
}

function hasIssue(snapshot: PerplRiskSnapshot, code: PerplRiskIssue["code"]): boolean {
  return snapshot.issues.some((issue) => issue.code === code);
}

function wantsCollateral(goal: string): boolean {
  return /collateral|margin|deposit|保证金|抵押|追加/i.test(goal);
}

function cleanId(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
}
