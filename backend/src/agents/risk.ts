import type { LlmProvider } from "../llm.js";
import type { RejectionReason, ReviewRiskRequest, RiskReview, StrategyAction } from "../types.js";
import { minBuyAmount, totalSellAmount } from "../utils.js";

const rejectionDetails: Record<RejectionReason, string> = {
  SELL_TOKEN_NOT_ALLOWED: "策略尝试卖出不在白名单中的资产。",
  BUY_TOKEN_NOT_ALLOWED: "策略尝试买入不在白名单中的资产。",
  SELL_TOKEN_BLOCKED: "策略尝试卖出黑名单资产。",
  BUY_TOKEN_BLOCKED: "策略尝试买入黑名单资产。",
  MAX_SPEND_EXCEEDED: "策略总交易金额超过策略上限。",
  MAX_SINGLE_TRADE_EXCEEDED: "策略中的单笔交易金额超过上限。",
  SLIPPAGE_TOO_HIGH: "策略的 minBuyAmount 低于策略允许的最小滑点保护。"
};

export async function reviewRisk(
  input: ReviewRiskRequest,
  llm: LlmProvider,
  options: { skipLlmNotes?: boolean } = {}
): Promise<RiskReview> {
  const rejection = firstRejection(input);
  if (rejection) {
    return {
      status: "REJECTED",
      reason: rejection,
      details: rejectionDetails[rejection]
    };
  }

  const llmNotes = options.skipLlmNotes
    ? null
    : await llm.generateJson<string[]>(
        "You are AssetPilot Risk Agent. Return a JSON array of three short Chinese approval notes. No markdown.",
        input
      );

  return {
    status: "APPROVED",
    riskScoreBefore: input.analystResult.riskScore,
    riskScoreAfter: input.strategy.expectedImpact.riskScoreAfter,
    notes:
      Array.isArray(llmNotes) && llmNotes.every((note) => typeof note === "string")
        ? llmNotes
        : ["mNVDA 集中度降低", "AI 敞口降低", "USDC 缓冲提高"],
    warnings: []
  };
}

function firstRejection(input: ReviewRiskRequest): RejectionReason | null {
  for (const action of input.strategy.actions) {
    const assetRejection = checkAssets(action, input.policy.allowedAssets, input.policy.blockedAssets);
    if (assetRejection) return assetRejection;
  }

  if (totalSellAmount(input.strategy.actions) > input.policy.maxSpendUsd) return "MAX_SPEND_EXCEEDED";

  for (const action of input.strategy.actions) {
    if (action.sellAmountUsd > input.policy.maxSingleTradeUsd) return "MAX_SINGLE_TRADE_EXCEEDED";
    const minAllowed = minBuyAmount(action.expectedBuyAmount, input.policy.maxSlippageBps);
    if (action.minBuyAmount < minAllowed) return "SLIPPAGE_TOO_HIGH";
  }

  return null;
}

function checkAssets(action: StrategyAction, allowedAssets: string[], blockedAssets: string[]): RejectionReason | null {
  if (!allowedAssets.includes(action.sellToken)) return "SELL_TOKEN_NOT_ALLOWED";
  if (!allowedAssets.includes(action.buyToken)) return "BUY_TOKEN_NOT_ALLOWED";
  if (blockedAssets.includes(action.sellToken)) return "SELL_TOKEN_BLOCKED";
  if (blockedAssets.includes(action.buyToken)) return "BUY_TOKEN_BLOCKED";
  return null;
}
