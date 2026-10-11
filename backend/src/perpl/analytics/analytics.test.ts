import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { PerplApiError } from "../errors.js";
import type { PerplPublicClient } from "../publicClient.js";
import type { PerplService } from "../service.js";
import type { Candle, Context, FundingEvent, L2Book, PerplMarket } from "../types.js";
import { createApp } from "../../server.js";
import { calculateMarketAnalytics, sumCandleVolume } from "./marketMetrics.js";
import { calculateOrderBookMetrics } from "./orderBookMetrics.js";
import { buildProtocolOverview } from "./protocolMetrics.js";
import { PerplAnalyticsService } from "./analyticsService.js";
import { availabilityMatrix } from "./availability.js";
import { aggregateVolumeSeries, candleSeries, dedupeCandles } from "./timeSeries.js";

test("market metrics compute spread, OI USD, period volumes, price change, funding, closed status, and huge amounts", () => {
  const analytics = calculateMarketAnalytics(
    {
      market: market({ isOpen: false }),
      period: "24h",
      candles24h: [candle(1, "1000000000000000000000", 10000, 11000, 12000, 9000, 3)],
      candles7d: [candle(1, "2000000000000000000000", 10000, 11000, 12000, 9000, 3)],
      candles30d: [candle(1, "3000000000000000000000", 10000, 11000, 12000, 9000, 3)],
      funding: [funding(1, 1000), funding(2, -2000)],
      orderBook: null
    },
    18
  );

  assert.equal(analytics.isOpen, false);
  assert.equal(analytics.current.absoluteSpread.value, "2");
  assert.equal(analytics.current.spreadBps.value, 200);
  assert.equal(analytics.openInterest.openInterestUsdEstimate.value, "10000");
  assert.equal(analytics.volume.volume24h.value, "1000");
  assert.equal(analytics.volume.volume7d.value, "2000");
  assert.equal(analytics.volume.volume30d.value, "3000");
  assert.equal(analytics.volume.tradeCount24h.value, 3);
  assert.equal(analytics.price.priceChange.value, "10");
  assert.equal(analytics.funding.fundingRateRaw.value, 1000);
  assert.equal(analytics.funding.averageFundingRate.value, -500);
  assert.equal(sumCandleVolume([candle(1, "123456789012345678901234567890", 1, 1, 1, 1, 1)], 18).toFixed(), "123456789012.34567890123456789");
});

test("market metrics safely handle missing mark price", () => {
  const analytics = calculateMarketAnalytics(
    { market: market({ markPrice: null }), period: "24h", candles24h: [], candles7d: [], candles30d: [], funding: [], orderBook: null },
    18
  );

  assert.equal(analytics.openInterest.openInterestUsdEstimate.value, null);
  assert.equal(analytics.price.openPrice.value, null);
});

test("order book metrics compute depth bands and imbalance without NaN", () => {
  const metrics = calculateOrderBookMetrics(
    {
      mt: 15,
      sn: 1,
      at: { t: 1 },
      bid: [
        { p: 9900, s: 1000000, o: 1 },
        { p: 9800, s: 2000000, o: 1 }
      ],
      ask: [{ p: 10100, s: 1000000, o: 1 }]
    },
    market(),
    25
  );
  const empty = calculateOrderBookMetrics({ mt: 15, at: {}, bid: [], ask: [] }, market(), 25);
  const oneSided = calculateOrderBookMetrics({ mt: 15, at: {}, bid: [{ p: 9900, s: 1000000, o: 1 }], ask: [] }, market(), 25);

  assert.equal(metrics.bidDepth.value, "295");
  assert.equal(metrics.askDepth.value, "101");
  assert.equal(metrics.depthWithin100Bps.value?.bid, "99");
  assert.equal(metrics.orderBookImbalance.value, 194 / 396);
  assert.equal(empty.orderBookImbalance.value, null);
  assert.equal(oneSided.spreadBps.value, null);
});

test("protocol aggregation sums volume/OI shares, handles nulls, TVL, rankings, and partial failures", () => {
  const overview = buildProtocolOverview({
    period: "24h",
    markets: [
      marketAnalytics(1, "BTC", "100", "1000", "500", 10),
      marketAnalytics(2, "ETH", "300", "2000", "1500", 5)
    ],
    availability: availabilityMatrix(),
    calculatedAt: "2026-10-11T00:00:00.000Z",
    warnings: ["PARTIAL_MARKET_DATA"],
    failedMarkets: [{ marketId: 3, symbol: "SOL", reason: "503" }],
    aggregateVolumeSeries: [],
    aggregatePriceActivitySeries: [],
    aggregateFundingSeries: []
  });

  assert.equal(overview.metrics.totalVolume24h.value, "400");
  assert.equal(overview.metrics.totalOpenInterestUsdEstimate.value, "300000");
  assert.equal(overview.metrics.totalTvl.value, "2000");
  assert.equal(overview.volumeByMarket[0]?.symbol, "ETH");
  assert.equal(overview.openInterestByMarket[1]?.share, 1 / 3);
  assert.equal(overview.marketRankings[0]?.symbol, "ETH");
  assert.equal(overview.failedMarkets.length, 1);
  assert.equal(overview.series.historicalOpenInterest.status, "unavailable");
});

test("time series dedupes, sorts, aligns timestamps, and does not fill gaps", () => {
  const candles = [candle(2, "100", 1, 1, 1, 1, 1), candle(1, "100", 1, 1, 1, 1, 1), candle(2, "200", 1, 1, 1, 1, 1)];
  const deduped = dedupeCandles(candles);
  const seriesA = candleSeries(deduped, market(), "volume", 0);
  const seriesB = [{ timestamp: 2, value: "5", status: "available" as const }];
  const aggregate = aggregateVolumeSeries([seriesA, seriesB]);

  assert.deepEqual(deduped.map((item) => item.t), [1, 2]);
  assert.deepEqual(aggregate.map((item) => item.timestamp), [1, 2]);
  assert.equal(aggregate[1]?.value, "205");
  assert.equal(aggregate[1]?.marketCoverage, 2);
});

test("analytics service caches, shares inflight requests, avoids caching errors, and limits concurrency", async () => {
  let now = 1_000;
  const calls: Record<string, number> = {};
  let failBook = true;
  const service = new PerplAnalyticsService({
    nowMs: () => now,
    perplService: perplServiceMock([market({ id: 1 }), market({ id: 2 }), market({ id: 3 }), market({ id: 4 }), market({ id: 5 })]),
    publicClient: publicClientMock(calls, () => failBook, () => {
      failBook = false;
    })
  });

  await Promise.all([service.getMarketHistory(1, "24h", "volume"), service.getMarketHistory(1, "24h", "volume")]);
  assert.equal(calls.candles, 1);
  now += 31_000;
  await service.getMarketHistory(1, "24h", "volume");
  assert.equal(calls.candles, 2);
  await assert.rejects(service.getMarketAnalytics(1, "24h"));
  await service.getMarketAnalytics(1, "24h");
  assert.equal(calls.book, 2);
  await service.getOverview("24h");
  assert.ok(service.getMaxObservedConcurrency() <= 4);
});

test("analytics API routes validate params and redact errors", async () => {
  const analytics = {
    async getOverview() {
      return { ok: true };
    },
    async getMarketAnalytics(id: number) {
      if (id === 404) throw new PerplApiError({ code: "PERPL_NOT_FOUND", statusCode: 404, perplStatus: 404, message: "not found secret signature" });
      return { marketId: id };
    },
    async getMarketHistory() {
      return { series: [] };
    },
    getAvailability() {
      return { dataAvailability: [] };
    }
  } as unknown as PerplAnalyticsService;
  const app = createApp({ perplAnalyticsService: analytics });

  assert.equal((await dispatch(app, "/api/perpl/overview?period=24h")).status, 200);
  assert.equal((await dispatch(app, "/api/perpl/markets/1?period=7d")).status, 200);
  assert.equal((await dispatch(app, "/api/perpl/markets/1/history?period=30d&metric=price")).status, 200);
  assert.equal((await dispatch(app, "/api/perpl/analytics/availability")).status, 200);
  assert.equal((await dispatch(app, "/api/perpl/overview?period=bad")).status, 400);
  assert.equal((await dispatch(app, "/api/perpl/markets/1/history?metric=bad")).status, 400);
  const missing = await dispatch(app, "/api/perpl/markets/404");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.includes("secret"), false);
  assert.equal(missing.body.includes("signature"), false);
});

function market(overrides: Partial<PerplMarket> = {}): PerplMarket {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    id: 1,
    symbol: "BTC",
    name: "Bitcoin",
    sizeUnits: "BTC",
    priceDecimals: 2,
    sizeDecimals: 6,
    isOpen: true,
    oraclePrice: "100",
    markPrice: "100",
    lastPrice: "100",
    midPrice: "100",
    bestBid: "99",
    bestAsk: "101",
    dailyVolumeSize: "10",
    dailyVolumeAmount: "1000",
    openInterest: "100",
    totalValueLocked: "500",
    fundingRateMicros: 1000,
    fundingIndexPrice: "100",
    ...overrides
  };
}

function candle(t: number, v: string, o: number, c: number, h: number, l: number, n: number): Candle {
  return { t, v, o, c, h, l, n };
}

function funding(t: number, rate: number): FundingEvent {
  return { at: { t }, feb: t, rate, idx: 100, ppl: 0, sum: 0, div: 1 };
}

function marketAnalytics(id: number, symbol: string, volume: string, oi: string, tvl: string, fundingRate: number) {
  const base = calculateMarketAnalytics(
    { market: market({ id, symbol, openInterest: oi, totalValueLocked: tvl, fundingRateMicros: fundingRate }), period: "24h", candles24h: [candle(1, volume, 1, 1, 1, 1, 1)], candles7d: [], candles30d: [], funding: [], orderBook: null },
    0
  );
  return base;
}

function perplServiceMock(markets: PerplMarket[]): PerplService {
  const context: Context = {
    chain: { ver: 1, chain_id: 10143, gas: { at: {}, h: 1, max: "0", p95: "0", p50: "0", min: "0", base: "0" } },
    instances: [{ ver: 1, id: 1, address: "0x1964c32f0be608e7d29302aff5e61268e72080cc", collateral_token_id: 1, min_account_open_amount: "0", min_deposit_amount: "0", min_withdraw_amount: "0", max_account_trigger_orders: 1 }],
    tokens: [{ ver: 1, id: 1, symbol: "USD", name: "USD", decimals: 18, display_precision: 2 }],
    markets: []
  };
  return {
    async getRawContext() {
      return context;
    },
    async getMarkets() {
      return markets;
    }
  } as unknown as PerplService;
}

function publicClientMock(calls: Record<string, number>, shouldFailBook: () => boolean, didFailBook: () => void): PerplPublicClient {
  return {
    async getCandles() {
      calls.candles = (calls.candles ?? 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { mt: 1, at: {}, r: 3600, d: [candle(1, "1000000000000000000", 100, 101, 102, 99, 1)] };
    },
    async getFunding() {
      calls.funding = (calls.funding ?? 0) + 1;
      return { mt: 1, at: {}, m: 1, d: [funding(1, 1000)] };
    },
    async getOrderBook() {
      calls.book = (calls.book ?? 0) + 1;
      if (shouldFailBook()) {
        didFailBook();
        throw new Error("temporary");
      }
      return { mt: 15, at: {}, bid: [], ask: [] } satisfies L2Book;
    }
  } as unknown as PerplPublicClient;
}

async function dispatch(app: ReturnType<typeof createApp>, url: string): Promise<{ status: number; body: string }> {
  const req = new Readable({ read() {} }) as Readable & { method: string; url: string; headers: Record<string, string> };
  req.method = "GET";
  req.url = url;
  req.headers = {};
  req.push(null);
  const chunks: Buffer[] = [];
  const headers = new Map<string, string | number | string[]>();
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  }) as Writable & {
    statusCode: number;
    setHeader: (name: string, value: string | number | string[]) => void;
    getHeader: (name: string) => string | number | string[] | undefined;
    removeHeader: (name: string) => void;
    end: (...args: unknown[]) => typeof res;
  };
  res.statusCode = 200;
  res.setHeader = (name, value) => headers.set(name.toLowerCase(), value);
  res.getHeader = (name) => headers.get(name.toLowerCase());
  res.removeHeader = (name) => headers.delete(name.toLowerCase());
  res.end = (...args: unknown[]) => {
    const chunk = args[0];
    if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    queueMicrotask(() => res.emit("finish"));
    return res;
  };
  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    (app as unknown as { handle: (request: typeof req, response: typeof res, done: (error?: unknown) => void) => void }).handle(req, res, (error) =>
      error ? reject(error) : resolve()
    );
  });
  return { status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") };
}
