import type { AnalyticsPeriod } from "./types.js";

export interface PeriodConfig {
  period: AnalyticsPeriod;
  durationMs: number;
  candleResolutionSeconds: number;
  maxPoints: number;
  cacheTtlMs: number;
}

export const ANALYTICS_PERIODS: Record<AnalyticsPeriod, PeriodConfig> = {
  "24h": {
    period: "24h",
    durationMs: 24 * 60 * 60 * 1000,
    candleResolutionSeconds: 3600,
    maxPoints: 24,
    cacheTtlMs: 30_000
  },
  "7d": {
    period: "7d",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    candleResolutionSeconds: 3600,
    maxPoints: 168,
    cacheTtlMs: 60_000
  },
  "30d": {
    period: "30d",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    candleResolutionSeconds: 14_400,
    maxPoints: 180,
    cacheTtlMs: 60_000
  }
};

export const ANALYTICS_CACHE_TTL = {
  contextMs: 30_000,
  tickerMs: 15_000,
  orderBookMs: 5_000,
  historyMs: 60_000
} as const;

export function periodRange(period: AnalyticsPeriod, nowMs = Date.now()): { from: number; to: number; config: PeriodConfig } {
  const config = ANALYTICS_PERIODS[period];
  const to = Math.floor(nowMs / 60_000) * 60_000;
  return { from: to - config.durationMs, to, config };
}

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  if (value === undefined) return "24h";
  if (value === "24h" || value === "7d" || value === "30d") return value;
  throw new Error("INVALID_ANALYTICS_PERIOD");
}
