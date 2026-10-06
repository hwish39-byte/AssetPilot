import type { GenerateStrategyRequest, Strategy, StrategyAction } from "../types.js";
import {
  expectedBuyAmountFor,
  getPrices,
  getSnapshotHash,
  minBuyAmount,
  parsePercent,
  round
} from "../utils.js";
import type { LlmProvider } from "../llm.js";
import { assertStrategy, validateStrategy } from "../validation.js";
import { reviewRisk } from "./risk.js";

export async function generateStrategy(input: GenerateStrategyRequest, llm: LlmProvider): Promise<Strategy> {
  const llmStrategy = await llm.generateJson<Strategy>(
    [
      "You are AssetPilot Strategy Agent.",
      "Return only stable JSON matching the AssetPilot strategy schema.",
      "Respect policyDraft exactly: no blocked assets, only allowed assets, max spend, max single trade, and max slippage.",
      "Do not add commentary."
    ].join(" "),
    input
  );

  if (llmStrategy && validateStrategy(llmStrategy).length === 0) {
    const review = reviewRisk({ strategy: llmStrategy, policy: input.policyDraft, analystResult: input.analystResult }, llm, {
      skipLlmNotes: true
    });
    if ((await review).status === "APPROVED") return assertStrategy(llmStrategy);
  }

  return fallbackStrategy(input);
}

function fallbackStrategy(input: GenerateStrategyRequest): Strategy {
  const prices = getPrices(input.marketSnapshot);
  const policy = input.policyDraft;
  const userGoal = input.userGoal.toLowerCase();
  const wantsAiReduction = userGoal.includes("降低 ai") || userGoal.includes("集中风险") || userGoal.includes("concentration");
  const actions: StrategyAction[] = [];
  let remainingSpend = policy.maxSpendUsd;

  const addAction = (actionType: "SELL" | "BUY", sellToken: string, buyToken: string, preferredUsd: number) => {
    if (remainingSpend <= 0) return;
    if (!policy.allowedAssets.includes(sellToken) || !policy.allowedAssets.includes(buyToken)) return;
    if (policy.blockedAssets.includes(sellToken) || policy.blockedAssets.includes(buyToken)) return;
    const sellAmountUsd = round(Math.min(preferredUsd, policy.maxSingleTradeUsd, remainingSpend), 2);
    if (sellAmountUsd <= 0) return;
    const expectedBuyAmount = expectedBuyAmountFor(sellAmountUsd, buyToken, prices);
    actions.push({
      actionType,
      sellToken,
      buyToken,
      sellAmountUsd,
      expectedBuyAmount,
      minBuyAmount: minBuyAmount(expectedBuyAmount, policy.maxSlippageBps)
    });
    remainingSpend = round(remainingSpend - sellAmountUsd, 2);
  };

  if (wantsAiReduction) {
    addAction("SELL", "mNVDA", "USDC", 300);
    addAction("BUY", "USDC", "mSPY", 200);
  }

  if (actions.length === 0) {
    const sellToken = policy.allowedAssets.find((asset) => asset !== "USDC" && !policy.blockedAssets.includes(asset)) ?? "mNVDA";
    const buyToken = policy.allowedAssets.includes("USDC") && !policy.blockedAssets.includes("USDC") ? "USDC" : policy.allowedAssets[0];
    addAction("SELL", sellToken, buyToken, Math.min(100, policy.maxSpendUsd, policy.maxSingleTradeUsd));
  }

  const riskBefore = input.analystResult.riskScore;
  const riskAfter = Math.max(1, riskBefore - (actions.length > 1 ? 21 : 12));
  const aiBefore = parsePercent(input.analystResult.aiExposure);
  const aiAfter = Math.max(0, aiBefore - (actions.some((action) => action.sellToken === "mNVDA") ? 18 : 8));

  return {
    goal: wantsAiReduction ? "降低 AI 股票集中风险" : "按用户目标调整投资组合",
    marketSnapshotHash: getSnapshotHash(input.marketSnapshot),
    actions,
    expectedImpact: {
      riskScoreBefore: riskBefore,
      riskScoreAfter: riskAfter,
      aiExposureBefore: input.analystResult.aiExposure,
      aiExposureAfter: `${Math.round(aiAfter)}%`,
      cashBufferBefore: "8%",
      cashBufferAfter: actions.some((action) => action.buyToken === "USDC") ? "15%" : "10%"
    }
  };
}
