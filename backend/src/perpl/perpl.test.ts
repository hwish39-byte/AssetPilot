import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { PERPL_TESTNET_DEFAULTS, type PerplConfig } from "./config.js";
import { PerplApiError } from "./errors.js";
import { normalizeFills, normalizeMarket, normalizePositions, normalizeWallet, scaleInteger } from "./normalize.js";
import { PerplPublicClient, type PerplFetch } from "./publicClient.js";
import { PerplService, type PerplServiceOptions } from "./service.js";
import { PerplSignedClient, sha256Hex } from "./signedClient.js";
import type { Context, Fill, Order, Position, Wallet } from "./types.js";
import { createApp } from "../server.js";

const configWithCredentials: PerplConfig = {
  ...PERPL_TESTNET_DEFAULTS,
  readApiKey: "read_key_for_tests",
  readApiKeySecret: "01".repeat(32)
};

test("public context request succeeds", async () => {
  const calls: string[] = [];
  const client = new PerplPublicClient({
    apiUrl: configWithCredentials.apiUrl,
    fetchImpl: mockFetch(calls, [jsonResponse(sampleContext())])
  });

  const context = await client.getContext();

  assert.equal(context.markets.length, 1);
  assert.deepEqual(calls, ["https://testnet.perpl.xyz/api/v1/pub/context"]);
});

test("non-2xx responses are converted to PerplApiError", async () => {
  const client = new PerplPublicClient({
    apiUrl: configWithCredentials.apiUrl,
    fetchImpl: mockFetch([], [jsonResponse({ error: "bad" }, { status: 400 })]),
    maxRetries: 0
  });

  await assert.rejects(client.getContext(), (error) => {
    assert.equal(error instanceof PerplApiError, true);
    assert.equal((error as PerplApiError).code, "PERPL_HTTP_ERROR");
    assert.equal((error as PerplApiError).perplStatus, 400);
    return true;
  });
});

test("429 and 503 responses retry a limited number of times", async () => {
  const sleeps: number[] = [];
  const client = new PerplPublicClient({
    apiUrl: configWithCredentials.apiUrl,
    fetchImpl: mockFetch([], [
      jsonResponse({}, { status: 429 }),
      jsonResponse({}, { status: 503 }),
      jsonResponse(sampleContext())
    ]),
    retryDelayMs: (attempt) => attempt + 10,
    sleep: async (ms) => {
      sleeps.push(ms);
    }
  });

  const context = await client.getContext();

  assert.equal(context.markets[0]?.symbol, "BTC");
  assert.deepEqual(sleeps, [10, 11]);
});

test("401 and 403 responses do not retry", async () => {
  for (const status of [401, 403]) {
    const calls: string[] = [];
    const client = new PerplPublicClient({
      apiUrl: configWithCredentials.apiUrl,
      fetchImpl: mockFetch(calls, [jsonResponse({}, { status })])
    });

    await assert.rejects(client.getContext(), PerplApiError);
    assert.equal(calls.length, 1);
  }
});

test("canonical signing string content is exact", async () => {
  const signed: string[] = [];
  const client = new PerplSignedClient({
    config: configWithCredentials,
    nowMs: () => 1234567890,
    nonceGenerator: () => "nonce_for_test",
    onSignedRequest: ({ canonical }) => signed.push(canonical)
  });

  await client.sign("GET", "/v1/trading/fills?count=1", "");

  assert.equal(
    signed[0],
    [
      "10143",
      "GET",
      "/v1/trading/fills?count=1",
      "1234567890",
      "nonce_for_test",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    ].join("\n")
  );
});

test("query string is included in signed request target", async () => {
  let canonical = "";
  const client = new PerplSignedClient({
    config: configWithCredentials,
    nowMs: () => 1,
    nonceGenerator: () => "n",
    onSignedRequest: (debug) => {
      canonical = debug.canonical;
    }
  });

  await client.sign("GET", "/v1/trading/fills?count=50&page=abc", "");

  assert.match(canonical, /^10143\nGET\n\/v1\/trading\/fills\?count=50&page=abc\n/);
});

test("each signature uses a fresh nonce", async () => {
  let nonceIndex = 0;
  const client = new PerplSignedClient({
    config: configWithCredentials,
    nowMs: () => 1,
    nonceGenerator: () => `nonce_${++nonceIndex}`
  });

  const first = await client.sign("GET", "/v1/trading/wallet");
  const second = await client.sign("GET", "/v1/trading/wallet");

  assert.equal(first.debug.nonce, "nonce_1");
  assert.equal(second.debug.nonce, "nonce_2");
  assert.notEqual(first.debug.signature, second.debug.signature);
});

test("signed request retries re-sign every attempt with fresh nonce and timestamp", async () => {
  const calls: Array<{ url: string; nonce: string | null; timestamp: string | null }> = [];
  const signedRequests: Array<{ canonical: string; nonce: string; timestamp: string }> = [];
  let now = 1000;
  let nonce = 0;
  const client = new PerplSignedClient({
    config: configWithCredentials,
    fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        nonce: headers.get("X-API-Nonce"),
        timestamp: headers.get("X-API-Timestamp")
      });
      const response = [jsonResponse({}, { status: 429 }), jsonResponse({}, { status: 503 }), jsonResponse({ d: [], np: "" })][
        calls.length - 1
      ];
      return response;
    }) as PerplFetch,
    nowMs: () => now++,
    nonceGenerator: () => `retry_nonce_${++nonce}`,
    retryDelayMs: () => 0,
    sleep: async () => {},
    onSignedRequest: ({ canonical, nonce, timestamp }) => {
      signedRequests.push({ canonical, nonce, timestamp });
    }
  });

  await client.getFills({ count: 50, page: "abc" });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.nonce), ["retry_nonce_1", "retry_nonce_2", "retry_nonce_3"]);
  assert.deepEqual(calls.map((call) => call.timestamp), ["1000", "1001", "1002"]);
  assert.deepEqual(signedRequests.map((request) => request.nonce), ["retry_nonce_1", "retry_nonce_2", "retry_nonce_3"]);
  assert.deepEqual(signedRequests.map((request) => request.timestamp), ["1000", "1001", "1002"]);
  assert.equal(signedRequests.every((request) => request.canonical.includes("/v1/trading/fills?count=50&page=abc")), true);
});

test("signed 401 and 403 responses do not retry or re-sign", async () => {
  for (const status of [401, 403]) {
    const calls: string[] = [];
    const signedRequests: string[] = [];
    const client = new PerplSignedClient({
      config: configWithCredentials,
      fetchImpl: mockFetch(calls, [jsonResponse({}, { status })]),
      nowMs: () => 1,
      nonceGenerator: () => "auth_error_nonce",
      onSignedRequest: ({ nonce }) => signedRequests.push(nonce)
    });

    await assert.rejects(client.getWallet(), PerplApiError);

    assert.equal(calls.length, 1);
    assert.deepEqual(signedRequests, ["auth_error_nonce"]);
  }
});

test("empty body SHA-256 is correct", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("Amount, price, and size normalization preserve precision as strings", () => {
  const context = sampleContext();
  const market = normalizeMarket(context.markets[0]!, "2026-10-11T00:00:00.000Z");
  const positions = normalizePositions([samplePosition()], context, "2026-10-11T00:00:00.000Z");
  const fills = normalizeFills([sampleFill()], context, "2026-10-11T00:00:00.000Z");

  assert.equal(scaleInteger("1234567890123456789012345", 18), "1234567.890123456789012345");
  assert.equal(market.markPrice, "12345.67");
  assert.equal(market.dailyVolumeSize, "123.456789");
  assert.equal(positions[0]?.collateral, "1234567.890123456789012345");
  assert.equal(positions[0]?.entryPrice, "10000.01");
  assert.equal(positions[0]?.size, "0.123456");
  assert.equal(fills[0]?.fee, "-0.000000000000000123");
});

test("wallet stats normalization scales collateral amounts without precision loss", () => {
  const wallet: Wallet = {
    mt: 19,
    at: { b: 1, t: 2 },
    addr: "0x1111111111111111111111111111111111111111",
    n: 1,
    fl: 0,
    as: [],
    sts: [
      {
        mt: 20,
        in: 1,
        id: 7,
        td: "1234567890123456789012345",
        tw: "1000000000000000000",
        tv: "9876543210987654321098765",
        tf: "250000000000000000",
        trp: "-1234567890123456789",
        wr: 8750,
        tt: 12
      },
      {
        mt: 20,
        in: 1,
        id: 8,
        td: "0",
        tw: "0",
        tv: "1",
        tf: "0",
        tbf: "123",
        trp: "0",
        wr: 0,
        tt: 0
      }
    ]
  };

  const normalized = normalizeWallet(wallet, sampleContext(), "2026-10-11T00:00:00.000Z");

  assert.equal(normalized.stats.length, 2);
  assert.deepEqual(normalized.stats[0], {
    instanceId: 1,
    accountId: 7,
    totalDeposits: "1234567.890123456789012345",
    totalWithdrawals: "1",
    totalVolume: "9876543.210987654321098765",
    totalFees: "0.25",
    totalBuilderFees: null,
    totalRealizedPnl: "-1.234567890123456789",
    winRateBps: 8750,
    tradeCount: 12
  });
  assert.equal(normalized.stats[1]?.totalBuilderFees, "0.000000000000000123");
});

test("wallet stats normalization handles an empty stats array", () => {
  const normalized = normalizeWallet(
    { mt: 19, at: { b: 1, t: 2 }, addr: "0x1111111111111111111111111111111111111111", n: 1, fl: 0, as: [], sts: [] },
    sampleContext(),
    "2026-10-11T00:00:00.000Z"
  );

  assert.deepEqual(normalized.stats, []);
});

test("private route returns stable 503 without credentials", async () => {
  const response = await dispatch(
    createApp({
      perplService: new PerplService({
        config: { ...PERPL_TESTNET_DEFAULTS }
      })
    }),
    "/api/perpl/wallet"
  );
  const body = JSON.parse(response.body) as { error: { code: string; perplStatus: null } };

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERPL_CREDENTIALS_NOT_CONFIGURED");
  assert.equal(body.error.perplStatus, null);
});

test("route error response does not leak key, secret, signature, or headers", async () => {
  const service = new PerplService({
    config: configWithCredentials,
    publicClient: { getContext: async () => sampleContext() } as unknown as PerplServiceOptions["publicClient"],
    signedClient: {
      async getWallet(): Promise<Wallet> {
        throw new PerplApiError({
          code: "PERPL_UNAUTHORIZED",
          statusCode: 401,
          perplStatus: 401,
          message: "Perpl API request failed with HTTP 401.",
          details: {
            key: configWithCredentials.readApiKey,
            secret: configWithCredentials.readApiKeySecret,
            headers: { "X-API-Signature": "signature" }
          }
        });
      }
    } as unknown as PerplServiceOptions["signedClient"]
  });
  const response = await dispatch(createApp({ perplService: service }), "/api/perpl/wallet");

  assert.equal(response.status, 401);
  assert.equal(response.body.includes(configWithCredentials.readApiKey!), false);
  assert.equal(response.body.includes(configWithCredentials.readApiKeySecret!), false);
  assert.equal(response.body.includes("X-API-Signature"), false);
  assert.equal(response.body.includes("signature"), false);
});

test("empty private positions, orders, and fills return empty normalized arrays", async () => {
  let contextCalls = 0;
  const service = new PerplService({
    config: configWithCredentials,
    publicClient: {
      async getContext(): Promise<Context> {
        contextCalls += 1;
        return sampleContext();
      }
    } as unknown as PerplServiceOptions["publicClient"],
    signedClient: {
      async getPositions() {
        return { mt: 26, sn: 1, at: { b: 1, t: 2 }, d: [] };
      },
      async getOrders() {
        return { mt: 23, sn: 1, at: { b: 1, t: 2 }, d: [] };
      },
      async getFills() {
        return { d: [], np: "" };
      }
    } as unknown as PerplServiceOptions["signedClient"],
    nowMs: () => 1000
  });

  assert.deepEqual(await service.getPositions(), []);
  assert.deepEqual(await service.getOrders(), []);
  assert.deepEqual(await service.getFills({ count: 50 }), { data: [], nextPage: "" });
  assert.equal(contextCalls, 1);
});

test("context cache prevents duplicate public context requests within ttl", async () => {
  let contextCalls = 0;
  const service = new PerplService({
    config: configWithCredentials,
    publicClient: {
      async getContext(): Promise<Context> {
        contextCalls += 1;
        return sampleContext();
      }
    } as unknown as PerplServiceOptions["publicClient"],
    contextTtlMs: 30_000,
    nowMs: () => 1000
  });

  await service.getMarkets();
  await service.getContext();

  assert.equal(contextCalls, 1);
});

test("smoke check public client methods construct expected URLs", async () => {
  const calls: string[] = [];
  const client = new PerplPublicClient({
    apiUrl: configWithCredentials.apiUrl,
    fetchImpl: mockFetch(calls, [
      jsonResponse({ mt: 9, sn: 1, d: {} }),
      jsonResponse({ mt: 9, sn: 1, d: {} }),
      jsonResponse({ mt: 15, sn: 1, at: { b: 1, t: 2 }, bid: [], ask: [] }),
      jsonResponse({ mt: 10, at: { b: 1, t: 2 }, m: 16, d: [] }),
      jsonResponse({ mt: 11, at: { b: 1, t: 2 }, r: 3600, d: [] })
    ])
  });

  await client.getTicker();
  await client.getTicker(16);
  await client.getOrderBook({ marketId: 16, levels: 5 });
  await client.getFunding({ marketId: 16, from: 1000, to: 2000 });
  await client.getCandles({ marketId: 16, resolution: 3600, from: 1000, to: 2000 });

  assert.deepEqual(calls, [
    "https://testnet.perpl.xyz/api/v1/market-data/ticker",
    "https://testnet.perpl.xyz/api/v1/market-data/16/ticker",
    "https://testnet.perpl.xyz/api/v1/market-data/16/book?levels=5",
    "https://testnet.perpl.xyz/api/v1/market-data/16/funding/1000-2000",
    "https://testnet.perpl.xyz/api/v1/market-data/16/candles/3600/1000-2000"
  ]);
});

test("smoke check signed client methods construct expected URLs and pagination", async () => {
  const calls: string[] = [];
  const client = new PerplSignedClient({
    config: configWithCredentials,
    fetchImpl: mockFetch(calls, [
      jsonResponse({ d: [], np: "" }),
      jsonResponse({ d: [], np: "" }),
      jsonResponse({ d: [], np: "" }),
      jsonResponse({ at: { b: 1, t: 2 }, chart: [] }),
      jsonResponse({ at: { b: 1, t: 2 }, chart: [] })
    ]),
    nowMs: () => 1,
    nonceGenerator: () => "n"
  });

  await client.getAccountHistory({ count: 5 });
  await client.getOrderHistory({ count: 5, page: "next" });
  await client.getPositionHistory({ count: 5 });
  await client.getPortfolio("equity", "week");
  await client.getPortfolio("pnl", "week");

  assert.deepEqual(calls, [
    "https://testnet.perpl.xyz/api/v1/trading/account-history?count=5",
    "https://testnet.perpl.xyz/api/v1/trading/order-history?count=5&page=next",
    "https://testnet.perpl.xyz/api/v1/trading/position-history?count=5",
    "https://testnet.perpl.xyz/api/v1/trading/portfolio/equity/week",
    "https://testnet.perpl.xyz/api/v1/trading/portfolio/pnl/week"
  ]);
});

function mockFetch(calls: string[], responses: Response[]): PerplFetch {
  return (async (input: URL | RequestInfo) => {
    calls.push(String(input));
    const response = responses.shift();
    if (!response) throw new Error("No mock response queued.");
    return response;
  }) as PerplFetch;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
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
  res.setHeader = (name, value) => {
    headers.set(name.toLowerCase(), value);
  };
  res.getHeader = (name) => headers.get(name.toLowerCase());
  res.removeHeader = (name) => {
    headers.delete(name.toLowerCase());
  };
  res.end = (...args: unknown[]) => {
    const chunk = args[0];
    if (chunk !== undefined) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    queueMicrotask(() => res.emit("finish"));
    return res;
  };

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    (app as unknown as { handle: (request: typeof req, response: typeof res, done: (error?: unknown) => void) => void }).handle(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return { status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") };
}

function sampleContext(): Context {
  return {
    chain: {
      ver: 1,
      chain_id: 10143,
      name: "Monad Testnet",
      gas: { at: { b: 1, t: 2 }, h: 1, max: "1", p95: "1", p50: "1", min: "1", base: "1" }
    },
    instances: [
      {
        ver: 1,
        id: 1,
        address: PERPL_TESTNET_DEFAULTS.exchangeAddress,
        collateral_token_id: 1,
        min_account_open_amount: "0",
        min_deposit_amount: "0",
        min_withdraw_amount: "0",
        max_account_trigger_orders: 10
      }
    ],
    tokens: [
      {
        ver: 1,
        id: 1,
        address: PERPL_TESTNET_DEFAULTS.collateralToken,
        symbol: "USD",
        name: "USD",
        decimals: 18,
        display_precision: 2
      }
    ],
    markets: [
      {
        ver: 1,
        id: 16,
        instance_id: 1,
        perpetual_id: 16,
        symbol: "BTC",
        name: "Bitcoin",
        size_units: "BTC",
        icon: "",
        funding_interval_sec: 3600,
        funding_interval_blocks: 100,
        order_ttl_blocks: 20,
        order_retry_blocks: 5,
        order_max_market_slippage_bps: 100,
        order_max_neg_pnl_collat_bps: 1000,
        config: {
          at: { b: 1, t: 2 },
          is_open: true,
          price_decimals: 2,
          size_decimals: 6,
          min_posting_amount: "0",
          min_settle_amount: "0",
          initial_margin: 1000,
          maintenance_margin: 500,
          maker_fee: 100,
          taker_fee: 200,
          recycle_fee: "0",
          funding_sum_scaling_exp: 0
        },
        state: {
          at: { b: 1, t: 2 },
          orl: 1234567,
          mrk: 1234567,
          lst: 1234500,
          mid: 1234550,
          bid: 1234500,
          ask: 1234600,
          prv: 1200000,
          dv: 123456789,
          dva: "456000000000000000000",
          oi: 2000000,
          tvl: "1000000000000000000000"
        },
        funding: { at: { b: 1, t: 2 }, feb: 1, rate: 10, idx: 1234567, ppl: 1, sum: 1, div: 1 },
        points_boost_bps: 10000
      }
    ]
  };
}

function samplePosition(): Position {
  return {
    at: { b: 1, t: 2, tx: 0, txid: "0x", l: 0 },
    mkt: 16,
    acc: 7,
    pid: 99,
    rq: 1,
    oid: 2,
    st: 1,
    sr: 21,
    sd: 1,
    c: "1234567890123456789012345",
    ep: 1000001,
    s: 123456,
    fee: "1000000000000000000",
    cfee: "0",
    efs: 0,
    lv: 1000,
    xfs: 0,
    ots: { b: 1, t: 2, tx: 0, txid: "0x" }
  };
}

function sampleFill(): Fill {
  return {
    at: { b: 1, t: 2, tx: 0, txid: "0x", l: 1 },
    mkt: 16,
    acc: 7,
    oid: 2,
    t: 1,
    l: 2,
    p: 1000001,
    s: 123456,
    f: "-123"
  };
}
