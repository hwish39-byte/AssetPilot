import { loadPerplConfig, type PerplConfig } from "../config.js";
import { PerplApiError } from "../errors.js";
import { PerplPublicClient } from "../publicClient.js";
import { PerplService } from "../service.js";
import type { Candle, Context, FundingSeries, L2Book, PerplMarket } from "../types.js";
import { availabilityMatrix } from "./availability.js";
import { calculateMarketAnalytics } from "./marketMetrics.js";
import { calculateOrderBookMetrics } from "./orderBookMetrics.js";
import { ANALYTICS_CACHE_TTL, ANALYTICS_PERIODS, parseAnalyticsPeriod, periodRange } from "./periods.js";
import { buildProtocolOverview } from "./protocolMetrics.js";
import { aggregateFundingSeries, aggregatePriceActivitySeries, aggregateVolumeSeries, candleSeries, fundingSeries } from "./timeSeries.js";
import type { AnalyticsHistoryMetric, AnalyticsPeriod, MarketAnalytics, MarketHistoryResponse, ProtocolOverview } from "./types.js";

interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

export class PerplAnalyticsService {
  private readonly config: PerplConfig;
  private readonly publicClient: PerplPublicClient;
  private readonly perplService: PerplService;
  private readonly nowMs: () => number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private activeRequests = 0;
  private maxObservedConcurrency = 0;
  private readonly maxConcurrentRequests = 4;
  private waiters: Array<() => void> = [];

  constructor(options: { config?: PerplConfig; publicClient?: PerplPublicClient; perplService?: PerplService; nowMs?: () => number } = {}) {
    this.config = options.config ?? loadPerplConfig();
    this.publicClient = options.publicClient ?? new PerplPublicClient({ apiUrl: this.config.apiUrl });
    this.perplService = options.perplService ?? new PerplService({ config: this.config });
    this.nowMs = options.nowMs ?? Date.now;
  }

  getMaxObservedConcurrency(): number {
    return this.maxObservedConcurrency;
  }

  async getOverview(period: AnalyticsPeriod = "24h"): Promise<ProtocolOverview> {
    const [context, markets] = await Promise.all([this.getContext(), this.perplService.getMarkets()]);
    const collateralDecimals = collateralDecimalsFrom(context);
    const failedMarkets: Array<{ marketId: number; symbol: string; reason: string }> = [];
    const marketAnalytics: MarketAnalytics[] = [];
    const candlesByMarket: Array<{ market: PerplMarket; candles: Candle[] }> = [];
    const fundingByMarket: ReturnType<typeof fundingSeries>[] = [];

    await mapLimit(markets, 4, async (market) => {
      try {
        const analytics = await this.getMarketAnalytics(market.id, period);
        marketAnalytics.push(analytics);
        const candles = await this.getCandles(market.id, period);
        candlesByMarket.push({ market, candles });
        fundingByMarket.push(fundingSeries(await this.getFunding(market.id, period)));
      } catch (error) {
        failedMarkets.push({ marketId: market.id, symbol: market.symbol, reason: error instanceof Error ? error.message : "unknown error" });
      }
    });

    if (marketAnalytics.length === 0 && markets.length > 0) {
      throw new PerplApiError({ code: "PERPL_HTTP_ERROR", statusCode: 502, message: "All market analytics requests failed." });
    }

    const volumeSeries = candlesByMarket.map(({ market, candles }) => candleSeries(candles, market, "volume", collateralDecimals));
    const priceSeries = candlesByMarket.map(({ market, candles }) => candleSeries(candles, market, "price", collateralDecimals));

    return buildProtocolOverview({
      period,
      markets: marketAnalytics.sort((a, b) => a.marketId - b.marketId),
      availability: availabilityMatrix(),
      calculatedAt: new Date(this.nowMs()).toISOString(),
      warnings: failedMarkets.length ? ["PARTIAL_MARKET_DATA"] : [],
      failedMarkets,
      aggregateVolumeSeries: aggregateVolumeSeries(volumeSeries),
      aggregatePriceActivitySeries: aggregatePriceActivitySeries(priceSeries),
      aggregateFundingSeries: aggregateFundingSeries(fundingByMarket)
    });
  }

  async getMarketAnalytics(marketId: number, period: AnalyticsPeriod = "24h"): Promise<MarketAnalytics> {
    const [context, markets] = await Promise.all([this.getContext(), this.perplService.getMarkets()]);
    const market = markets.find((candidate) => candidate.id === marketId);
    if (!market) throw new PerplApiError({ code: "PERPL_NOT_FOUND", statusCode: 404, perplStatus: 404, message: "Perpl market was not found." });
    const [candles24h, candles7d, candles30d, funding, book] = await Promise.all([
      this.getCandles(marketId, "24h"),
      this.getCandles(marketId, "7d"),
      this.getCandles(marketId, "30d"),
      this.getFunding(marketId, period),
      this.getOrderBook(marketId, 25)
    ]);
    return calculateMarketAnalytics(
      {
        market,
        period,
        candles24h,
        candles7d,
        candles30d,
        funding,
        orderBook: calculateOrderBookMetrics(book, market, 25)
      },
      collateralDecimalsFrom(context)
    );
  }

  async getMarketHistory(marketId: number, period: AnalyticsPeriod, metric: AnalyticsHistoryMetric): Promise<MarketHistoryResponse> {
    const [context, markets] = await Promise.all([this.getContext(), this.perplService.getMarkets()]);
    const market = markets.find((candidate) => candidate.id === marketId);
    if (!market) throw new PerplApiError({ code: "PERPL_NOT_FOUND", statusCode: 404, perplStatus: 404, message: "Perpl market was not found." });
    const series =
      metric === "funding"
        ? fundingSeries(await this.getFunding(marketId, period))
        : candleSeries(await this.getCandles(marketId, period), market, metric, collateralDecimalsFrom(context));
    return {
      source: "perpl",
      network: "monad-testnet",
      calculatedAt: new Date(this.nowMs()).toISOString(),
      period,
      marketId,
      metric,
      series,
      warnings: []
    };
  }

  getAvailability() {
    return {
      source: "perpl",
      network: "monad-testnet",
      calculatedAt: new Date(this.nowMs()).toISOString(),
      dataAvailability: availabilityMatrix()
    };
  }

  private getContext(): Promise<Context> {
    return this.cached("context", ANALYTICS_CACHE_TTL.contextMs, () => this.perplService.getRawContext());
  }

  private getCandles(marketId: number, period: AnalyticsPeriod): Promise<Candle[]> {
    const { from, to, config } = periodRange(period, this.nowMs());
    return this.cached(`candles:${marketId}:${period}:${from}:${to}`, config.cacheTtlMs, async () => {
      const response = await this.track(() => this.publicClient.getCandles({ marketId, resolution: config.candleResolutionSeconds, from, to }));
      return response.d.slice(0, config.maxPoints);
    });
  }

  private getFunding(marketId: number, period: AnalyticsPeriod) {
    const { from, to, config } = periodRange(period, this.nowMs());
    return this.cached(`funding:${marketId}:${period}:${from}:${to}`, ANALYTICS_CACHE_TTL.historyMs, async () => {
      const response = (await this.track(() => this.publicClient.getFunding({ marketId, from, to }))) as FundingSeries;
      return response.d.slice(0, config.maxPoints);
    });
  }

  private getOrderBook(marketId: number, levels: number): Promise<L2Book> {
    return this.cached(`book:${marketId}:${levels}`, ANALYTICS_CACHE_TTL.orderBookMs, () =>
      this.track(() => this.publicClient.getOrderBook({ marketId, levels }))
    );
  }

  private cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = this.nowMs();
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) return cached.promise;
    const promise = loader().catch((error) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, { expiresAt: now + ttlMs, promise });
    return promise;
  }

  private async track<T>(loader: () => Promise<T>): Promise<T> {
    await this.acquire();
    this.maxObservedConcurrency = Math.max(this.maxObservedConcurrency, this.activeRequests);
    try {
      return await loader();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeRequests < this.maxConcurrentRequests) {
      this.activeRequests += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeRequests -= 1;
  }
}

export function validateAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  try {
    return parseAnalyticsPeriod(value);
  } catch {
    throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 400, message: "period must be one of 24h, 7d, 30d." });
  }
}

export function validateMarketId(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 400, message: "marketId must be a positive integer." });
  }
  return parsed;
}

export function validateHistoryMetric(value: unknown): AnalyticsHistoryMetric {
  if (value === "price" || value === "volume" || value === "funding") return value;
  throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 400, message: "metric must be one of price, volume, funding." });
}

function collateralDecimalsFrom(context: Context): number {
  const tokenId = context.instances[0]?.collateral_token_id;
  return context.tokens.find((token) => token.id === tokenId)?.decimals ?? 0;
}

async function mapLimit<T>(items: T[], limit: number, iteratee: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]!;
      index += 1;
      await iteratee(item);
    }
  });
  await Promise.all(workers);
}
