import type { PerplAgentAction, PerplAgentRiskReview, PerplExecutionDescriptor, PerplExecutionOutput, PerplStrategyOutput } from "./types.js";

export function preparePerplDryRunExecution(strategy: PerplStrategyOutput, review: PerplAgentRiskReview): PerplExecutionOutput {
  if (review.decision !== "approve") {
    return {
      status: "blocked",
      descriptors: [],
      reason: review.humanReadableSummary
    };
  }

  const approved = new Set(review.approvedActionIds);
  const descriptors = strategy.actions.filter((action) => approved.has(action.actionId)).map(describeAction);

  return {
    status: "dry_run_prepared",
    descriptors,
    reason: "Dry-run descriptors prepared. No Perpl transaction, order, calldata, signature, or API trading call was produced."
  };
}

function describeAction(action: PerplAgentAction): PerplExecutionDescriptor {
  return {
    actionId: action.actionId,
    actionType: action.type,
    protocol: "perpl",
    network: "monad-testnet",
    accountId: action.targetAccountId,
    marketId: marketIdOf(action),
    positionId: "positionId" in action ? action.positionId : null,
    orderId: "orderId" in action ? action.orderId : null,
    humanReadable: humanReadable(action),
    expectedRiskEffect: action.expectedEffects.join(" "),
    requiresUserConfirmation: true,
    signingRequiredLater: action.type !== "hold",
    executionStatus: "not_submitted",
    calldata: null,
    signature: null,
    txHash: null,
    orderIdAfterExecution: null
  };
}

function marketIdOf(action: PerplAgentAction): number | null {
  if (action.type === "place_order") return action.marketId;
  return null;
}

function humanReadable(action: PerplAgentAction): string {
  if (action.type === "reduce_position") return `Dry-run reduce ${action.positionId} by ${Math.round(action.percentage * 10000) / 100}%.`;
  if (action.type === "close_position") return `Dry-run close position ${action.positionId}.`;
  if (action.type === "cancel_order") return `Dry-run cancel order ${action.orderId}.`;
  if (action.type === "add_collateral") return `Dry-run add ${action.amount} collateral to account ${action.accountId}.`;
  if (action.type === "place_order") return `Dry-run place reduceOnly=${action.reduceOnly} ${action.side} order on market ${action.marketId}.`;
  return `Hold: ${action.reason}`;
}
