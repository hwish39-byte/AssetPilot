import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { createApp } from "../../server.js";
import { PerplApiError } from "../errors.js";
import { buildTradingWsCanonical, signTradingWsAuth } from "./auth.js";
import { buildExactOrderPreview } from "./orderBuilder.js";
import type { PerplTradingExecutionService } from "./executionService.js";
import type { PerplTradingConfig } from "./types.js";
import type { PerplAgentAction } from "../../agents/perpl/types.js";

const tradingConfig: PerplTradingConfig = {
  enabled: true,
  network: "testnet",
  apiUrl: "https://testnet.perpl.xyz/api",
  wsUrl: "wss://testnet.perpl.xyz",
  chainId: 10143,
  tradeApiKey: "trade_key_for_tests",
  tradeApiKeySecret: "02".repeat(32),
  allowedFrontendOrigins: ["http://localhost:3000"],
  allowedMarketIds: [1],
  maxOrderNotionalUsd: "1000",
  maxLeverage: 5,
  maxSlippageBps: 50,
  intentTtlMs: 180_000,
  cooldownMs: 30_000
};

test("trading websocket canonical signing string is exact", () => {
  assert.equal(buildTradingWsCanonical(10143, 1234567890, "nonce_for_test"), "10143\ntrading-ws-signin\n1234567890\nnonce_for_test");
});

test("trading websocket auth uses a fresh nonce", async () => {
  let nonceIndex = 0;
  const first = await signTradingWsAuth(tradingConfig, { nowMs: () => 1, nonce: () => `nonce_${++nonceIndex}` });
  const second = await signTradingWsAuth(tradingConfig, { nowMs: () => 1, nonce: () => `nonce_${++nonceIndex}` });

  assert.equal(first.frame.nonce, "nonce_1");
  assert.equal(second.frame.nonce, "nonce_2");
  assert.notEqual(first.frame.signature, second.frame.signature);
  assert.equal(first.frame.mt, 29);
  assert.equal(first.frame.chain_id, 10143);
});

test("reduce position action builds an exact reduce-only Perpl order preview", () => {
  const preview = buildExactOrderPreview({
    action: reduceAction(),
    wallet: wallet(),
    positions: [position()],
    orders: [],
    markets: [market()]
  });

  assert.equal(preview.actionType, "reduce_position");
  assert.equal(preview.reduceOnly, true);
  assert.equal(preview.expectedSide, "close_long");
  assert.equal(preview.orderSpec.t, 3);
  assert.equal(preview.orderSpec.rq, 42);
  assert.equal(preview.orderSpec.s, 500000);
  assert.equal(preview.size, "0.5");
  assert.equal(preview.notionalUsdEstimate, "1000");
  assert.equal(preview.worstAcceptablePrice, "1990");
});

test("unsupported exposure-increasing actions are rejected before order construction", () => {
  assert.throws(
    () =>
      buildExactOrderPreview({
        action: placeOrderAction(),
        wallet: wallet(),
        positions: [position()],
        orders: [],
        markets: [market()]
      }),
    (error) => error instanceof PerplApiError && error.code === "PERPL_TRADING_UNSUPPORTED"
  );
});

test("execution routes reject missing browser Origin", async () => {
  const app = createApp({ perplTradingService: fakeTradingService() });
  const response = await dispatch(app, "POST", "/api/perpl/execution/intents", { workflowId: "wf" });

  assert.equal(response.status, 403);
  assert.match(response.body, /Execution requests require an allowed Origin/);
});

test("execution route errors redact keys, secrets, signatures, and nonces", async () => {
  const app = createApp({ perplTradingService: fakeTradingService() });
  const response = await dispatch(
    app,
    "POST",
    "/api/perpl/execution/intents/intent/execute",
    { planHash: "a".repeat(64), idempotencyKey: "perpl_exec_1", confirmationText: "SUBMIT TESTNET ORDER" },
    { origin: "http://localhost:3000" }
  );

  assert.equal(response.status, 503);
  assert.doesNotMatch(response.body, /trade_key_for_tests|super_secret|abc_signature|nonce_123/i);
  assert.match(response.body, /\[redacted\]/);
});

function reduceAction(): PerplAgentAction {
  return {
    actionId: "act_reduce",
    type: "reduce_position",
    rationale: "Reduce exposure",
    expectedEffects: [],
    targetAccountId: 7,
    confidence: 0.9,
    assumptions: [],
    positionId: "99",
    percentage: 25,
    maxSlippageBps: 50
  };
}

function placeOrderAction(): PerplAgentAction {
  return {
    actionId: "act_place",
    type: "place_order",
    rationale: "Increase exposure",
    expectedEffects: [],
    targetAccountId: 7,
    confidence: 0.9,
    assumptions: [],
    marketId: 1,
    side: "long",
    orderType: "market",
    size: "1",
    limitPrice: null,
    leverage: "2",
    reduceOnly: false,
    maxSlippageBps: 50,
    timeInForce: "ioc"
  };
}

function market() {
  return {
    source: "perpl" as const,
    network: "monad-testnet" as const,
    fetchedAt: "2026-10-11T00:00:00.000Z",
    id: 1,
    symbol: "BTC",
    name: "BTC",
    sizeUnits: "BTC",
    priceDecimals: 2,
    sizeDecimals: 6,
    isOpen: true,
    oraclePrice: "2000",
    markPrice: "2000",
    lastPrice: "2000",
    midPrice: "2000",
    bestBid: "1999",
    bestAsk: "2001",
    dailyVolumeSize: "1",
    dailyVolumeAmount: "2000",
    openInterest: "1",
    totalValueLocked: "1000",
    fundingRateMicros: 0,
    fundingIndexPrice: "2000"
  };
}

function position() {
  return {
    source: "perpl" as const,
    network: "monad-testnet" as const,
    fetchedAt: "2026-10-11T00:00:00.000Z",
    marketId: 1,
    marketSymbol: "BTC",
    accountId: 7,
    positionId: "99",
    side: "long" as const,
    status: 2,
    statusReason: 0,
    collateral: "100",
    entryPrice: "1900",
    size: "2",
    fee: "0",
    closeFee: null,
    leverage: "2",
    realizedDeltaPnl: null,
    realizedFundingPnl: null,
    exitPrice: null,
    openedAt: {},
    updatedAt: {}
  };
}

function wallet() {
  return {
    source: "perpl" as const,
    network: "monad-testnet" as const,
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
        lastForwardedRequestId: "41",
        balance: "1000",
        lockedBalance: "0"
      }
    ],
    stats: []
  };
}

function fakeTradingService() {
  return {
    getConfig: () => ({ allowedFrontendOrigins: ["http://localhost:3000"] }),
    recordWorkflow: () => {},
    createIntent: async () => {
      throw new PerplApiError({
        code: "PERPL_CREDENTIALS_NOT_CONFIGURED",
        statusCode: 503,
        message: "trade_key_for_tests super_secret abc_signature nonce_123"
      });
    },
    executeIntent: async () => {
      throw new PerplApiError({
        code: "PERPL_CREDENTIALS_NOT_CONFIGURED",
        statusCode: 503,
        message: "trade_key_for_tests super_secret abc_signature nonce_123"
      });
    },
    reconcileIntent: async () => {
      throw new Error("not used");
    },
    getIntent: () => {
      throw new Error("not used");
    },
    getCapabilities: async () => ({})
  } as unknown as PerplTradingExecutionService;
}

async function dispatch(
  app: ReturnType<typeof createApp>,
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  const req = new Readable({ read() {} }) as Readable & { method: string; url: string; headers: Record<string, string> };
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  req.method = method;
  req.url = url;
  req.headers = {
    ...(rawBody ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(rawBody)) } : {}),
    ...headers
  };
  req.push(rawBody || null);
  if (rawBody) req.push(null);

  const chunks: Buffer[] = [];
  const responseHeaders = new Map<string, string | number | string[]>();
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
    responseHeaders.set(name.toLowerCase(), value);
  };
  res.getHeader = (name) => responseHeaders.get(name.toLowerCase());
  res.removeHeader = (name) => {
    responseHeaders.delete(name.toLowerCase());
  };
  res.end = (...args: unknown[]) => {
    const chunk = args[0];
    if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    queueMicrotask(() => res.emit("finish"));
    return res;
  };

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
    (app as unknown as { handle: (request: typeof req, response: typeof res, done?: (error?: unknown) => void) => void }).handle(req, res, (error) =>
      error ? reject(error) : resolve()
    );
  });

  return { status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") };
}
