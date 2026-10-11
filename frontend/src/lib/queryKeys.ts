import type { AnalyticsHistoryMetric, AnalyticsPeriod } from "@/types/perpl";

export const queryKeys = {
  perpl: {
    overview: (period: AnalyticsPeriod) => ["perpl", "overview", period] as const,
    availability: () => ["perpl", "availability"] as const,
    market: (marketId: number, period: AnalyticsPeriod) => ["perpl", "market", marketId, period] as const,
    marketHistory: (marketId: number, period: AnalyticsPeriod, metric: AnalyticsHistoryMetric) =>
      ["perpl", "market-history", marketId, period, metric] as const,
    wallet: () => ["perpl", "wallet"] as const,
    markets: () => ["perpl", "markets"] as const,
    positions: () => ["perpl", "positions"] as const,
    orders: () => ["perpl", "orders"] as const,
    fills: () => ["perpl", "fills"] as const,
    risk: () => ["perpl", "risk"] as const,
    tradingCapabilities: () => ["perpl", "trading-capabilities"] as const
  }
};
