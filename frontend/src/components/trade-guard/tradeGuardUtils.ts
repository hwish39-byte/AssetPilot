import { formatLeverage, formatPercent, formatUsdValue } from "@/lib/format";
import type {
  PerplAgentPolicy,
  PerplAgentWorkflowResponse,
  PerplExecutionDescriptor,
  PerplMarket,
  PerplOrder,
  PerplPosition,
  PerplRiskSnapshot
} from "@/types/perpl";

export const goalLimit = 500;
export const safeDefaultActions: PerplAgentPolicy["allowedActions"] = ["reduce_position", "close_position", "cancel_order", "hold"];

export interface LocalConfirmation {
  status: "locally_confirmed";
  confirmedAt: string;
  workflowId: string;
}

export function buildDefaultPolicy(risk: PerplRiskSnapshot | undefined, markets: PerplMarket[] | undefined): PerplAgentPolicy {
  return {
    allowedAccountIds: risk?.accountIds ?? [],
    allowedMarketIds: markets?.map((market) => market.id) ?? [],
    allowedActions: safeDefaultActions,
    maxActionsPerStrategy: 2,
    maxLeverage: 5,
    maxOrderNotionalUsd: "10000",
    maxTotalNotionalUsd: "15000",
    maxSlippageBps: 100,
    maxReductionPercentage: 0.25,
    allowIncreaseExposure: false,
    requireSimulation: true,
    requireRiskImprovement: true,
    minimumRiskScoreImprovement: 0,
    expiresAt: expiresInMinutes(30)
  };
}

export function expiresInMinutes(minutes: number) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString();
}

export function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? expiresInMinutes(30) : date.toISOString();
}

export function validateGoal(goal: string) {
  const trimmed = goal.trim();
  if (!trimmed) return "Enter a risk management goal.";
  if (trimmed.length > goalLimit) return `Goal must be ${goalLimit} characters or fewer.`;
  if (/api\s*key|secret|signature|x-api-key|x-api-signature|private key/i.test(trimmed)) {
    return "Goal cannot include API keys, secrets, signatures, or private-key material.";
  }
  return null;
}

export function validatePolicy(policy: PerplAgentPolicy) {
  if (policy.allowedAccountIds.length === 0) return "Select at least one monitored account.";
  if (policy.allowedMarketIds.length === 0) return "Select at least one Perpl market.";
  if (policy.allowedActions.length === 0) return "Select at least one allowed action.";
  if (policy.maxActionsPerStrategy < 1 || policy.maxActionsPerStrategy > 5) return "Max actions must be from 1 to 5.";
  if (policy.maxReductionPercentage <= 0 || policy.maxReductionPercentage >= 1) return "Reduction percentage must be greater than 0 and less than 100%.";
  if (Date.parse(policy.expiresAt) <= Date.now()) return "Policy is expired.";
  return null;
}

export function confirmationEligibility(result: PerplAgentWorkflowResponse | null, policy: PerplAgentPolicy, risk: PerplRiskSnapshot | undefined) {
  if (!result) return { eligible: false, reason: "Run the Agent workflow first." };
  if (result.riskReview.decision !== "approve") return { eligible: false, reason: "System risk decision is not approve." };
  if (result.execution.status !== "dry_run_prepared") return { eligible: false, reason: "Dry-run execution plan is not prepared." };
  if (Date.parse(policy.expiresAt) <= Date.now()) return { eligible: false, reason: "Policy expired. Rerun with a fresh policy." };
  if (risk && riskFingerprint(risk) !== riskFingerprint(result.riskSnapshot)) return { eligible: false, reason: "Current risk data changed after this workflow." };
  const unsafe = result.execution.descriptors.find(hasUnsafeExecutionMaterial);
  if (unsafe) return { eligible: false, reason: `Critical safety error on ${unsafe.actionId}: execution material was returned.` };
  if (result.execution.descriptors.some((descriptor) => descriptor.requiresUserConfirmation !== true)) {
    return { eligible: false, reason: "Every descriptor must require user confirmation." };
  }
  return { eligible: true, reason: "Ready for local confirmation." };
}

export function riskFingerprint(snapshot: PerplRiskSnapshot) {
  return JSON.stringify({
    accounts: snapshot.accountIds,
    score: snapshot.score,
    riskLevel: snapshot.riskLevel,
    coverage: snapshot.scoreCoveragePercent,
    positions: snapshot.walletMetrics.openPositionCount,
    orders: snapshot.walletMetrics.openOrderCount,
    gross: snapshot.walletMetrics.grossPositionNotional,
    locked: snapshot.walletMetrics.totalLockedBalance,
    leverage: snapshot.walletMetrics.effectiveLeverageEstimate,
    largest: snapshot.walletMetrics.largestPositionShare,
    issueCodes: snapshot.issues.map((issue) => issue.code).sort()
  });
}

export function hasUnsafeExecutionMaterial(descriptor: PerplExecutionDescriptor) {
  const record = descriptor as unknown as { calldata?: unknown; signature?: unknown; txHash?: unknown };
  return record.calldata !== null || record.signature !== null || record.txHash !== null || descriptor.executionStatus !== "not_submitted";
}

export function findMarket(markets: PerplMarket[], marketId: number | null | undefined) {
  return markets.find((market) => market.id === marketId);
}

export function findPosition(positions: PerplPosition[], positionId: string | null | undefined) {
  return positions.find((position) => position.positionId === positionId);
}

export function findOrder(orders: PerplOrder[], orderId: string | null | undefined) {
  return orders.find((order) => order.orderId === orderId);
}

export function metricRows(snapshot: PerplRiskSnapshot) {
  return [
    { label: "Gross exposure", value: formatUsdValue(snapshot.walletMetrics.grossPositionNotional, { compact: true, estimated: true }) },
    { label: "Effective leverage", value: formatLeverage(snapshot.walletMetrics.effectiveLeverageEstimate) },
    { label: "Largest position", value: formatPercent(snapshot.walletMetrics.largestPositionShare) },
    { label: "Locked balance", value: formatPercent(snapshot.walletMetrics.lockedBalanceRatio) },
    { label: "Open positions", value: String(snapshot.walletMetrics.openPositionCount) },
    { label: "Open orders", value: String(snapshot.walletMetrics.openOrderCount) }
  ];
}
