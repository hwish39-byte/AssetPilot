import type { PerplMarket, PerplOrder, PerplPosition, PerplWalletSummary } from "../perpl/types.js";
import { Decimal, decimalOrNull, decimalString, ratioNumber, round, roundPercent, safeNumber, zero } from "./decimal.js";
import type { PerplPositionRisk, PerplWalletMetrics } from "./perplRiskTypes.js";

export interface WalletMetricInput {
  wallet: PerplWalletSummary;
  positions: PerplPosition[];
  orders: PerplOrder[];
  markets: PerplMarket[];
}

export function calculatePositionRisks(input: WalletMetricInput): PerplPositionRisk[] {
  const partial = input.positions.map((position) => positionRisk(position, input.markets));
  const gross = partial.reduce((sum, position) => sum.plus(decimalOrNull(position.notional) ?? zero()), zero());
  return partial.map((position) => ({
    ...position,
    concentrationShare: ratioNumber(decimalOrNull(position.notional), gross)
  }));
}

export function calculateWalletMetrics(input: WalletMetricInput): PerplWalletMetrics {
  const positions = calculatePositionRisks(input);
  const totalBalance = input.wallet.accounts.reduce((sum, account) => sum.plus(decimalOrNull(account.balance) ?? zero()), zero());
  const totalLocked = input.wallet.accounts.reduce((sum, account) => sum.plus(decimalOrNull(account.lockedBalance) ?? zero()), zero());
  const longNotional = sumNotional(positions.filter((position) => position.side === "long"));
  const shortNotional = sumNotional(positions.filter((position) => position.side === "short"));
  const gross = longNotional.plus(shortNotional);
  const net = longNotional.minus(shortNotional);
  const pnlValues = positions.map((position) => decimalOrNull(position.estimatedUnrealizedPnl));
  const estimatedPnl = pnlValues.some((value) => value === null)
    ? null
    : pnlValues.reduce<Decimal>((sum, value) => sum.plus(value!), zero());
  const balancePlusPnl = estimatedPnl ? totalBalance.plus(estimatedPnl) : null;
  const largest = positions.reduce((max, position) => Decimal.max(max, decimalOrNull(position.notional) ?? zero()), zero());

  return {
    totalBalance: decimalString(totalBalance) ?? "0",
    totalLockedBalance: decimalString(totalLocked) ?? "0",
    lockedBalanceRatio: ratioNumber(totalLocked, totalBalance),
    grossPositionNotional: decimalString(gross) ?? "0",
    longNotional: decimalString(longNotional) ?? "0",
    shortNotional: decimalString(shortNotional) ?? "0",
    netDirectionalNotional: decimalString(net) ?? "0",
    estimatedUnrealizedPnl: decimalString(estimatedPnl),
    balancePlusUnrealizedPnlEstimate: decimalString(balancePlusPnl),
    effectiveLeverageEstimate: ratioNumber(gross, balancePlusPnl ?? totalBalance),
    largestPositionShare: ratioNumber(largest, gross),
    openPositionCount: input.positions.length,
    openOrderCount: input.orders.length,
    marketCount: new Set(input.positions.map((position) => position.marketId)).size,
    longShortSkew: ratioNumber(net, gross)
  };
}

function positionRisk(position: PerplPosition, markets: PerplMarket[]): PerplPositionRisk {
  const warnings: string[] = [];
  const market = markets.find((candidate) => candidate.id === position.marketId);
  const size = decimalOrNull(position.size);
  const entry = decimalOrNull(position.entryPrice);
  const mark = decimalOrNull(market?.markPrice ?? null);
  if (!size) warnings.push("POSITION_SIZE_UNAVAILABLE");
  if (!entry) warnings.push("ENTRY_PRICE_UNAVAILABLE");
  if (!mark) warnings.push("MARK_PRICE_UNAVAILABLE");
  if (!position.side) warnings.push("POSITION_SIDE_UNAVAILABLE");

  const absSize = size?.abs() ?? null;
  const notional = absSize && mark ? absSize.mul(mark).abs() : null;
  const pnl =
    absSize && entry && mark && position.side
      ? position.side === "long"
        ? mark.minus(entry).mul(absSize)
        : entry.minus(mark).mul(absSize)
      : null;
  const pnlPercent = pnl && notional && !notional.isZero() ? safeNumber(pnl.div(notional)) : null;

  return {
    positionId: position.positionId,
    accountId: position.accountId,
    marketId: position.marketId,
    marketSymbol: position.marketSymbol,
    side: position.side,
    size: position.size,
    entryPrice: position.entryPrice,
    markPrice: market?.markPrice ?? null,
    notional: decimalString(notional),
    leverage: position.leverage,
    estimatedUnrealizedPnl: decimalString(pnl),
    estimatedPnlPercent: roundPercent(pnlPercent),
    concentrationShare: null,
    fundingRateRaw: market?.fundingRateMicros ?? null,
    liquidationPrice: null,
    liquidationDistancePercent: null,
    dataWarnings: warnings
  };
}

function sumNotional(positions: PerplPositionRisk[]): Decimal {
  return positions.reduce((sum, position) => sum.plus(decimalOrNull(position.notional) ?? zero()), zero());
}

export function cloneWithAdjustedBalance(wallet: PerplWalletSummary, amount: string): PerplWalletSummary {
  if (wallet.accounts.length === 0) return wallet;
  const first = wallet.accounts[0]!;
  const balance = decimalOrNull(first.balance)?.plus(decimalOrNull(amount) ?? zero()) ?? decimalOrNull(amount) ?? zero();
  return {
    ...wallet,
    accounts: [{ ...first, balance: decimalString(balance) ?? first.balance }, ...wallet.accounts.slice(1)]
  };
}

export function reducePosition(position: PerplPosition, percentage: number): PerplPosition {
  const size = decimalOrNull(position.size);
  if (!size) return position;
  const remaining = size.mul(new Decimal(1).minus(percentage));
  return { ...position, size: decimalString(remaining) ?? position.size };
}

export function zeroPosition(position: PerplPosition): PerplPosition {
  return { ...position, size: "0" };
}

export function walletMetricEvidence(metrics: PerplWalletMetrics): string[] {
  return [
    `grossPositionNotional=${metrics.grossPositionNotional}`,
    `balancePlusUnrealizedPnlEstimate=${metrics.balancePlusUnrealizedPnlEstimate ?? "unavailable"}`,
    `openPositionCount=${metrics.openPositionCount}`,
    `openOrderCount=${metrics.openOrderCount}`,
    `lockedBalanceRatio=${metrics.lockedBalanceRatio === null ? "unavailable" : round(metrics.lockedBalanceRatio, 4)}`
  ];
}
