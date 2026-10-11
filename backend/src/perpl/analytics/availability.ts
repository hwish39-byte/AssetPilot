import type { AnalyticsMetric, DataAvailabilityItem, MetricStatus } from "./types.js";

export function metric<T>(args: {
  value: T | null;
  status?: MetricStatus;
  source: string | null;
  asOf?: string | null;
  methodology: string;
  reason?: string;
  estimated?: boolean;
}): AnalyticsMetric<T> {
  return {
    value: args.value,
    status: args.status ?? (args.value === null ? "unavailable" : "available"),
    source: args.source,
    asOf: args.asOf ?? null,
    methodology: args.methodology,
    reason: args.reason,
    estimated: args.estimated ?? false
  };
}

export function availabilityMatrix(): DataAvailabilityItem[] {
  return [
    available("volume", "both", "Public REST ticker and candles expose MarketState.dva and Candle.v."),
    available("openInterest", "market", "Public REST context/ticker exposes MarketState.oi per market."),
    available("tvl", "market", "Public REST context/ticker exposes MarketState.tvl per market; protocol aggregation is conservatively deduped by instance."),
    available("funding", "both", "Public REST context and funding endpoints expose FundingEvent.rate."),
    available("priceHistory", "market", "Public REST candles expose OHLC prices."),
    available("orderBook", "market", "Public REST order-book endpoint exposes L2 price levels."),
    unavailable("activeUsers", "protocol", "Current public REST endpoints do not expose protocol-wide unique traders.", "Add an indexed Perpl event data source or obtain an official analytics endpoint."),
    unavailable("fees", "protocol", "Current public REST endpoints do not expose realized protocol fee revenue.", "Use official revenue analytics or indexed settlement/fill events."),
    unavailable("revenue", "protocol", "Current public REST endpoints do not expose protocol revenue.", "Use an official analytics endpoint or audited indexer."),
    unavailable("deposits", "protocol", "Public REST does not expose protocol-wide deposit history.", "Index protocol account events across all wallets or use official analytics."),
    unavailable("withdrawals", "protocol", "Public REST does not expose protocol-wide withdrawal history.", "Index protocol account events across all wallets or use official analytics."),
    unavailable("netFlows", "protocol", "Net flows require protocol-wide deposits and withdrawals.", "Add protocol-wide account event indexing."),
    unavailable("liquidations", "protocol", "Public REST does not expose protocol-wide liquidation history.", "Index position events or use official liquidation analytics."),
    unavailable("longShortSkew", "protocol", "Public REST does not expose aggregate wallet direction; order book imbalance is not long/short skew.", "Use official aggregate positioning data if available."),
    unavailable("marketShare", "protocol", "External competitor volume and OI are outside Perpl public REST.", "Add verified external market data sources."),
    unavailable("historicalOpenInterest", "protocol", "Current REST data provides OI snapshots, not historical OI series.", "Persist snapshots or add an official historical OI endpoint."),
    unavailable("historicalTvl", "protocol", "Current REST data provides TVL snapshots, not historical TVL series.", "Persist snapshots or add an official historical TVL endpoint.")
  ];
}

function available(metric: string, scope: DataAvailabilityItem["scope"], reason: string): DataAvailabilityItem {
  return { metric, status: "available", source: "perpl_public_rest", scope, reason, requiredNextStep: null };
}

function unavailable(metric: string, scope: DataAvailabilityItem["scope"], reason: string, requiredNextStep: string): DataAvailabilityItem {
  return { metric, status: "unavailable", source: null, scope, reason, requiredNextStep };
}
