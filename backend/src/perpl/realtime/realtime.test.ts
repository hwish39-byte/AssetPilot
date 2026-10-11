import assert from "node:assert/strict";
import test from "node:test";
import { PERPL_TESTNET_DEFAULTS } from "../config.js";
import { PerplPublicClient, type PerplFetch } from "../publicClient.js";
import { PerplService } from "../service.js";
import type { Context, L2Book } from "../types.js";
import { PerplRealtimeService } from "./realtimeService.js";
import { SequenceTracker } from "./sequenceTracker.js";
import type { PerplWebSocketLike } from "./types.js";

test("sequence tracker accepts strict increments and detects duplicates and gaps", () => {
  const tracker = new SequenceTracker();

  assert.deepEqual(tracker.observe("heartbeat", 10), { status: "accepted", previous: null, current: 10 });
  assert.deepEqual(tracker.observe("heartbeat", 10), { status: "duplicate", previous: 10, current: 10 });
  assert.deepEqual(tracker.observe("heartbeat", 12), { status: "gap", previous: 10, current: 12 });
  assert.deepEqual(tracker.observe("market-state", undefined), { status: "unsequenced", previous: null, current: null });
});

test("realtime service sends REST snapshot before websocket updates", async () => {
  const fakeWs = new FakeWebSocket();
  const service = realtimeService(fakeWs);
  const events: string[] = [];

  const release = await service.subscribe({
    marketIds: [1],
    channels: ["ticker", "orderbook", "heartbeat"],
    listener: (event) => events.push(event.event)
  });

  try {
    assert.equal(events.includes("snapshot"), true);
    assert.equal(fakeWs.sent.length, 0);
    fakeWs.open();
    assert.match(fakeWs.sent[0] ?? "", /"market-state@10143"/);
    assert.match(fakeWs.sent[0] ?? "", /"order-book@1"/);
  } finally {
    release();
  }
});

test("order book websocket update removes levels with o zero after base snapshot", async () => {
  const fakeWs = new FakeWebSocket();
  const service = realtimeService(fakeWs);
  let bestBid = "";
  const release = await service.subscribe({
    marketIds: [1],
    channels: ["orderbook"],
    listener: (event) => {
      if (event.event === "orderbook") bestBid = event.data.bids[0]?.price ?? "";
    }
  });

  try {
    fakeWs.open();
    fakeWs.message({ mt: 6, subs: [{ stream: "order-book@1", sid: 9, status: { code: 0 } }] });
    fakeWs.message({ mt: 16, sid: 9, sn: 2, at: { t: 1 }, bid: [{ p: 1000000, s: 0, o: 0 }], ask: [] });
    assert.equal(bestBid, "9999.99");
  } finally {
    release();
  }
});

test("websocket sequence gap marks service degraded and emits resync", async () => {
  const fakeWs = new FakeWebSocket();
  const service = realtimeService(fakeWs);
  const events: string[] = [];
  const release = await service.subscribe({
    marketIds: [1],
    channels: ["ticker"],
    listener: (event) => events.push(event.event)
  });

  try {
    fakeWs.open();
    fakeWs.message({ mt: 6, subs: [{ stream: "market-state@10143", sid: 1, status: { code: 0 } }] });
    fakeWs.message({ mt: 9, sn: 1, d: { "1": sampleContext().markets[0]!.state } });
    fakeWs.message({ mt: 9, sn: 3, d: { "1": sampleContext().markets[0]!.state } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events.includes("resync"), true);
    assert.equal(service.getStatus().status, "degraded");
  } finally {
    release();
  }
});

function realtimeService(fakeWs: FakeWebSocket) {
  const publicClient = new PerplPublicClient({
    apiUrl: PERPL_TESTNET_DEFAULTS.apiUrl,
    fetchImpl: mockFetch(),
    sleep: async () => {}
  });
  const perplService = new PerplService({
    config: PERPL_TESTNET_DEFAULTS,
    publicClient,
    nowMs: () => 1_789_999_999_000
  });
  return new PerplRealtimeService({
    perplService,
    publicClient,
    config: {
      wsUrl: "wss://testnet.perpl.xyz/ws/v1/market-data",
      chainId: 10143,
      maxMarketsPerClient: 4,
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 60_000,
      restResyncIntervalMs: 60_000,
      maxReconnectDelayMs: 10
    },
    webSocketFactory: () => fakeWs,
    nowMs: () => 1_789_999_999_000
  });
}

class FakeWebSocket implements PerplWebSocketLike {
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event?: unknown) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code?: number; reason?: string }) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (() => void) | ((event: { data: unknown }) => void) | ((event: { code?: number; reason?: string }) => void) | ((event: unknown) => void)
  ): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as (event?: unknown) => void]);
  }

  open(): void {
    this.readyState = 1;
    this.emit("open", {});
  }

  message(payload: unknown): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  private emit(type: string, event: { data?: unknown; code?: number; reason?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function mockFetch(): PerplFetch {
  return (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/v1/pub/context")) return jsonResponse(sampleContext());
    if (url.includes("/v1/market-data/1/book")) return jsonResponse(sampleBook());
    return jsonResponse({}, { status: 404 });
  }) as PerplFetch;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" }
  });
}

function sampleBook(): L2Book {
  return {
    mt: 15,
    sn: 1,
    at: { t: 1 },
    bid: [
      { p: 1000000, s: 100000, o: 2 },
      { p: 999999, s: 200000, o: 1 }
    ],
    ask: [{ p: 1000001, s: 100000, o: 1 }]
  };
}

function sampleContext(): Context {
  return {
    chain: { ver: 1, chain_id: 10143, gas: { at: { b: 1, t: 1 }, h: 1, max: "1", p95: "1", p50: "1", min: "1", base: "1" } },
    instances: [
      {
        ver: 1,
        id: 1,
        address: "0x1964c32f0be608e7d29302aff5e61268e72080cc",
        collateral_token_id: 1,
        min_account_open_amount: "0",
        min_deposit_amount: "0",
        min_withdraw_amount: "0",
        max_account_trigger_orders: 10
      }
    ],
    tokens: [{ ver: 1, id: 1, address: "0xdf5b718d8fcc173335185a2a1513ee8151e3c027", symbol: "USDC", name: "USDC", decimals: 6, display_precision: 2 }],
    markets: [
      {
        ver: 1,
        id: 1,
        instance_id: 1,
        perpetual_id: 1,
        symbol: "BTC",
        name: "Bitcoin",
        size_units: "BTC",
        icon: "",
        funding_interval_sec: 3600,
        funding_interval_blocks: 1,
        order_ttl_blocks: 10,
        order_retry_blocks: 1,
        order_max_market_slippage_bps: 100,
        order_max_neg_pnl_collat_bps: 100,
        points_boost_bps: 0,
        config: {
          at: { b: 1, t: 1 },
          is_open: true,
          price_decimals: 2,
          size_decimals: 4,
          min_posting_amount: "0",
          min_settle_amount: "0",
          initial_margin: 1000,
          maintenance_margin: 500,
          maker_fee: 0,
          taker_fee: 0,
          recycle_fee: "0",
          funding_sum_scaling_exp: 0
        },
        state: { at: { b: 1, t: 1 }, orl: 1000000, mrk: 1000000, lst: 1000000, mid: 1000000, bid: 999999, ask: 1000001, prv: 999900, dv: 10, dva: "1000000", oi: 200, tvl: "3000000" },
        funding: { at: { b: 1, t: 1 }, feb: 1, rate: 12, idx: 1000000, ppl: 0, sum: 0, div: 1 }
      }
    ]
  };
}
