import type {
  AnalyzeRequest,
  AnalystAgentOutput,
  AnalystResult,
  PortfolioItem,
  RiskContext,
  RiskFactor,
  StrategyConstraint
} from "../types.js";
import { AI_EXPOSURE_WEIGHTS, CASH_ASSETS, clamp, formatPercent, getPrices } from "../utils.js";
import type { LlmProvider } from "../llm.js";

export async function analyzePortfolio(input: AnalyzeRequest, llm: LlmProvider): Promise<AnalystResult> {
  const analysis = buildPortfolioAnalysis(input);
  const summary = await buildSummary(input, llm, analysis);

  return {
    riskScore: analysis.riskScore,
    aiExposure: formatPercent(analysis.aiExposure * 100),
    concentrationRisk: analysis.concentrationRisk,
    summary
  };
}

export async function analyzePortfolioV2(input: AnalyzeRequest, llm: LlmProvider): Promise<AnalystAgentOutput> {
  const analysis = buildPortfolioAnalysis(input);
  const summary = await buildSummary(input, llm, analysis);
  const riskFactors = buildRiskFactors(input, analysis);

  return {
    portfolio_snapshot: {
      total_value_usd: analysis.totalValue,
      asset_allocation: analysis.assetAllocation,
      chain_exposure: { "monad-testnet": 1 },
      protocol_exposure: { wallet: 1 },
      stablecoin_ratio: analysis.stablecoinRatio,
      leverage_ratio: null,
      largest_position: analysis.largestPosition
        ? {
            symbol: analysis.largestPosition.symbol,
            value_usd: analysis.largestPosition.valueUsd,
            weight: analysis.largestPositionWeight
          }
        : null
    },
    risk_context: {
      risk_level: riskLevelForScore(analysis.riskScore),
      risk_factors: riskFactors,
      constraints_for_strategy: buildStrategyConstraints(input, analysis, riskFactors)
    },
    summary
  };
}

interface PortfolioAnalysis {
  totalValue: number;
  assetAllocation: Record<string, number>;
  maxPosition: number;
  largestPosition: PortfolioItem | null;
  largestPositionWeight: number;
  aiExposure: number;
  stablecoinRatio: number;
  concentrationRisk: AnalystResult["concentrationRisk"];
  riskScore: number;
}

function buildPortfolioAnalysis(input: AnalyzeRequest): PortfolioAnalysis {
  const totalValue = input.portfolio.reduce((sum, item) => sum + item.valueUsd, 0);
  const assetAllocation = Object.fromEntries(
    input.portfolio.map((item) => [item.symbol, totalValue > 0 ? item.valueUsd / totalValue : 0])
  );
  const maxPosition = Math.max(...Object.values(assetAllocation), 0);
  const aiExposure = input.portfolio.reduce(
    (sum, item) => sum + item.valueUsd * (AI_EXPOSURE_WEIGHTS[item.symbol] ?? 0),
    0
  ) / Math.max(totalValue, 1);
  const stablecoinRatio = input.portfolio
    .filter((item) => CASH_ASSETS.has(item.symbol))
    .reduce((sum, item) => sum + item.valueUsd, 0) / Math.max(totalValue, 1);

  const concentrationRisk =
    maxPosition >= 0.45 || aiExposure >= 0.65 ? "High" : maxPosition >= 0.3 || aiExposure >= 0.45 ? "Medium" : "Low";
  const riskScore = Math.round(
    clamp(28 + maxPosition * 60 + aiExposure * 32 - stablecoinRatio * 15, 1, 99)
  );
  const largestPosition = input.portfolio.length
    ? input.portfolio.reduce((top, item) => (item.valueUsd > top.valueUsd ? item : top), input.portfolio[0])
    : null;

  return {
    totalValue,
    assetAllocation,
    maxPosition,
    largestPosition,
    largestPositionWeight: largestPosition ? assetAllocation[largestPosition.symbol] ?? 0 : 0,
    aiExposure,
    stablecoinRatio,
    concentrationRisk,
    riskScore
  };
}

async function buildSummary(input: AnalyzeRequest, llm: LlmProvider, analysis: PortfolioAnalysis): Promise<string> {
  const llmSummary = await llm.generateText(
    "You are AssetPilot Analyst Agent. Return one concise Chinese sentence about portfolio concentration risk. Do not include investment advice.",
    { ...input, riskScore: analysis.riskScore, weights: analysis.assetAllocation }
  );

  if (llmSummary) return llmSummary;

  const largestSymbol = analysis.largestPosition?.symbol ?? "N/A";
  return `${largestSymbol} 占投资组合 ${Math.round(analysis.largestPositionWeight * 100)}%，AI/科技敞口约 ${formatPercent(
    analysis.aiExposure * 100
  )}，集中风险为 ${analysis.concentrationRisk}。`;
}

function buildRiskFactors(input: AnalyzeRequest, analysis: PortfolioAnalysis): RiskFactor[] {
  const riskFactors: RiskFactor[] = [];

  if (analysis.largestPosition && analysis.largestPositionWeight >= 0.45) {
    riskFactors.push({
      factor_id: "concentration_risk",
      category: "portfolio_concentration",
      severity: analysis.largestPositionWeight >= 0.6 ? "critical" : "high",
      description: "Largest position concentration is elevated.",
      evidence: [`${analysis.largestPosition.symbol} weight is ${formatPercent(analysis.largestPositionWeight * 100)}`],
      affected_assets: [analysis.largestPosition.symbol]
    });
  }

  if (analysis.aiExposure >= 0.65) {
    riskFactors.push({
      factor_id: "ai_exposure_risk",
      category: "sector_exposure",
      severity: analysis.aiExposure >= 0.8 ? "critical" : "high",
      description: "AI exposure is elevated.",
      evidence: [`AI exposure is ${formatPercent(analysis.aiExposure * 100)}`]
    });
  }

  if (analysis.stablecoinRatio < 0.15) {
    riskFactors.push({
      factor_id: "low_stablecoin_buffer",
      category: "liquidity_buffer",
      severity: analysis.stablecoinRatio < 0.08 ? "high" : "medium",
      description: "Stablecoin buffer is below target.",
      evidence: [`Stablecoin ratio is ${formatPercent(analysis.stablecoinRatio * 100)}`],
      affected_assets: input.portfolio.filter((item) => CASH_ASSETS.has(item.symbol)).map((item) => item.symbol)
    });
  }

  const prices = getPrices(input.marketSnapshot);
  const missingSymbols = input.portfolio
    .map((item) => item.symbol)
    .filter((symbol) => prices[symbol] === undefined);
  if (missingSymbols.length > 0) {
    riskFactors.push({
      factor_id: "missing_market_data",
      category: "market_data",
      severity: "medium",
      description: "Market snapshot is missing prices for portfolio assets.",
      evidence: [`Missing market data for ${missingSymbols.join(", ")}`],
      affected_assets: missingSymbols
    });
  }

  return riskFactors;
}

function buildStrategyConstraints(
  input: AnalyzeRequest,
  analysis: PortfolioAnalysis,
  riskFactors: RiskFactor[]
): StrategyConstraint[] {
  const constraints: StrategyConstraint[] = [];
  const concentrationRisk = riskFactors.find((factor) => factor.factor_id === "concentration_risk");

  if (concentrationRisk?.severity === "high" || concentrationRisk?.severity === "critical") {
    constraints.push({
      constraint: "max_single_asset_ratio <= 0.40",
      reason: "Largest position concentration is high",
      hard: false
    });
  }

  if (analysis.stablecoinRatio < 0.15) {
    constraints.push({
      constraint: "stablecoin_ratio_after >= 0.15",
      reason: "Current stablecoin buffer is low",
      hard: false
    });
  }

  if (blocksBuyingMTsla(input.userGoal)) {
    constraints.push({
      constraint: "do_not_buy mTSLA",
      reason: "User explicitly blocked mTSLA",
      hard: true
    });
  }

  return constraints;
}

function riskLevelForScore(riskScore: number): RiskContext["risk_level"] {
  if (riskScore >= 85) return "critical";
  if (riskScore >= 70) return "high";
  if (riskScore >= 45) return "medium";
  return "low";
}

function blocksBuyingMTsla(userGoal: string): boolean {
  const normalizedGoal = userGoal.toLowerCase();
  return (
    userGoal.includes("不能买 mTSLA") ||
    userGoal.includes("不要买 mTSLA") ||
    normalizedGoal.includes("do not buy mtsla") ||
    normalizedGoal.includes("don't buy mtsla")
  );
}
