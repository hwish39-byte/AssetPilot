import type { ContractCall, ExecutionSummaryRequest, RejectionReason } from "../types.js";

const refusalSummary: Record<RejectionReason, string> = {
  SELL_TOKEN_NOT_ALLOWED: "策略已被拒绝，因为卖出资产不在允许列表中。",
  BUY_TOKEN_NOT_ALLOWED: "策略已被拒绝，因为目标资产不在允许列表中。",
  SELL_TOKEN_BLOCKED: "策略已被拒绝，因为卖出资产在黑名单中。",
  BUY_TOKEN_BLOCKED: "策略已被拒绝，因为目标资产在黑名单中。",
  MAX_SPEND_EXCEEDED: "策略已被拒绝，因为总交易金额超过策略上限。",
  MAX_SINGLE_TRADE_EXCEEDED: "策略已被拒绝，因为单笔交易金额超过策略上限。",
  SLIPPAGE_TOO_HIGH: "策略已被拒绝，因为滑点保护不足。"
};

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
