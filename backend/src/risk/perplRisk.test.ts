import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { PerplApiError } from "../perpl/errors.js";
import type { PerplService } from "../perpl/service.js";
import type {
  Context,
  PerplMarket,
  PerplOrder,
  PerplPosition,
  PerplWalletSummary,
  Portfolio,
  Position
} from "../perpl/types.js";
import { createApp } from "../server.js";
import { calculatePerformanceMetrics } from "./performanceMetrics.js";
import { buildRiskSnapshot } from "./perplRiskService.js";
import { scoreRisk } from "./riskScore.js";
import { simulatePerplRisk } from "./simulator.js";
import { calculatePositionRisks, calculateWalletMetrics } from "./walletMetrics.js";
import type { PerplRiskDataBundle } from "./perplRiskTypes.js";

test("wallet metrics handle single long position", () => {
  const metrics = calculateWalletMetrics({ wallet: wallet(), positions: [position({ side: "long" })], orders: [], markets: markets() });
  const risks = calculatePositionRisks({ wallet: wallet(), positions: [position({ side: "long" })], orders: [], markets: markets() });

  assert.equal(metrics.grossPositionNotional, "12000");
  assert.equal(metrics.longNotional, "12000");
  assert.equal(metrics.shortNotional, "0");
  assert.equal(metrics.estimatedUnrealizedPnl, "2000");
  assert.equal(risks[0]?.estimatedPnlPercent, 16.67);
});

test("wallet metrics handle short, multi-position exposure, concentration, locked ratio, and negative PnL", () => {
  const input = {
    wallet: wallet(),
    positions: [position({ positionId: "1", side: "long", entryPrice: "100", marketId: 1 }), position({ positionId: "2", side: "short", entryPrice: "200", marketId: 2 })],
    orders: [order()],
    markets: markets()
  };
  const metrics = calculateWalletMetrics(input);
  const risks = calculatePositionRisks(input);

  assert.equal(metrics.grossPositionNotional, "24000");
  assert.equal(metrics.netDirectionalNotional, "0");
  assert.equal(metrics.largestPositionShare, 0.5);
  assert.equal(metrics.lockedBalanceRatio, 0.25);
  assert.equal(metrics.longShortSkew, 0);
  assert.equal(risks[1]?.estimatedUnrealizedPnl, "8000");
});

test("wallet metrics mark missing data instead of using zero", () => {
  const risks = calculatePositionRisks({ wallet: wallet(), positions: [position({ marketId: 99 })], orders: [], markets: markets() });

  assert.equal(risks[0]?.markPrice, null);
  assert.equal(risks[0]?.notional, null);
  assert.equal(risks[0]?.dataWarnings.includes("MARK_PRICE_UNAVAILABLE"), true);
});

test("wallet metrics support empty positions and huge decimal balances", () => {
  const metrics = calculateWalletMetrics({
    wallet: wallet({ balance: "123456789012345678901234567890.123456789", locked: "1" }),
    positions: [],
    orders: [],
    markets: markets()
  });

  assert.equal(metrics.openPositionCount, 0);
  assert.equal(metrics.grossPositionNotional, "0");
  assert.equal(metrics.totalBalance, "123456789012345678901234567890.123456789");
});

test("performance metrics compute win rate, profit factor, drawdown, streaks, holding time, and markets", () => {
  const perf = calculatePerformanceMetrics({
    positionHistory: [
      rawPosition({ mkt: 1, pid: 1, dpnl: "100", ots: { t: 1000 }, at: { t: 11_000 } }),
      rawPosition({ mkt: 2, pid: 2, dpnl: "-25", ots: { t: 20_000 }, at: { t: 30_000 } }),
      rawPosition({ mkt: 1, pid: 3, dpnl: "50", ots: { t: 40_000 }, at: { t: 50_000 } })
    ],
    fills: [],
    portfolioEquity: portfolio(["1000", "900", "1200", "1000"]),
    markets: markets()
  });

  assert.equal(perf.winRate, 2 / 3);
  assert.equal(perf.profitFactor, 6);
  assert.equal(perf.maxDrawdown, "200");
  assert.equal(perf.currentWinStreak, 1);
  assert.equal(perf.longestWinStreak, 1);
  assert.equal(perf.averageHoldingTimeSeconds, 10);
  assert.equal(perf.bestMarket?.marketId, 1);
  assert.equal(perf.worstMarket?.marketId, 2);
});

test("performance metrics avoid Infinity and handle empty/unsorted history", () => {
  const perf = calculatePerformanceMetrics({
    positionHistory: [
      rawPosition({ pid: 2, dpnl: "5", at: { t: 20_000 } }),
      rawPosition({ pid: 1, dpnl: "10", at: { t: 10_000 } })
    ],
    fills: [],
    portfolioEquity: portfolio([]),
    markets: markets()
  });
  const empty = calculatePerformanceMetrics({ positionHistory: [], fills: [], portfolioEquity: portfolio([]), markets: markets() });

  assert.equal(perf.profitFactor, null);
  assert.match(perf.profitFactorUnavailableReason ?? "", /unbounded/);
  assert.equal(empty.closedPositionCount, 0);
  assert.equal(empty.maxDrawdown, null);
});

test("risk scoring normalizes missing components, coverage, no exposure, thresholds, and critical override", () => {
  const walletMetrics = calculateWalletMetrics({ wallet: wallet(), positions: [position({ leverage: "10" })], orders: [], markets: markets() });
  const positions = calculatePositionRisks({ wallet: wallet(), positions: [position({ leverage: "10" })], orders: [], markets: markets() });
  const performance = calculatePerformanceMetrics({ positionHistory: [], fills: [], portfolioEquity: portfolio(["100", "50"]), markets: markets() });
  const scored = scoreRisk({
    walletMetrics,
    positions,
    performance,
    accountFrozen: false,
    dataQuality: { stale: false, partialHistory: false, missingFields: [], warnings: [] }
  });
  const noExposureMetrics = calculateWalletMetrics({ wallet: wallet(), positions: [], orders: [], markets: markets() });
  const emptyPerformance = calculatePerformanceMetrics({ positionHistory: [], fills: [], portfolioEquity: portfolio([]), markets: markets() });
  const noExposure = scoreRisk({
    walletMetrics: noExposureMetrics,
    positions: [],
    performance: emptyPerformance,
    accountFrozen: false,
    dataQuality: { stale: false, partialHistory: false, missingFields: [], warnings: [] }
  });
  const critical = scoreRisk({
    walletMetrics: { ...walletMetrics, balancePlusUnrealizedPnlEstimate: "-1" },
    positions,
    performance,
    accountFrozen: false,
    dataQuality: { stale: false, partialHistory: false, missingFields: [], warnings: [] }
  });

  assert.equal(scored.components.find((component) => component.id === "leverage")?.score, 80);
  assert.equal(scored.components.find((component) => component.id === "liquidation_distance")?.available, false);
  assert.ok(scored.scoreCoveragePercent < 100);
  assert.equal(noExposure.riskLevel, "low");
  assert.equal(critical.riskLevel, "critical");
  assert.ok((critical.score ?? 0) >= 75);
});

test("risk scoring returns unknown when coverage is below 60 and never treats missing as zero", () => {
  const scored = scoreRisk({
    walletMetrics: {
      totalBalance: "0",
      totalLockedBalance: "0",
      lockedBalanceRatio: null,
      grossPositionNotional: "1",
      longNotional: "1",
      shortNotional: "0",
      netDirectionalNotional: "1",
      estimatedUnrealizedPnl: null,
      balancePlusUnrealizedPnlEstimate: null,
      effectiveLeverageEstimate: null,
      largestPositionShare: null,
      openPositionCount: 1,
      openOrderCount: 0,
      marketCount: 1,
      longShortSkew: null
    },
    positions: [positionRiskMissing()],
    performance: calculatePerformanceMetrics({ positionHistory: [], fills: [], portfolioEquity: portfolio([]), markets: markets() }),
    accountFrozen: false,
    dataQuality: { stale: false, partialHistory: false, missingFields: ["MARK_PRICE_UNAVAILABLE"], warnings: [] }
  });

  assert.equal(scored.riskLevel, "unknown");
  assert.equal(scored.components.find((component) => component.id === "concentration")?.score, null);
});

test("simulator changes exposure and rejects invalid actions without mutating input", () => {
  const bundle = riskBundle({ positions: [position({ positionId: "1" })], orders: [order("42")] });
  const before = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const originalSize = bundle.positions[0]?.size;
  const reduced = simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "reduce_position", positionId: "1", percentage: 0.5 }] });
  const closed = simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "close_position", positionId: "1" }] });
  const canceled = simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "cancel_order", orderId: "42" }] });
  const collateral = simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "add_collateral", amount: "1000" }] });
  const hold = simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "hold" }] });

  assert.equal(bundle.positions[0]?.size, originalSize);
  assert.notEqual(reduced.afterMetrics.grossPositionNotional, before.walletMetrics.grossPositionNotional);
  assert.equal(closed.after.positions.length, 0);
  assert.equal(canceled.afterMetrics.openOrderCount, 0);
  assert.notEqual(collateral.afterMetrics.effectiveLeverageEstimate, before.walletMetrics.effectiveLeverageEstimate);
  assert.deepEqual(hold.afterMetrics, before.walletMetrics);
  assert.throws(() => simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "reduce_position", positionId: "1", percentage: 1 }] }));
  assert.throws(() => simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "add_collateral", amount: "-1" }] }));
  assert.throws(() => simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "close_position", positionId: "missing" }] }));
  assert.throws(() => simulatePerplRisk(before, bundle, markets(), { actions: [{ type: "cancel_order", orderId: "missing" }] }));
});

test("risk API returns snapshot, simulation, 503, 400, and redacted Perpl errors", async () => {
  const okApp = createApp({ perplService: serviceMock(riskBundle({ positions: [], orders: [] }), markets()) });
  const risk = await dispatch(okApp, "GET", "/api/perpl/risk");
  const simulate = await dispatch(okApp, "POST", "/api/perpl/risk/simulate", { actions: [{ type: "hold" }] });
  const missing = await dispatch(createApp({ perplService: serviceError("PERPL_CREDENTIALS_NOT_CONFIGURED", 503) }), "GET", "/api/perpl/risk");
  const invalid = await dispatch(okApp, "POST", "/api/perpl/risk/simulate", { actions: [{ type: "add_collateral", amount: "-1" }] });
  const auth = await dispatch(createApp({ perplService: serviceError("PERPL_UNAUTHORIZED", 401) }), "GET", "/api/perpl/risk");

  assert.equal(risk.status, 200);
  assert.equal(JSON.parse(risk.body).methodologyVersion, "assetpilot-perpl-risk-v1");
  assert.equal(simulate.status, 200);
  assert.equal(missing.status, 503);
  assert.equal(invalid.status, 400);
  assert.equal(auth.status, 401);
  assert.equal(auth.body.includes("secret"), false);
  assert.equal(auth.body.includes("signature"), false);
});

test("risk snapshot reports partial history", () => {
  const snapshot = buildRiskSnapshot({ ...riskBundle({ positions: [], orders: [] }), historyComplete: false }, markets());

  assert.equal(snapshot.dataQuality.partialHistory, true);
  assert.equal(snapshot.issues.some((issue) => issue.code === "PARTIAL_HISTORY"), true);
});

function wallet(overrides: { balance?: string; locked?: string } = {}): PerplWalletSummary {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    address: "0x1111111111111111111111111111111111111111",
    nonce: 1,
    feeLevel: 0,
    accounts: [
      {
        instanceId: 1,
        accountId: 7,
        isFrozen: false,
        allowsForwarding: true,
        feeTier: 0,
        lastForwardedRequestId: "1",
        balance: overrides.balance ?? "10000",
        lockedBalance: overrides.locked ?? "2500"
      }
    ],
    stats: []
  };
}

function markets(): PerplMarket[] {
  return [
    market(1, "BTC", "120"),
    market(2, "ETH", "120")
  ];
}

function market(id: number, symbol: string, markPrice: string | null): PerplMarket {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    id,
    symbol,
    name: symbol,
    sizeUnits: symbol,
    priceDecimals: 2,
    sizeDecimals: 6,
    isOpen: true,
    oraclePrice: markPrice,
    markPrice,
    lastPrice: markPrice,
    midPrice: markPrice,
    bestBid: markPrice,
    bestAsk: markPrice,
    dailyVolumeSize: "0",
    dailyVolumeAmount: "0",
    openInterest: "0",
    totalValueLocked: "0",
    fundingRateMicros: 1000,
    fundingIndexPrice: markPrice
  };
}

function position(overrides: Partial<PerplPosition> = {}): PerplPosition {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    marketId: 1,
    marketSymbol: "BTC",
    accountId: 7,
    positionId: "1",
    side: "long",
    status: 1,
    statusReason: 21,
    collateral: "1000",
    entryPrice: "100",
    size: "100",
    fee: "0",
    closeFee: null,
    leverage: "5",
    realizedDeltaPnl: null,
    realizedFundingPnl: null,
    exitPrice: null,
    openedAt: { t: 1000 },
    updatedAt: { t: 2000 },
    ...overrides
  };
}

function order(orderId = "42"): PerplOrder {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    marketId: 1,
    marketSymbol: "BTC",
    accountId: 7,
    orderId,
    requestId: "1",
    smartContractOrderId: "1",
    type: 1,
    status: 2,
    statusReason: 0,
    failureReason: null,
    limitPrice: "100",
    originalSize: "10",
    fillPrice: "0",
    filledSize: "0",
    fee: "0",
    builderFee: null,
    flags: 0,
    leverage: "5",
    createdAt: { t: 1000 },
    updatedAt: { t: 2000 }
  };
}

function rawPosition(overrides: Partial<Position> = {}): Position {
  return {
    at: { t: 2000 },
    mkt: 1,
    acc: 7,
    pid: 1,
    rq: 1,
    oid: 1,
    st: 1,
    sr: 13,
    sd: 1,
    c: "0",
    ep: 100,
    s: 0,
    fee: "1",
    cfee: "0",
    efs: 0,
    lv: 100,
    dpnl: "0",
    fnd: "0",
    xp: 100,
    xfs: 0,
    ots: { t: 1000 },
    ...overrides
  };
}

function portfolio(values: string[]): Portfolio {
  return { at: { t: 1 }, chart: values.map((v, index) => ({ t: index + 1, v })) };
}

function riskBundle(args: { positions: PerplPosition[]; orders: PerplOrder[] }): PerplRiskDataBundle {
  return {
    wallet: wallet(),
    positions: args.positions,
    orders: args.orders,
    fills: [],
    accountHistory: [],
    orderHistory: [],
    positionHistory: [],
    portfolioEquity: portfolio(["10000", "9900", "10100"]),
    portfolioPnl: portfolio(["0", "-100", "100"]),
    historyComplete: true,
    pagesFetched: 3,
    recordsFetched: 0,
    partialErrors: []
  };
}

function positionRiskMissing() {
  return {
    positionId: "1",
    accountId: 7,
    marketId: 1,
    marketSymbol: "BTC",
    side: null,
    size: null,
    entryPrice: null,
    markPrice: null,
    notional: null,
    leverage: "0",
    estimatedUnrealizedPnl: null,
    estimatedPnlPercent: null,
    concentrationShare: null,
    fundingRateRaw: null,
    liquidationPrice: null,
    liquidationDistancePercent: null,
    dataWarnings: ["MARK_PRICE_UNAVAILABLE"]
  };
}

function serviceMock(bundle: PerplRiskDataBundle, m: PerplMarket[]): PerplService {
  return {
    async getRiskDataBundle() {
      return bundle;
    },
    async getMarkets() {
      return m;
    }
  } as unknown as PerplService;
}

function serviceError(code: "PERPL_CREDENTIALS_NOT_CONFIGURED" | "PERPL_UNAUTHORIZED", statusCode: number): PerplService {
  return {
    async getRiskDataBundle() {
      throw new PerplApiError({ code, statusCode, perplStatus: statusCode === 401 ? 401 : undefined, message: "Perpl error" });
    },
    async getMarkets() {
      return markets();
    }
  } as unknown as PerplService;
}

async function dispatch(app: ReturnType<typeof createApp>, method: "GET" | "POST", url: string, body?: unknown): Promise<{ status: number; body: string }> {
  const req = new Readable({ read() {} }) as Readable & { method: string; url: string; headers: Record<string, string> };
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  req.method = method;
  req.url = url;
  req.headers = rawBody ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(rawBody)) } : {};
  req.push(rawBody || null);
  if (rawBody) req.push(null);

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
