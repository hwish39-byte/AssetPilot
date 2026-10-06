import type { MarketSnapshotInput, StrategyAction } from "./types.js";

export const AI_ASSETS = new Set(["mNVDA", "mAAPL"]);
export const AI_EXPOSURE_WEIGHTS: Record<string, number> = {
  mNVDA: 1,
  mAAPL: 1,
  mSPY: 0.27
};
export const CASH_ASSETS = new Set(["USDC"]);

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function parsePercent(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSnapshotHash(snapshot: MarketSnapshotInput): string {
  return typeof snapshot.hash === "string" && snapshot.hash.length > 0 ? snapshot.hash : "local-demo-snapshot";
}

export function getPrices(snapshot: MarketSnapshotInput): Record<string, number> {
  if (snapshot.prices && typeof snapshot.prices === "object") {
    return snapshot.prices;
  }

  return Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => typeof value === "number")
  ) as Record<string, number>;
}

export function minBuyAmount(expectedBuyAmount: number, maxSlippageBps: number): number {
  return round((expectedBuyAmount * (10000 - maxSlippageBps)) / 10000, 6);
}

export function totalSellAmount(actions: StrategyAction[]): number {
  return round(actions.reduce((sum, action) => sum + action.sellAmountUsd, 0), 2);
}

export function expectedBuyAmountFor(
  sellAmountUsd: number,
  buyToken: string,
  prices: Record<string, number>
): number {
  const buyPrice = prices[buyToken] ?? 1;
  return round(sellAmountUsd / buyPrice, buyToken === "USDC" ? 2 : 6);
}
