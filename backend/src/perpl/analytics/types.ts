import type { Candle, FundingEvent, PerplMarket } from "../types.js";

export type AnalyticsPeriod = "24h" | "7d" | "30d";
export type AnalyticsHistoryMetric = "price" | "volume" | "funding";
export type MetricStatus = "available" | "partial" | "unavailable" | "stale";

export interface AnalyticsMetric<T> {
  value: T | null;
  status: MetricStatus;
  source: string | null;
  asOf: string | null;
  methodology: string;
  reason?: string;
  estimated?: boolean;
}

export interface DataFreshness {
  calculatedAt: string;
  contextAsOf: string | null;
  tickerAsOf: string | null;
}

export interface DataAvailabilityItem {
  metric: string;
  status: MetricStatus;
  source: string | null;
  scope: "market" | "protocol" | "both";
  reason: string;
  requiredNextStep: string | null;
}

export interface MarketAnalytics {
  marketId: number;
  symbol: string;
  name: string;
  isOpen: boolean;
  sizeUnits: string;
  priceDecimals: number;
  sizeDecimals: number;
  current: {
    oraclePrice: string | null;
    markPrice: string | null;
    lastPrice: string | null;
    midPrice: string | null;
    bestBid: string | null;
    bestAsk: string | null;
    absoluteSpread: AnalyticsMetric<string>;
    spreadBps: AnalyticsMetric<number>;
  };
  volume: {
    volume24h: AnalyticsMetric<string>;
    volume7d: AnalyticsMetric<string>;
    volume30d: AnalyticsMetric<string>;
    selectedPeriodVolume: AnalyticsMetric<string>;
    volumeChange: AnalyticsMetric<number>;
    tradeCount24h: AnalyticsMetric<number>;
    averageTradeSize: AnalyticsMetric<string>;
  };
  openInterest: {
    openInterestBase: AnalyticsMetric<string>;
    openInterestUsdEstimate: AnalyticsMetric<string>;
    openInterestShare: AnalyticsMetric<number>;
  };
  tvl: {
    marketTvl: AnalyticsMetric<string>;
    marketTvlShare: AnalyticsMetric<number>;
  };
  funding: FundingAnalytics;
  price: PriceAnalytics;
  orderBook: OrderBookAnalytics | null;
  warnings: string[];
}

export interface FundingAnalytics {
  fundingRateRaw: AnalyticsMetric<number>;
  fundingRateNormalized: AnalyticsMetric<number>;
  fundingPeriod: AnalyticsMetric<number>;
  fundingHistory: FundingPoint[];
  averageFundingRate: AnalyticsMetric<number>;
  minFundingRate: AnalyticsMetric<number>;
  maxFundingRate: AnalyticsMetric<number>;
}

export interface PriceAnalytics {
  openPrice: AnalyticsMetric<string>;
  closePrice: AnalyticsMetric<string>;
  highPrice: AnalyticsMetric<string>;
  lowPrice: AnalyticsMetric<string>;
  priceChange: AnalyticsMetric<string>;
  priceChangePercent: AnalyticsMetric<number>;
}

export interface OrderBookAnalytics {
  bestBid: string | null;
  bestAsk: string | null;
  spread: AnalyticsMetric<string>;
  spreadBps: AnalyticsMetric<number>;
  bidDepth: AnalyticsMetric<string>;
  askDepth: AnalyticsMetric<string>;
  depthWithin10Bps: AnalyticsMetric<{ bid: string; ask: string }>;
  depthWithin50Bps: AnalyticsMetric<{ bid: string; ask: string }>;
  depthWithin100Bps: AnalyticsMetric<{ bid: string; ask: string }>;
  orderBookImbalance: AnalyticsMetric<number>;
  sampledLevels: { bid: number; ask: number; requested: number };
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: string | number | null;
  status: MetricStatus;
  marketCoverage?: number;
}

export interface FundingPoint {
  timestamp: number | null;
  rateRaw: number;
}

export interface ProtocolOverview {
  source: "perpl";
  network: "monad-testnet";
  calculatedAt: string;
  period: AnalyticsPeriod;
  dataFreshness: DataFreshness;
  dataAvailability: DataAvailabilityItem[];
  warnings: string[];
  metrics: {
    totalMarkets: AnalyticsMetric<number>;
    openMarkets: AnalyticsMetric<number>;
    closedMarkets: AnalyticsMetric<number>;
    totalVolume24h: AnalyticsMetric<string>;
    totalVolume7d: AnalyticsMetric<string>;
    totalVolume30d: AnalyticsMetric<string>;
    totalOpenInterestUsdEstimate: AnalyticsMetric<string>;
    totalTvl: AnalyticsMetric<string>;
    topMarketByVolume: AnalyticsMetric<string>;
    topMarketByOpenInterest: AnalyticsMetric<string>;
  };
  volumeByMarket: Array<{ marketId: number; symbol: string; value: string; share: number | null }>;
  openInterestByMarket: Array<{ marketId: number; symbol: string; value: string; share: number | null }>;
  tvlByMarket: Array<{ marketId: number; symbol: string; value: string; share: number | null }>;
  fundingOverview: {
    averageFundingRateRaw: AnalyticsMetric<number>;
    minFundingRateRaw: AnalyticsMetric<number>;
    maxFundingRateRaw: AnalyticsMetric<number>;
  };
  marketRankings: MarketRanking[];
  series: {
    aggregateVolumeSeries: TimeSeriesPoint[];
    aggregatePriceActivitySeries: TimeSeriesPoint[];
    aggregateFundingSeries: TimeSeriesPoint[];
    historicalOpenInterest: AnalyticsMetric<TimeSeriesPoint[]>;
    historicalTvl: AnalyticsMetric<TimeSeriesPoint[]>;
  };
  failedMarkets: Array<{ marketId: number; symbol: string; reason: string }>;
}

export interface MarketRanking {
  marketId: number;
  symbol: string;
  volume24h: string | null;
  volume7d: string | null;
  volume30d: string | null;
  openInterestUsdEstimate: string | null;
  tvl: string | null;
  absoluteFundingRate: number | null;
  priceChangePercent: number | null;
  spreadBps: number | null;
}

export interface MarketHistoryResponse {
  source: "perpl";
  network: "monad-testnet";
  calculatedAt: string;
  period: AnalyticsPeriod;
  marketId: number;
  metric: AnalyticsHistoryMetric;
  series: TimeSeriesPoint[];
  warnings: string[];
}

export interface MarketAnalyticsInput {
  market: PerplMarket;
  period: AnalyticsPeriod;
  candles24h: Candle[];
  candles7d: Candle[];
  candles30d: Candle[];
  funding: FundingEvent[];
  orderBook: OrderBookAnalytics | null;
}
