import type { Candle, FundingEvent, PerplMarket } from "../types.js";
import { scaleInteger } from "../normalize.js";
import { decimalOrNull, decimalString, zero } from "../../risk/decimal.js";
import type { AnalyticsHistoryMetric, TimeSeriesPoint } from "./types.js";

export function dedupeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of [...candles].sort((a, b) => a.t - b.t)) {
    byTime.set(candle.t, candle);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function candleSeries(candles: Candle[], market: PerplMarket, metric: AnalyticsHistoryMetric, collateralDecimals: number): TimeSeriesPoint[] {
  return dedupeCandles(candles).map((candle) => {
    if (metric === "price") {
      return { timestamp: candle.t, value: scaleInteger(candle.c, market.priceDecimals), status: "available" };
    }
    if (metric === "volume") {
      return { timestamp: candle.t, value: scaleInteger(candle.v, collateralDecimals), status: "available" };
    }
    return { timestamp: candle.t, value: null, status: "unavailable" };
  });
}

export function fundingSeries(funding: FundingEvent[]): TimeSeriesPoint[] {
  const byTime = new Map<number, TimeSeriesPoint>();
  for (const event of funding) {
    if (event.at.t === undefined) continue;
    byTime.set(event.at.t, { timestamp: event.at.t, value: event.rate, status: "available" });
  }
  return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function aggregateVolumeSeries(seriesByMarket: TimeSeriesPoint[][]): TimeSeriesPoint[] {
  const buckets = new Map<number, { value: ReturnType<typeof zero>; coverage: number }>();
  for (const series of seriesByMarket) {
    for (const point of series) {
      const value = decimalOrNull(typeof point.value === "string" ? point.value : null);
      if (!value) continue;
      const bucket = buckets.get(point.timestamp) ?? { value: zero(), coverage: 0 };
      bucket.value = bucket.value.plus(value);
      bucket.coverage += 1;
      buckets.set(point.timestamp, bucket);
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, bucket]) => ({
      timestamp,
      value: decimalString(bucket.value),
      status: "available",
      marketCoverage: bucket.coverage
    }));
}

export function aggregatePriceActivitySeries(seriesByMarket: TimeSeriesPoint[][]): TimeSeriesPoint[] {
  const buckets = new Map<number, { count: number; coverage: number }>();
  for (const series of seriesByMarket) {
    for (const point of series) {
      if (point.value === null) continue;
      const bucket = buckets.get(point.timestamp) ?? { count: 0, coverage: 0 };
      bucket.count += 1;
      bucket.coverage += 1;
      buckets.set(point.timestamp, bucket);
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, bucket]) => ({ timestamp, value: bucket.count, status: "available", marketCoverage: bucket.coverage }));
}

export function aggregateFundingSeries(seriesByMarket: TimeSeriesPoint[][]): TimeSeriesPoint[] {
  const buckets = new Map<number, { sum: number; coverage: number }>();
  for (const series of seriesByMarket) {
    for (const point of series) {
      if (typeof point.value !== "number") continue;
      const bucket = buckets.get(point.timestamp) ?? { sum: 0, coverage: 0 };
      bucket.sum += point.value;
      bucket.coverage += 1;
      buckets.set(point.timestamp, bucket);
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, bucket]) => ({
      timestamp,
      value: bucket.coverage === 0 ? null : bucket.sum / bucket.coverage,
      status: bucket.coverage === 0 ? "unavailable" : "available",
      marketCoverage: bucket.coverage
    }));
}
