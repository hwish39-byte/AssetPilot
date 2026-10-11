import type { PerplMarket, PerplFill, Portfolio, Position } from "../perpl/types.js";
import { Decimal, decimalOrNull, decimalString, ratioNumber, roundPercent, safeNumber, zero } from "./decimal.js";
import type { PerplMarketPerformance, PerplPerformanceMetrics } from "./perplRiskTypes.js";

export function calculatePerformanceMetrics(args: {
  positionHistory: Position[];
  fills: PerplFill[];
  portfolioEquity: Portfolio;
  markets: PerplMarket[];
}): PerplPerformanceMetrics {
  const closed = args.positionHistory
    .filter((position) => position.xp !== undefined || position.dpnl !== undefined || position.sr === 13)
    .sort((a, b) => (a.at.t ?? 0) - (b.at.t ?? 0));
  const realized = closed.map((position) => decimalOrNull(position.dpnl) ?? zero());
  const positive = realized.filter((value) => value.gt(0));
  const negative = realized.filter((value) => value.lt(0));
  const grossProfit = positive.reduce((sum, value) => sum.plus(value), zero());
  const grossLoss = negative.reduce((sum, value) => sum.plus(value), zero());
  const realizedPnl = realized.reduce((sum, value) => sum.plus(value), zero());
  const fundingPnl = closed.reduce((sum, position) => sum.plus(decimalOrNull(position.fnd) ?? zero()), zero());
  const totalFees = closed.reduce((sum, position) => sum.plus(decimalOrNull(position.fee) ?? zero()).plus(decimalOrNull(position.cfee) ?? zero()), zero());
  const fillBuilderFees = args.fills.reduce((sum, fill) => sum.plus(decimalOrNull(fill.builderFee) ?? zero()), zero());
  const marketPerformance = byMarket(closed, args.markets);
  const streaks = calculateStreaks(realized);
  const holdingTimes = closed
    .map((position) => {
      const open = position.ots.t;
      const close = position.at.t;
      return open && close && close >= open ? (close - open) / 1000 : null;
    })
    .filter((value): value is number => value !== null);
  const drawdown = calculateMaxDrawdown(args.portfolioEquity);

  return {
    closedPositionCount: closed.length,
    winningPositionCount: positive.length,
    losingPositionCount: negative.length,
    breakEvenPositionCount: realized.filter((value) => value.isZero()).length,
    winRate: closed.length === 0 ? null : positive.length / closed.length,
    grossProfit: decimalString(grossProfit) ?? "0",
    grossLoss: decimalString(grossLoss) ?? "0",
    realizedPnl: decimalString(realizedPnl) ?? "0",
    fundingPnl: decimalString(fundingPnl) ?? "0",
    profitFactor: negative.length === 0 ? null : safeNumber(grossProfit.div(grossLoss.abs())),
    profitFactorUnavailableReason: negative.length === 0 ? "No losing closed positions; profit factor would be unbounded." : null,
    maxDrawdown: decimalString(drawdown.amount),
    maxDrawdownPercent: roundPercent(drawdown.percent),
    currentWinStreak: streaks.currentWinStreak,
    currentLossStreak: streaks.currentLossStreak,
    longestWinStreak: streaks.longestWinStreak,
    longestLossStreak: streaks.longestLossStreak,
    averageHoldingTimeSeconds:
      holdingTimes.length === 0 ? null : holdingTimes.reduce((sum, value) => sum + value, 0) / holdingTimes.length,
    bestMarket: marketPerformance[0] ?? null,
    worstMarket: marketPerformance[marketPerformance.length - 1] ?? null,
    totalFees: decimalString(totalFees) ?? "0",
    totalBuilderFees: decimalString(fillBuilderFees) ?? "0"
  };
}

function byMarket(positions: Position[], markets: PerplMarket[]): PerplMarketPerformance[] {
  const grouped = new Map<number, { pnl: Decimal; count: number }>();
  for (const position of positions) {
    const current = grouped.get(position.mkt) ?? { pnl: zero(), count: 0 };
    current.pnl = current.pnl.plus(decimalOrNull(position.dpnl) ?? zero());
    current.count += 1;
    grouped.set(position.mkt, current);
  }
  return [...grouped.entries()]
    .map(([marketId, value]) => ({
      marketId,
      marketSymbol: markets.find((market) => market.id === marketId)?.symbol ?? null,
      realizedPnl: decimalString(value.pnl) ?? "0",
      closedPositionCount: value.count
    }))
    .sort((a, b) => (decimalOrNull(b.realizedPnl) ?? zero()).cmp(decimalOrNull(a.realizedPnl) ?? zero()));
}

function calculateStreaks(values: Decimal[]) {
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let currentWin = 0;
  let currentLoss = 0;
  for (const value of values) {
    if (value.gt(0)) {
      currentWin += 1;
      currentLoss = 0;
    } else if (value.lt(0)) {
      currentLoss += 1;
      currentWin = 0;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
    longestWinStreak = Math.max(longestWinStreak, currentWin);
    longestLossStreak = Math.max(longestLossStreak, currentLoss);
  }
  return {
    currentWinStreak: currentWin,
    currentLossStreak: currentLoss,
    longestWinStreak,
    longestLossStreak
  };
}

function calculateMaxDrawdown(portfolio: Portfolio): { amount: Decimal | null; percent: number | null } {
  const points = [...portfolio.chart]
    .map((point) => ({ time: point.t, value: decimalOrNull(point.v) }))
    .filter((point): point is { time: number; value: Decimal } => point.value !== null)
    .sort((a, b) => a.time - b.time);
  if (points.length === 0) return { amount: null, percent: null };
  let peak = points[0]!.value;
  let maxDrawdown = zero();
  let maxPercent: number | null = null;
  for (const point of points) {
    if (point.value.gt(peak)) peak = point.value;
    const drawdown = peak.minus(point.value);
    if (drawdown.gt(maxDrawdown)) {
      maxDrawdown = drawdown;
      maxPercent = ratioNumber(drawdown, peak);
    }
  }
  return { amount: maxDrawdown, percent: maxPercent };
}
