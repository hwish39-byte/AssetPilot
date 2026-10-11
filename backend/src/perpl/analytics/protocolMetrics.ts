import { decimalOrNull, decimalString, ratioNumber, zero } from "../../risk/decimal.js";
import { metric } from "./availability.js";
import type { MarketAnalytics, MarketRanking, ProtocolOverview, AnalyticsPeriod, DataAvailabilityItem, TimeSeriesPoint } from "./types.js";

export function buildProtocolOverview(args: {
  period: AnalyticsPeriod;
  markets: MarketAnalytics[];
  availability: DataAvailabilityItem[];
  calculatedAt: string;
  warnings: string[];
  failedMarkets: Array<{ marketId: number; symbol: string; reason: string }>;
  aggregateVolumeSeries: TimeSeriesPoint[];
  aggregatePriceActivitySeries: TimeSeriesPoint[];
  aggregateFundingSeries: TimeSeriesPoint[];
}): ProtocolOverview {
  const totalVolume24h = sumMarketMetric(args.markets.map((market) => market.volume.volume24h.value));
  const totalVolume7d = sumMarketMetric(args.markets.map((market) => market.volume.volume7d.value));
  const totalVolume30d = sumMarketMetric(args.markets.map((market) => market.volume.volume30d.value));
  const totalOi = sumMarketMetric(args.markets.map((market) => market.openInterest.openInterestUsdEstimate.value));
  const totalTvl = sumMarketMetric(args.markets.map((market) => market.tvl.marketTvl.value));
  const volumeByMarket = shareRows(args.markets.map((market) => ({ marketId: market.marketId, symbol: market.symbol, value: market.volume.selectedPeriodVolume.value ?? "0" })));
  const oiByMarket = shareRows(args.markets.map((market) => ({ marketId: market.marketId, symbol: market.symbol, value: market.openInterest.openInterestUsdEstimate.value ?? "0" })));
  const tvlByMarket = shareRows(args.markets.map((market) => ({ marketId: market.marketId, symbol: market.symbol, value: market.tvl.marketTvl.value ?? "0" })));
  const rankings = marketRankings(args.markets);
  const fundingRates = args.markets.map((market) => market.funding.fundingRateRaw.value).filter((value): value is number => value !== null);

  return {
    source: "perpl",
    network: "monad-testnet",
    calculatedAt: args.calculatedAt,
    period: args.period,
    dataFreshness: {
      calculatedAt: args.calculatedAt,
      contextAsOf: args.markets[0]?.current.markPrice ? args.markets[0]?.current.absoluteSpread.asOf ?? null : null,
      tickerAsOf: args.markets[0]?.current.absoluteSpread.asOf ?? null
    },
    dataAvailability: args.availability,
    warnings: args.warnings,
    metrics: {
      totalMarkets: metric({ value: args.markets.length, source: "perpl_public_rest_context", methodology: "Count markets in context." }),
      openMarkets: metric({ value: args.markets.filter((market) => market.isOpen).length, source: "perpl_public_rest_context", methodology: "Count markets with isOpen=true." }),
      closedMarkets: metric({ value: args.markets.filter((market) => !market.isOpen).length, source: "perpl_public_rest_context", methodology: "Count markets with isOpen=false." }),
      totalVolume24h: metric({ value: decimalString(totalVolume24h), source: "perpl_public_rest_candles", methodology: "Sum market candle volume after collateral decimal scaling." }),
      totalVolume7d: metric({ value: decimalString(totalVolume7d), source: "perpl_public_rest_candles", methodology: "Sum market candle volume after collateral decimal scaling." }),
      totalVolume30d: metric({ value: decimalString(totalVolume30d), source: "perpl_public_rest_candles", methodology: "Sum market candle volume after collateral decimal scaling." }),
      totalOpenInterestUsdEstimate: metric({ value: decimalString(totalOi), source: "perpl_public_rest_ticker", methodology: "Sum per-market abs(openInterestBase * markPrice).", estimated: true }),
      totalTvl: metric({ value: decimalString(totalTvl), source: "perpl_public_rest_ticker", methodology: "Sum market.state.tvl after collateral scaling; current testnet markets expose market-level values." }),
      topMarketByVolume: metric({ value: volumeByMarket[0]?.symbol ?? null, source: "perpl_public_rest_candles", methodology: "Largest selected-period market volume." }),
      topMarketByOpenInterest: metric({ value: oiByMarket[0]?.symbol ?? null, source: "perpl_public_rest_ticker", methodology: "Largest OI USD estimate." })
    },
    volumeByMarket,
    openInterestByMarket: oiByMarket,
    tvlByMarket,
    fundingOverview: {
      averageFundingRateRaw: metric({ value: fundingRates.length ? fundingRates.reduce((sum, rate) => sum + rate, 0) / fundingRates.length : null, source: "perpl_public_rest_context", methodology: "Average raw funding rate across markets." }),
      minFundingRateRaw: metric({ value: fundingRates.length ? Math.min(...fundingRates) : null, source: "perpl_public_rest_context", methodology: "Minimum raw funding rate across markets." }),
      maxFundingRateRaw: metric({ value: fundingRates.length ? Math.max(...fundingRates) : null, source: "perpl_public_rest_context", methodology: "Maximum raw funding rate across markets." })
    },
    marketRankings: rankings,
    series: {
      aggregateVolumeSeries: args.aggregateVolumeSeries,
      aggregatePriceActivitySeries: args.aggregatePriceActivitySeries,
      aggregateFundingSeries: args.aggregateFundingSeries,
      historicalOpenInterest: metric<TimeSeriesPoint[]>({ value: null, status: "unavailable", source: null, methodology: "No public REST historical OI endpoint.", reason: "Requires snapshot storage or an official historical OI endpoint." }),
      historicalTvl: metric<TimeSeriesPoint[]>({ value: null, status: "unavailable", source: null, methodology: "No public REST historical TVL endpoint.", reason: "Requires snapshot storage or an official historical TVL endpoint." })
    },
    failedMarkets: args.failedMarkets
  };
}

export function marketRankings(markets: MarketAnalytics[]): MarketRanking[] {
  return markets
    .map((market, index) => ({
      marketId: market.marketId,
      symbol: market.symbol,
      volume24h: market.volume.volume24h.value,
      volume7d: market.volume.volume7d.value,
      volume30d: market.volume.volume30d.value,
      openInterestUsdEstimate: market.openInterest.openInterestUsdEstimate.value,
      tvl: market.tvl.marketTvl.value,
      absoluteFundingRate: market.funding.fundingRateRaw.value === null ? null : Math.abs(market.funding.fundingRateRaw.value),
      priceChangePercent: market.price.priceChangePercent.value,
      spreadBps: market.current.spreadBps.value,
      index
    }))
    .sort((a, b) => compareNullable(b.volume24h, a.volume24h) || a.index - b.index)
    .map(({ index: _index, ...ranking }) => ranking);
}

function sumMarketMetric(values: Array<string | null>): ReturnType<typeof zero> {
  return values.reduce((sum, value) => sum.plus(decimalOrNull(value) ?? zero()), zero());
}

function shareRows(rows: Array<{ marketId: number; symbol: string; value: string }>) {
  const total = sumMarketMetric(rows.map((row) => row.value));
  return rows
    .map((row) => ({ ...row, share: ratioNumber(decimalOrNull(row.value), total) }))
    .sort((a, b) => compareNullable(b.value, a.value));
}

function compareNullable(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const da = decimalOrNull(a);
  const db = decimalOrNull(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.cmp(db);
}
