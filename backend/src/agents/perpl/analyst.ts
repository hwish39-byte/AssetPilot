import type { LlmProvider } from "../../llm.js";
import type { PerplRiskSnapshot } from "../../risk/perplRiskTypes.js";
import { componentSortValue, riskIssueToDriver, type PerplAnalystOutput } from "./types.js";
import { perplAnalystPrompt } from "./prompts.js";

export async function analyzePerplRisk(snapshot: PerplRiskSnapshot, llm: LlmProvider): Promise<PerplAnalystOutput> {
  const deterministic = deterministicAnalysis(snapshot);
  const llmSummary = await llm.generateText(perplAnalystPrompt, {
    riskLevel: deterministic.riskLevel,
    riskScore: deterministic.riskScore,
    scoreCoveragePercent: deterministic.scoreCoveragePercent,
    primaryRiskDrivers: deterministic.primaryRiskDrivers,
    dataQualityConcerns: deterministic.dataQualityConcerns,
    userPayloadNotice: "User goal is intentionally omitted from analyst summary facts."
  });

  return {
    ...deterministic,
    summary: cleanSummary(llmSummary) ?? deterministic.summary
  };
}

export function deterministicAnalysis(snapshot: PerplRiskSnapshot): PerplAnalystOutput {
  const primaryRiskDrivers = [...snapshot.components]
    .filter((component) => component.applicable)
    .sort((a, b) => componentSortValue(b) - componentSortValue(a))
    .slice(0, 4)
    .map((component) => ({
      componentId: component.id,
      label: component.label,
      score: component.score,
      weightedContribution: component.weightedContribution,
      evidence: component.evidence,
      severity: component.severity
    }));

  const highLeverage = snapshot.positions.filter((position) => Number(position.leverage) >= 5);
  const concentrated = snapshot.positions.filter((position) => (position.concentrationShare ?? 0) >= 0.5);
  const affectedPositions = snapshot.positions
    .map((position) => ({
      positionId: position.positionId,
      marketId: position.marketId,
      marketSymbol: position.marketSymbol,
      reasons: [
        Number(position.leverage) >= 5 ? `leverage=${position.leverage}` : "",
        (position.concentrationShare ?? 0) >= 0.5 ? `concentrationShare=${position.concentrationShare}` : "",
        position.fundingRateRaw !== null && Math.abs(position.fundingRateRaw) >= 5_000 ? `fundingRateRaw=${position.fundingRateRaw}` : "",
        ...position.dataWarnings
      ].filter(Boolean)
    }))
    .filter((position) => position.reasons.length > 0);

  const affectedMarkets = affectedPositions.map((position) => ({
    marketId: position.marketId,
    symbol: position.marketSymbol,
    reasons: position.reasons
  }));
  const dataQualityConcerns = [
    snapshot.scoreCoveragePercent < 60 ? `scoreCoveragePercent=${snapshot.scoreCoveragePercent}` : "",
    ...snapshot.dataQuality.warnings,
    ...snapshot.issues.filter((issue) => issue.code.includes("UNAVAILABLE") || issue.code === "PARTIAL_HISTORY").map(riskIssueToDriver)
  ].filter(Boolean);
  const recommendedObjectives = recommendedObjectivesFor(snapshot, highLeverage.length, concentrated.length, dataQualityConcerns.length);
  const summary = `Perpl monitored account risk is ${snapshot.riskLevel} with score ${snapshot.score ?? "unavailable"} and ${snapshot.scoreCoveragePercent}% coverage.`;

  return {
    summary,
    riskLevel: snapshot.riskLevel,
    riskScore: snapshot.score,
    scoreCoveragePercent: snapshot.scoreCoveragePercent,
    primaryRiskDrivers,
    affectedPositions,
    affectedMarkets,
    dataQualityConcerns,
    recommendedObjectives
  };
}

function recommendedObjectivesFor(snapshot: PerplRiskSnapshot, highLeverageCount: number, concentratedCount: number, concernCount: number): string[] {
  const objectives: string[] = [];
  if (snapshot.noExposure) objectives.push("hold due to no exposure");
  if (snapshot.scoreCoveragePercent < 60 || concernCount > 0) objectives.push("hold due to insufficient data");
  if (highLeverageCount > 0) objectives.push("reduce leverage");
  if (concentratedCount > 0) objectives.push("reduce concentration");
  if (snapshot.walletMetrics.openOrderCount > 0) objectives.push("cancel risky open orders");
  if ((snapshot.walletMetrics.lockedBalanceRatio ?? 0) >= 0.5) objectives.push("improve collateral buffer");
  if (snapshot.positions.some((position) => position.fundingRateRaw !== null && Math.abs(position.fundingRateRaw) >= 5_000)) {
    objectives.push("reduce abnormal funding exposure");
  }
  return objectives.length ? [...new Set(objectives)] : ["hold due to low current risk"];
}

function cleanSummary(value: string | null): string | null {
  if (!value) return null;
  if (/api key|secret|signature|nonce|canonical|header/i.test(value)) return null;
  return value.slice(0, 500);
}
