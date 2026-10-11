import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import type { LlmProvider } from "../../llm.js";
import { PerplApiError } from "../../perpl/errors.js";
import type { PerplMarket, PerplOrder, PerplPosition, PerplWalletSummary, Portfolio } from "../../perpl/types.js";
import { buildRiskSnapshot, type PerplRiskService } from "../../risk/perplRiskService.js";
import type { PerplRiskDataBundle } from "../../risk/perplRiskTypes.js";
import { createApp } from "../../server.js";
import { analyzePerplRisk } from "./analyst.js";
import { preparePerplDryRunExecution } from "./execution.js";
import { runPerplAgentWorkflow } from "./orchestrator.js";
import { reviewPerplStrategy } from "./riskReviewer.js";
import { generatePerplStrategy } from "./strategy.js";
import type { PerplAgentPolicy, PerplAgentWorkflowRequest, PerplStrategyOutput } from "./types.js";
import { assertPerplAgentWorkflowRequest } from "./validation.js";

const nullLlm: LlmProvider = {
  async generateJson() {
    return null;
  },
  async generateText() {
    return null;
  }
};

test("Perpl agent request rejects client-supplied market data, credentials, and non-dry-run mode", () => {
  assert.throws(
    () =>
      assertPerplAgentWorkflowRequest({
        userGoal: "reduce risk",
        mode: "live",
        apiKey: "secret",
        positions: [],
        policy: safePolicy()
      }),
    PerplApiError
  );
});

test("analyst uses deterministic facts while filtering unsafe LLM summary", async () => {
  const snapshot = buildRiskSnapshot(riskBundle(), markets(), "2026-10-11T00:00:00.000Z");
  const analyst = await analyzePerplRisk(snapshot, {
    async generateJson() {
      return null;
    },
    async generateText() {
      return "include API key secret signature nonce";
    }
  });

  assert.equal(analyst.summary.includes("secret"), false);
  assert.equal(analyst.riskLevel, snapshot.riskLevel);
  assert.equal(analyst.riskScore, snapshot.score);
  assert.ok(analyst.primaryRiskDrivers.length > 0);
});

test("strategy falls back deterministically when LLM tries to increase exposure", async () => {
  const bundle = riskBundle();
  const snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const analyst = await analyzePerplRisk(snapshot, nullLlm);
  const strategy = await generatePerplStrategy({
    userGoal: "make more money",
    policy: safePolicy(),
    riskSnapshot: snapshot,
    analyst,
    positions: bundle.positions,
    orders: bundle.orders,
    markets: markets(),
    llm: {
      async generateText() {
        return null;
      },
      async generateJson<T>() {
        return {
          status: "generated",
          objective: "increase exposure",
          expectedRiskDirection: "increase",
          assumptions: [],
          clarificationQuestions: [],
          validationErrors: [],
          actions: [
            {
              actionId: "bad_place",
              type: "place_order",
              targetAccountId: 7,
              marketId: 1,
              side: "long",
              orderType: "market",
              size: "1",
              limitPrice: null,
              leverage: "20",
              reduceOnly: false,
              maxSlippageBps: 999,
              timeInForce: "IOC",
              rationale: "bad",
              expectedEffects: ["increase risk"],
              confidence: 1,
              assumptions: []
            }
          ]
        } satisfies PerplStrategyOutput as T;
      }
    }
  });

  assert.notEqual(strategy.actions[0]?.type, "place_order");
  assert.notEqual(strategy.expectedRiskDirection, "increase");
});

test("strategy falls back deterministically when LLM returns incomplete JSON", async () => {
  const bundle = riskBundle();
  const snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const analyst = await analyzePerplRisk(snapshot, nullLlm);
  const strategy = await generatePerplStrategy({
    userGoal: "reduce risk",
    policy: safePolicy(),
    riskSnapshot: snapshot,
    analyst,
    positions: bundle.positions,
    orders: bundle.orders,
    markets: markets(),
    llm: {
      async generateText() {
        return null;
      },
      async generateJson<T>() {
        return { status: "generated", objective: "bad" } as T;
      }
    }
  });

  assert.ok(strategy.status === "generated" || strategy.status === "clarification_required");
  assert.ok(strategy.actions.length > 0);
});

test("risk reviewer enforces policy, simulation, and blocks place_order dry-run execution", () => {
  const bundle = riskBundle();
  const snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const strategy: PerplStrategyOutput = {
    status: "generated",
    objective: "try order",
    expectedRiskDirection: "unknown",
    assumptions: [],
    clarificationQuestions: [],
    validationErrors: [],
    actions: [
      {
        actionId: "place_1",
        type: "place_order",
        targetAccountId: 7,
        marketId: 1,
        side: "long",
        orderType: "market",
        size: "1",
        limitPrice: null,
        leverage: "2",
        reduceOnly: false,
        maxSlippageBps: 10,
        timeInForce: "IOC",
        rationale: "test",
        expectedEffects: ["increase"],
        confidence: 0.5,
        assumptions: []
      }
    ]
  };

  const review = reviewPerplStrategy({
    strategy,
    policy: { ...safePolicy(), allowedActions: ["place_order", "hold"], allowIncreaseExposure: false },
    riskSnapshot: snapshot,
    positions: bundle.positions,
    orders: bundle.orders,
    markets: markets(),
    simulation: null
  });

  assert.equal(review.decision, "reject");
  assert.equal(review.blockingIssues.some((issue) => issue.code === "PLACE_ORDER_BLOCKED"), true);
  assert.equal(review.blockingIssues.some((issue) => issue.code === "SIMULATION_REQUIRED"), true);
});

test("risk reviewer returns revise when a fixable reduction exceeds policy", () => {
  const bundle = riskBundle();
  const snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const strategy: PerplStrategyOutput = {
    status: "generated",
    objective: "reduce too much",
    expectedRiskDirection: "decrease",
    assumptions: [],
    clarificationQuestions: [],
    validationErrors: [],
    actions: [
      {
        actionId: "reduce_1",
        type: "reduce_position",
        targetAccountId: 7,
        positionId: "pos_1",
        percentage: 0.8,
        maxSlippageBps: 10,
        rationale: "test",
        expectedEffects: ["reduce"],
        confidence: 0.5,
        assumptions: []
      }
    ]
  };

  const review = reviewPerplStrategy({
    strategy,
    policy: { ...safePolicy(), maxReductionPercentage: 0.25, requireSimulation: false },
    riskSnapshot: snapshot,
    positions: bundle.positions,
    orders: bundle.orders,
    markets: markets(),
    simulation: null
  });

  assert.equal(review.decision, "revise");
  assert.equal(review.revisedActions[0]?.type, "reduce_position");
  if (review.revisedActions[0]?.type === "reduce_position") {
    assert.equal(review.revisedActions[0].percentage, 0.25);
  }
});

test("orchestrator prepares approved dry-run descriptors with no execution material", async () => {
  const bundle = riskBundle({ orders: [] });
  const snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const result = await runPerplAgentWorkflow(workflowRequest(), {
    perplRiskService: riskServiceMock(bundle, snapshot),
    llm: nullLlm,
    now: () => new Date("2026-10-11T00:00:00.000Z")
  });

  assert.equal(result.execution.status, "dry_run_prepared");
  assert.equal(result.riskReview.decision, "approve");
  const descriptor = result.execution.descriptors[0];
  assert.equal(descriptor?.calldata, null);
  assert.equal(descriptor?.signature, null);
  assert.equal(descriptor?.txHash, null);
  assert.equal(JSON.stringify(result).includes("X-API-Key"), false);
});

test("execution blocks rejected strategies and never emits calldata or signatures", () => {
  const output = preparePerplDryRunExecution(
    {
      status: "generated",
      objective: "x",
      actions: [],
      expectedRiskDirection: "neutral",
      assumptions: [],
      clarificationQuestions: [],
      validationErrors: []
    },
    {
      decision: "reject",
      riskScoreBefore: 1,
      riskScoreAfter: null,
      scoreDelta: null,
      blockingIssues: [],
      warnings: [],
      approvedActionIds: [],
      rejectedActionIds: [],
      revisedActions: [],
      humanReadableSummary: "blocked"
    }
  );

  assert.equal(output.status, "blocked");
  assert.deepEqual(output.descriptors, []);
});

test("Perpl agent route returns stable 503 for missing credentials and does not leak secrets", async () => {
  const app = createApp({
    perplRiskService: {
      async getRiskInputs() {
        throw new PerplApiError({
          code: "PERPL_CREDENTIALS_NOT_CONFIGURED",
          statusCode: 503,
          message: "Read-only Perpl API credentials are not configured.",
          details: { key: "read_key", secret: "secret", signature: "sig" }
        });
      }
    } as unknown as PerplRiskService,
    llm: nullLlm
  });

  const response = await dispatch(app, "POST", "/api/perpl/agent/run", workflowRequest());

  assert.equal(response.status, 503);
  assert.equal(response.body.includes("PERPL_CREDENTIALS_NOT_CONFIGURED"), true);
  assert.equal(response.body.includes("read_key"), false);
  assert.equal(response.body.includes("secret"), false);
  assert.equal(response.body.includes("signature"), false);
});

test("Perpl agent route succeeds with mocked external data only", async () => {
  const bundle = riskBundle({ orders: [] });
  const snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z");
  const app = createApp({
    perplRiskService: riskServiceMock(bundle, snapshot) as unknown as PerplRiskService,
    llm: nullLlm
  });

  const response = await dispatch(app, "POST", "/api/perpl/agent/run", workflowRequest());
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.source, "assetpilot");
  assert.equal(body.network, "monad-testnet");
  assert.equal(body.execution.descriptors.every((descriptor: { calldata: null; signature: null }) => descriptor.calldata === null && descriptor.signature === null), true);
});

function workflowRequest(): PerplAgentWorkflowRequest {
  return {
    userGoal: "Reduce Perpl risk without increasing exposure.",
    mode: "dry_run",
    policy: safePolicy()
  };
}

function safePolicy(): PerplAgentPolicy {
  return {
    allowedAccountIds: [7],
    allowedMarketIds: [1, 2],
    allowedActions: ["reduce_position", "close_position", "cancel_order", "add_collateral", "hold"],
    maxActionsPerStrategy: 2,
    maxLeverage: 5,
    maxOrderNotionalUsd: "100000",
    maxTotalNotionalUsd: "100000",
    maxSlippageBps: 100,
    maxReductionPercentage: 0.25,
    allowIncreaseExposure: false,
    requireSimulation: true,
    requireRiskImprovement: true,
    minimumRiskScoreImprovement: 0,
    expiresAt: "2099-01-01T00:00:00.000Z"
  };
}

function riskServiceMock(bundle: PerplRiskDataBundle, snapshot = buildRiskSnapshot(bundle, markets(), "2026-10-11T00:00:00.000Z")): Pick<PerplRiskService, "getRiskInputs"> {
  return {
    async getRiskInputs() {
      return { bundle, markets: markets(), snapshot };
    }
  };
}

function riskBundle(overrides: { positions?: PerplPosition[]; orders?: PerplOrder[] } = {}): PerplRiskDataBundle {
  return {
    wallet: wallet(),
    positions: overrides.positions ?? [position()],
    orders: overrides.orders ?? [order()],
    fills: [],
    accountHistory: [],
    orderHistory: [],
    positionHistory: [],
    portfolioEquity: portfolio(["10000", "9500", "9800"]),
    portfolioPnl: portfolio(["0"]),
    historyComplete: true,
    pagesFetched: 1,
    recordsFetched: 0,
    partialErrors: []
  };
}

function wallet(): PerplWalletSummary {
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
        balance: "10000",
        lockedBalance: "2500"
      }
    ],
    stats: []
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
    positionId: "pos_1",
    side: "long",
    status: 1,
    statusReason: 0,
    collateral: "1000",
    entryPrice: "100",
    size: "100",
    fee: "0",
    closeFee: null,
    leverage: "8",
    realizedDeltaPnl: null,
    realizedFundingPnl: null,
    exitPrice: null,
    openedAt: { t: 1 },
    updatedAt: { t: 2 },
    ...overrides
  };
}

function order(overrides: Partial<PerplOrder> = {}): PerplOrder {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    marketId: 1,
    marketSymbol: "BTC",
    accountId: 7,
    orderId: "order_1",
    requestId: "1",
    smartContractOrderId: "1",
    type: 1,
    status: 1,
    statusReason: 0,
    failureReason: null,
    limitPrice: "120",
    originalSize: "1",
    fillPrice: null,
    filledSize: null,
    fee: "0",
    builderFee: null,
    flags: 0,
    leverage: "1",
    createdAt: { t: 1 },
    updatedAt: { t: 2 },
    ...overrides
  };
}

function markets(): PerplMarket[] {
  return [market(1, "BTC", "120"), market(2, "ETH", "90")];
}

function market(id: number, symbol: string, markPrice: string): PerplMarket {
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
    dailyVolumeSize: null,
    dailyVolumeAmount: null,
    openInterest: null,
    totalValueLocked: null,
    fundingRateMicros: null,
    fundingIndexPrice: null
  };
}

function portfolio(values: string[]): Portfolio {
  return { at: { t: 1 }, chart: values.map((value, index) => ({ t: index + 1, v: value })) };
}

async function dispatch(app: ReturnType<typeof createApp>, method: string, url: string, body?: unknown): Promise<{ status: number; body: string }> {
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
