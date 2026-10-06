import type { AnalyzeRequest, AnalystResult } from "../types.js";
import { AI_EXPOSURE_WEIGHTS, CASH_ASSETS, clamp, formatPercent } from "../utils.js";
import type { LlmProvider } from "../llm.js";

export async function analyzePortfolio(input: AnalyzeRequest, llm: LlmProvider): Promise<AnalystResult> {
  const totalValue = input.portfolio.reduce((sum, item) => sum + item.valueUsd, 0);
  const weights = Object.fromEntries(
    input.portfolio.map((item) => [item.symbol, totalValue > 0 ? item.valueUsd / totalValue : 0])
  );
  const maxPosition = Math.max(...Object.values(weights), 0);
  const aiExposure = input.portfolio.reduce(
    (sum, item) => sum + item.valueUsd * (AI_EXPOSURE_WEIGHTS[item.symbol] ?? 0),
    0
  ) / Math.max(totalValue, 1);
  const cashBuffer = input.portfolio
    .filter((item) => CASH_ASSETS.has(item.symbol))
    .reduce((sum, item) => sum + item.valueUsd, 0) / Math.max(totalValue, 1);

  const concentrationRisk =
    maxPosition >= 0.45 || aiExposure >= 0.65 ? "High" : maxPosition >= 0.3 || aiExposure >= 0.45 ? "Medium" : "Low";
  const riskScore = Math.round(
    clamp(28 + maxPosition * 60 + aiExposure * 32 - cashBuffer * 15, 1, 99)
  );
  const largest = input.portfolio.reduce((top, item) => (item.valueUsd > top.valueUsd ? item : top), input.portfolio[0]);

  const llmSummary = await llm.generateText(
    "You are AssetPilot Analyst Agent. Return one concise Chinese sentence about portfolio concentration risk. Do not include investment advice.",
    { ...input, riskScore, weights }
  );

  return {
    riskScore,
    aiExposure: formatPercent(aiExposure * 100),
    concentrationRisk,
    summary:
      llmSummary ??
      `${largest.symbol} 占投资组合 ${Math.round((weights[largest.symbol] ?? 0) * 100)}%，AI/科技敞口约 ${formatPercent(
        aiExposure * 100
      )}，集中风险为 ${concentrationRisk}。`
  };
}
