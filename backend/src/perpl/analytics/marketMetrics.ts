import type { Candle, FundingEvent, PerplMarket } from "../types.js";
import { scaleInteger } from "../normalize.js";
import { Decimal, decimalOrNull, decimalString, ratioNumber, safeNumber, zero } from "../../risk/decimal.js";
import { metric } from "./availability.js";
import { dedupeCandles } from "./timeSeries.js";
import type { AnalyticsPeriod, MarketAnalytics, MarketAnalyticsInput } from "./types.js";

export function calculateMarketAnalytics(input: MarketAnalyticsInput, collateralDecimals: number): MarketAnalytics {
  const volume24h = sumCandleVolume(input.candles24h, collateralDecimals);
  const volume7d = sumCandleVolume(input.candles7d, collateralDecimals);
  const volume30d = sumCandleVolume(input.candles30d, collateralDecimals);
  const selected = input.period === "24h" ? volume24h : input.period === "7d" ? volume7d : volume30d;
  const price = priceAnalytics(input.period === "24h" ? input.candles24h : input.period === "7d" ? input.candles7d : input.candles30d, input.market);
  const spread = spreadMetrics(input.market);
  const funding = fundingAnalytics(input.funding, input.market);
  const tradeCount24h = sumTradeCount(input.candles24h);
  const averageTradeSize = tradeCount24h > 0 ? selected.div(tradeCount24h) : null;

  return {
    marketId: input.market.id,
    symbol: input.market.symbol,
    name: input.market.name,
    isOpen: input.market.isOpen,
    sizeUnits: input.market.sizeUnits,
    priceDecimals: input.market.priceDecimals,
    sizeDecimals: input.market.sizeDecimals,
    current: {
      oraclePrice: input.market.oraclePrice,
      markPrice: input.market.markPrice,
      lastPrice: input.market.lastPrice,
      midPrice: input.market.midPrice,
      bestBid: input.market.bestBid,
      bestAsk: input.market.bestAsk,
      absoluteSpread: spread.absoluteSpread,
      spreadBps: spread.spreadBps
    },
    volume: {
      volume24h: volumeMetric(volume24h, "24h"),
      volume7d: volumeMetric(volume7d, "7d"),
      volume30d: volumeMetric(volume30d, "30d"),
      selectedPeriodVolume: volumeMetric(selected, input.period),
      volumeChange: metric<number>({ value: null, status: "unavailable", source: "perpl_public_rest_candles", methodology: "Requires previous comparable period.", reason: "Previous-period candles are not requested in this phase." }),
      tradeCount24h: metric({ value: tradeCount24h, source: "perpl_public_rest_candles", methodology: "Sum of Candle.n, documented as number of trades." }),
      averageTradeSize: metric({ value: decimalString(averageTradeSize), source: "perpl_public_rest_candles", methodology: "selected period volume / trade count" })
    },
    openInterest: {
      openInterestBase: metric({ value: input.market.openInterest, source: "perpl_public_rest_ticker", asOf: input.market.fetchedAt, methodology: "MarketState.oi scaled by market size_decimals" }),
      openInterestUsdEstimate: metric({
        value: oiUsd(input.market),
        source: "perpl_public_rest_ticker",
        asOf: input.market.fetchedAt,
        methodology: "abs(openInterestBase * markPrice)",
        estimated: true
      }),
      openInterestShare: metric<number>({ value: null, status: "unavailable", source: null, methodology: "Computed at protocol aggregation level.", reason: "Requires all market OI estimates." })
    },
    tvl: {
      marketTvl: metric({ value: input.market.totalValueLocked, source: "perpl_public_rest_ticker", asOf: input.market.fetchedAt, methodology: "MarketState.tvl scaled by collateral token decimals" }),
      marketTvlShare: metric<number>({ value: null, status: "unavailable", source: null, methodology: "Computed at protocol aggregation level.", reason: "Requires protocol TVL aggregation." })
    },
    funding,
    price,
    orderBook: input.orderBook,
    warnings: input.market.isOpen ? [] : ["MARKET_CLOSED"]
  };
}

export function sumCandleVolume(candles: Candle[], collateralDecimals: number): Decimal {
  return dedupeCandles(candles).reduce((sum, candle) => sum.plus(decimalOrNull(scaleInteger(candle.v, collateralDecimals)) ?? zero()), zero());
}

export function oiUsd(market: PerplMarket): string | null {
  const oi = decimalOrNull(market.openInterest);
  const mark = decimalOrNull(market.markPrice);
  return oi && mark ? decimalString(oi.mul(mark).abs()) : null;
}

export function spreadMetrics(market: PerplMarket) {
  const bid = decimalOrNull(market.bestBid);
  const ask = decimalOrNull(market.bestAsk);
  const mid = decimalOrNull(market.midPrice);
  const spread = bid && ask ? ask.minus(bid) : null;
  const spreadBps = spread && mid && !mid.isZero() ? safeNumber(spread.div(mid).mul(10_000)) : null;
  return {
    absoluteSpread: metric({ value: decimalString(spread), source: "perpl_public_rest_ticker", asOf: market.fetchedAt, methodology: "bestAsk - bestBid" }),
    spreadBps: metric({ value: spreadBps, source: "perpl_public_rest_ticker", asOf: market.fetchedAt, methodology: "(bestAsk - bestBid) / midPrice * 10000" })
  };
}

export function fundingAnalytics(events: FundingEvent[], market: PerplMarket) {
  const rates = events.map((event) => event.rate).filter(Number.isFinite);
  const current = market.fundingRateMicros;
  return {
    fundingRateRaw: metric({ value: current, source: "perpl_public_rest_context", asOf: market.fetchedAt, methodology: "FundingEvent.rate raw micros" }),
    fundingRateNormalized: metric({
      value: current === null ? null : current / 1_000_000,
      source: "perpl_public_rest_context",
      asOf: market.fetchedAt,
      methodology: "FundingEvent.rate / 1,000,000; Perpl docs define Micros as 10^-6 fractions."
    }),
    fundingPeriod: metric<number>({ value: null, status: "unavailable", source: "perpl_public_rest_context", methodology: "Funding interval is available as seconds on raw Market, not currently carried by normalized PerplMarket.", reason: "Raw market config is not included in this normalized market object." }),
    fundingHistory: events.map((event) => ({ timestamp: event.at.t ?? null, rateRaw: event.rate })),
    averageFundingRate: metric({ value: rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : null, source: "perpl_public_rest_funding", methodology: "Average raw funding rate over returned events." }),
    minFundingRate: metric({ value: rates.length ? Math.min(...rates) : null, source: "perpl_public_rest_funding", methodology: "Minimum raw funding rate over returned events." }),
    maxFundingRate: metric({ value: rates.length ? Math.max(...rates) : null, source: "perpl_public_rest_funding", methodology: "Maximum raw funding rate over returned events." })
  };
}

function priceAnalytics(candles: Candle[], market: PerplMarket) {
  const sorted = dedupeCandles(candles);
  const open = sorted[0] ? decimalOrNull(scaleInteger(sorted[0].o, market.priceDecimals)) : null;
  const close = sorted[sorted.length - 1] ? decimalOrNull(scaleInteger(sorted[sorted.length - 1]!.c, market.priceDecimals)) : null;
  const highs = sorted.map((candle) => decimalOrNull(scaleInteger(candle.h, market.priceDecimals))).filter((value): value is Decimal => value !== null);
  const lows = sorted.map((candle) => decimalOrNull(scaleInteger(candle.l, market.priceDecimals))).filter((value): value is Decimal => value !== null);
  const change = open && close ? close.minus(open) : null;
  const changePercent = change && open && !open.isZero() ? safeNumber(change.div(open)) : null;
  return {
    openPrice: metric({ value: decimalString(open), source: "perpl_public_rest_candles", methodology: "First candle open price." }),
    closePrice: metric({ value: decimalString(close), source: "perpl_public_rest_candles", methodology: "Last candle close price." }),
    highPrice: metric({ value: highs.length ? decimalString(Decimal.max(...highs)) : null, source: "perpl_public_rest_candles", methodology: "Maximum candle high." }),
    lowPrice: metric({ value: lows.length ? decimalString(Decimal.min(...lows)) : null, source: "perpl_public_rest_candles", methodology: "Minimum candle low." }),
    priceChange: metric({ value: decimalString(change), source: "perpl_public_rest_candles", methodology: "closePrice - openPrice" }),
    priceChangePercent: metric({ value: changePercent, source: "perpl_public_rest_candles", methodology: "(close - open) / open" })
  };
}

function sumTradeCount(candles: Candle[]): number {
  return dedupeCandles(candles).reduce((sum, candle) => sum + candle.n, 0);
}

function volumeMetric(value: Decimal, period: AnalyticsPeriod) {
  return metric({ value: decimalString(value) ?? "0", source: "perpl_public_rest_candles", methodology: `Sum Candle.v over ${period}, scaled by collateral token decimals.` });
}
