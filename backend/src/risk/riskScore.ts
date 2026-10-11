import { decimalOrNull, interpolate, round, zero } from "./decimal.js";
import type {
  PerplDataQuality,
  PerplPerformanceMetrics,
  PerplPositionRisk,
  PerplRiskComponent,
  PerplRiskIssue,
  PerplRiskLevel,
  PerplRiskSeverity,
  PerplWalletMetrics
} from "./perplRiskTypes.js";

export const RISK_WEIGHTS = {
  liquidation_distance: 30,
  leverage: 20,
  concentration: 15,
  margin_usage_proxy: 15,
  max_drawdown: 10,
  funding_exposure: 5,
  open_order_exposure: 5
} as const;

export function scoreRisk(args: {
  walletMetrics: PerplWalletMetrics;
  positions: PerplPositionRisk[];
  performance: PerplPerformanceMetrics;
  accountFrozen: boolean;
  dataQuality: PerplDataQuality;
}): { score: number | null; riskLevel: PerplRiskLevel; scoreCoveragePercent: number; components: PerplRiskComponent[]; issues: PerplRiskIssue[] } {
  const noExposure = args.walletMetrics.openPositionCount === 0 && args.walletMetrics.openOrderCount === 0;
  const components = buildComponents(args.walletMetrics, args.positions, args.performance, noExposure);
  const applicableWeight = components.filter((component) => component.applicable).reduce((sum, component) => sum + component.weight, 0);
  const availableWeight = components
    .filter((component) => component.applicable && component.available && component.score !== null)
    .reduce((sum, component) => sum + component.weight, 0);
  const rawWeighted = components
    .filter((component) => component.applicable && component.available && component.score !== null)
    .reduce((sum, component) => sum + component.weight * (component.score ?? 0), 0);
  const coverage = applicableWeight === 0 ? 100 : (availableWeight / applicableWeight) * 100;
  const provisionalScore = availableWeight === 0 ? null : round(rawWeighted / availableWeight, 2);
  const issues = buildIssues(args.walletMetrics, args.positions, args.performance, args.accountFrozen, args.dataQuality, noExposure);
  const criticalOverride = issues.some((issue) => issue.severity === "critical");
  const score = provisionalScore === null ? null : criticalOverride ? Math.max(provisionalScore, 75) : provisionalScore;
  const riskLevel = coverage < 60 ? "unknown" : scoreToLevel(score, noExposure);

  return {
    score,
    riskLevel,
    scoreCoveragePercent: round(coverage, 2) ?? 0,
    components: components.map((component) => ({
      ...component,
      weightedContribution:
        component.applicable && component.available && component.score !== null && availableWeight > 0
          ? round((component.weight * component.score) / availableWeight, 2)
          : null
    })),
    issues
  };
}

function buildComponents(
  metrics: PerplWalletMetrics,
  positions: PerplPositionRisk[],
  performance: PerplPerformanceMetrics,
  noExposure: boolean
): PerplRiskComponent[] {
  const maxLeverage = Math.max(0, ...positions.map((position) => Number(position.leverage)).filter(Number.isFinite));
  const largestConcentration = metrics.largestPositionShare === null ? null : metrics.largestPositionShare * 100;
  const lockedRatio = metrics.lockedBalanceRatio === null ? null : metrics.lockedBalanceRatio * 100;
  const maxDrawdown = performance.maxDrawdownPercent;
  const openOrderExposure = estimateOpenOrderExposure(metrics);
  const liquidationAvailable = positions.some((position) => position.liquidationDistancePercent !== null);
  const minLiquidationDistance = minNullable(positions.map((position) => position.liquidationDistancePercent));
  const maxFundingRaw = maxAbsNullable(positions.map((position) => position.fundingRateRaw));

  return [
    component({
      id: "liquidation_distance",
      label: "Liquidation Distance",
      weight: RISK_WEIGHTS.liquidation_distance,
      applicable: !noExposure,
      available: liquidationAvailable,
      rawValue: minLiquidationDistance,
      score:
        minLiquidationDistance === null
          ? null
          : interpolate(25 - minLiquidationDistance, [
              [0, 0],
              [10, 25],
              [15, 50],
              [20, 75],
              [23, 100]
            ]),
      reason: liquidationAvailable ? undefined : "Liquidation price is not available from the current Perpl data source.",
      evidence: ["Current normalized Perpl position data does not include liquidation price."],
      methodology: "Uses real liquidation distance only when Perpl provides liquidation price."
    }),
    component({
      id: "leverage",
      label: "Leverage",
      weight: RISK_WEIGHTS.leverage,
      applicable: !noExposure,
      available: positions.length > 0 && Number.isFinite(maxLeverage),
      rawValue: maxLeverage,
      score: interpolate(maxLeverage, [
        [2, 0],
        [3, 20],
        [5, 50],
        [10, 80],
        [20, 100]
      ]),
      evidence: [`maxLeverage=${maxLeverage}`],
      methodology: "Scores the highest open position leverage; Perpl leverage is normalized as x."
    }),
    component({
      id: "concentration",
      label: "Position Concentration",
      weight: RISK_WEIGHTS.concentration,
      applicable: !noExposure,
      available: largestConcentration !== null,
      rawValue: largestConcentration,
      score:
        largestConcentration === null
          ? null
          : interpolate(largestConcentration, [
              [30, 0],
              [50, 40],
              [75, 75],
              [100, 100]
            ]),
      evidence: [`largestPositionShare=${metrics.largestPositionShare ?? "unavailable"}`],
      methodology: "Largest position notional divided by gross position notional."
    }),
    component({
      id: "margin_usage_proxy",
      label: "Locked Balance Ratio",
      weight: RISK_WEIGHTS.margin_usage_proxy,
      applicable: true,
      available: lockedRatio !== null,
      rawValue: lockedRatio,
      score:
        lockedRatio === null
          ? null
          : interpolate(lockedRatio, [
              [25, 0],
              [50, 40],
              [75, 75],
              [90, 100]
            ]),
      evidence: [`lockedBalanceRatio=${metrics.lockedBalanceRatio ?? "unavailable"}`],
      methodology: "AssetPilot proxy: locked balance divided by balance. This is not official Perpl margin usage."
    }),
    component({
      id: "max_drawdown",
      label: "Max Drawdown",
      weight: RISK_WEIGHTS.max_drawdown,
      applicable: true,
      available: maxDrawdown !== null,
      rawValue: maxDrawdown,
      score:
        maxDrawdown === null
          ? null
          : interpolate(maxDrawdown, [
              [5, 0],
              [10, 25],
              [20, 50],
              [40, 80],
              [60, 100]
            ]),
      evidence: [`maxDrawdownPercent=${maxDrawdown ?? "unavailable"}`],
      methodology: "Based on real portfolio equity chart drawdown."
    }),
    component({
      id: "funding_exposure",
      label: "Funding Exposure",
      weight: RISK_WEIGHTS.funding_exposure,
      applicable: !noExposure,
      available: maxFundingRaw !== null,
      rawValue: maxFundingRaw,
      score: maxFundingRaw === null ? null : interpolate(maxFundingRaw, [[0, 0], [1000, 25], [5000, 65], [10000, 100]]),
      evidence: ["Perpl docs define funding rate as Micros (10^-6 fractions)."],
      methodology: "Uses absolute raw funding rate in micros from Perpl market funding events."
    }),
    component({
      id: "open_order_exposure",
      label: "Open Order Exposure",
      weight: RISK_WEIGHTS.open_order_exposure,
      applicable: metrics.openOrderCount > 0,
      available: openOrderExposure !== null,
      rawValue: openOrderExposure,
      score: openOrderExposure === null ? null : interpolate(openOrderExposure * 100, [[0, 0], [25, 25], [50, 60], [100, 100]]),
      evidence: [`openOrderCount=${metrics.openOrderCount}`],
      methodology: "Proxy based on open order count and current balance estimate when exact order notional is unavailable."
    })
  ];
}

function buildIssues(
  metrics: PerplWalletMetrics,
  positions: PerplPositionRisk[],
  performance: PerplPerformanceMetrics,
  accountFrozen: boolean,
  dataQuality: PerplDataQuality,
  noExposure: boolean
): PerplRiskIssue[] {
  const issues: PerplRiskIssue[] = [];
  if (noExposure) {
    issues.push(issue("NO_EXPOSURE", "info", "No open exposure", "No open Perpl positions or orders were found.", [], [], "No risk action required."));
  }
  if (accountFrozen) {
    issues.push(issue("ACCOUNT_FROZEN", "high", "Account frozen", "At least one Perpl account is frozen.", [], [], "Review account status before trading."));
  }
  const balance = decimalOrNull(metrics.balancePlusUnrealizedPnlEstimate);
  const gross = decimalOrNull(metrics.grossPositionNotional) ?? zero();
  if (gross.gt(0) && balance && balance.lte(0)) {
    issues.push(issue("NON_POSITIVE_BALANCE_WITH_EXPOSURE", "critical", "Non-positive balance with exposure", "Balance plus unrealized PnL estimate is non-positive while positions are open.", [metrics.balancePlusUnrealizedPnlEstimate ?? "unavailable"], [], "Reduce exposure or add collateral manually."));
  }
  for (const position of positions) {
    if (Number(position.leverage) >= 10) {
      issues.push(issue("HIGH_LEVERAGE", "high", "High leverage", "An open position has leverage at or above 10x.", [`position=${position.positionId}`, `leverage=${position.leverage}`], [position.positionId], "Consider reducing position size."));
    }
    if ((position.concentrationShare ?? 0) >= 0.75) {
      issues.push(issue("POSITION_CONCENTRATION", "high", "Position concentration", "A single position dominates gross notional exposure.", [`share=${position.concentrationShare}`], [position.positionId], "Diversify or reduce the concentrated position."));
    }
    if (position.markPrice === null) {
      issues.push(issue("MARKET_PRICE_UNAVAILABLE", "medium", "Market price unavailable", "Mark price is missing for a position, so risk estimates are incomplete.", [], [position.positionId], "Refresh market data and retry."));
    }
  }
  if ((metrics.lockedBalanceRatio ?? 0) >= 0.75) {
    issues.push(issue("HIGH_LOCKED_BALANCE_RATIO", "high", "High locked balance ratio", "Locked balance ratio is elevated.", [`lockedBalanceRatio=${metrics.lockedBalanceRatio}`], [], "Consider reducing open exposure or adding collateral."));
  }
  if ((performance.maxDrawdownPercent ?? 0) >= 40) {
    issues.push(issue("LARGE_DRAWDOWN", "high", "Large drawdown", "Portfolio equity history shows a large drawdown.", [`maxDrawdownPercent=${performance.maxDrawdownPercent}`], [], "Review strategy and reduce risk."));
  }
  if (!noExposure) {
    issues.push(issue("LIQUIDATION_DISTANCE_UNAVAILABLE", "medium", "Liquidation distance unavailable", "Liquidation price is not available from the current Perpl data source.", [], positions.map((position) => position.positionId), "Do not rely on this snapshot as a liquidation forecast."));
  }
  if (dataQuality.stale) {
    issues.push(issue("STALE_DATA", "medium", "Stale data", "Some Perpl timestamps appear stale.", dataQuality.warnings, [], "Refresh before acting."));
  }
  if (dataQuality.partialHistory) {
    issues.push(issue("PARTIAL_HISTORY", "medium", "Partial history", "One or more non-core history endpoints failed or pagination was capped.", dataQuality.warnings, [], "Use a deeper export before relying on performance metrics."));
  }
  if (metrics.openOrderCount > 0) {
    issues.push(issue("OPEN_ORDER_EXPOSURE", "medium", "Open order exposure", "Open orders can change exposure if filled.", [`openOrderCount=${metrics.openOrderCount}`], [], "Review open orders manually."));
  }
  return issues;
}

function component(args: Omit<PerplRiskComponent, "severity" | "weightedContribution">): PerplRiskComponent {
  return {
    ...args,
    severity: scoreSeverity(args.score),
    weightedContribution: null
  };
}

function scoreSeverity(score: number | null): PerplRiskSeverity {
  if (score === null) return "medium";
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function scoreToLevel(score: number | null, noExposure: boolean): PerplRiskLevel {
  if (score === null) return noExposure ? "low" : "unknown";
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function minNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return filtered.length === 0 ? null : Math.min(...filtered);
}

function maxAbsNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value)).map(Math.abs);
  return filtered.length === 0 ? null : Math.max(...filtered);
}

function estimateOpenOrderExposure(metrics: PerplWalletMetrics): number | null {
  if (metrics.openOrderCount === 0) return 0;
  const balance = decimalOrNull(metrics.balancePlusUnrealizedPnlEstimate);
  if (!balance || balance.lte(0)) return null;
  return Math.min(1, metrics.openOrderCount * 0.1);
}

function issue(
  code: PerplRiskIssue["code"],
  severity: PerplRiskSeverity,
  title: string,
  description: string,
  evidence: string[],
  affectedPositionIds: string[],
  suggestedAction: string
): PerplRiskIssue {
  return { code, severity, title, description, evidence, affectedPositionIds, suggestedAction };
}
