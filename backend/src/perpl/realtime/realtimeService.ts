import { EventEmitter } from "node:events";
import type { PerplPublicClient } from "../publicClient.js";
import type { PerplService } from "../service.js";
import type { FundingEvent, L2Book } from "../types.js";
import { loadPerplRealtimeConfig } from "./config.js";
import { MarketStateStore } from "./marketStateStore.js";
import { PublicMarketWsClient } from "./publicMarketWsClient.js";
import { ReconnectPolicy } from "./reconnectPolicy.js";
import { SequenceTracker } from "./sequenceTracker.js";
import { buildStreams, SubscriptionManager } from "./subscriptionManager.js";
import type {
  HeartbeatMessage,
  L2BookMessage,
  MarketFundingUpdateMessage,
  MarketStateUpdateMessage,
  PerplRealtimeConfig,
  PerplWebSocketFactory,
  RealtimeChannel,
  RealtimeServiceStatus,
  RealtimeSseEvent,
  RealtimeStatus,
  SubscriptionResponse
} from "./types.js";

type Listener = (event: RealtimeSseEvent) => void;

export class PerplRealtimeService extends EventEmitter {
  private readonly config: PerplRealtimeConfig;
  private readonly store = new MarketStateStore();
  private readonly subscriptions = new SubscriptionManager();
  private readonly sequence = new SequenceTracker();
  private readonly reconnect: ReconnectPolicy;
  private readonly nowMs: () => number;
  private readonly publicClient: PerplPublicClient | null;
  private client: PublicMarketWsClient | null = null;
  private status: RealtimeStatus = "idle";
  private lastMessageAt: string | null = null;
  private lastRestSyncAt: string | null = null;
  private lastError: RealtimeServiceStatus["lastError"] = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private staleTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: {
      perplService: PerplService;
      publicClient?: PerplPublicClient;
      config?: PerplRealtimeConfig;
      webSocketFactory?: PerplWebSocketFactory;
      nowMs?: () => number;
    }
  ) {
    super();
    this.config = options.config ?? loadPerplRealtimeConfig();
    this.publicClient = options.publicClient ?? readPrivatePublicClient(options.perplService);
    this.nowMs = options.nowMs ?? Date.now;
    this.reconnect = new ReconnectPolicy({ maxDelayMs: this.config.maxReconnectDelayMs });
  }

  async subscribe(args: { marketIds: number[]; channels: RealtimeChannel[]; listener: Listener }): Promise<() => void> {
    const marketIds = await this.normalizeMarkets(args.marketIds);
    const channels = normalizeChannels(args.channels);
    await this.ensureSnapshots(marketIds, channels);
    this.on("event", args.listener);

    const streams = this.subscriptions.retain(marketIds, channels, this.config.chainId);
    if (streams.length > 0) this.ensureConnected(streams);
    args.listener({ event: "snapshot", data: { markets: this.store.getSnapshots(marketIds), status: this.getStatus() } });

    return () => {
      this.off("event", args.listener);
      const removed = this.subscriptions.release(marketIds, channels, this.config.chainId);
      if (removed.length > 0 && this.client?.isConnected()) this.client.subscribe(removed, false);
      if (this.subscriptions.activeStreams().length === 0) this.stop("stopped");
    };
  }

  async getSnapshot(marketIds: number[], channels: RealtimeChannel[] = ["ticker", "funding", "orderbook", "heartbeat"]) {
    const normalized = await this.normalizeMarkets(marketIds);
    await this.ensureSnapshots(normalized, normalizeChannels(channels));
    return { markets: this.store.getSnapshots(normalized), status: this.getStatus() };
  }

  getStatus(): RealtimeServiceStatus {
    const subscriptions = this.subscriptions.activeStreams();
    const connected = this.client?.isConnected() ?? false;
    const mode = this.status === "live" ? "websocket" : this.lastRestSyncAt ? "rest_fallback" : "unavailable";
    return {
      source: "perpl",
      network: "monad-testnet",
      status: this.status,
      mode,
      wsUrl: this.config.wsUrl,
      publicOnly: true,
      connected,
      subscriptions,
      marketCount: this.store.getMarketIds().length,
      lastMessageAt: this.lastMessageAt,
      lastRestSyncAt: this.lastRestSyncAt,
      lastError: this.lastError
    };
  }

  stop(nextStatus: RealtimeStatus = "stopped"): void {
    this.client?.close();
    this.client = null;
    this.setStatus(nextStatus);
    this.clearTimers();
  }

  private ensureConnected(initialStreams: string[]): void {
    if (this.client?.isConnected()) {
      this.client.subscribe(initialStreams, true);
      return;
    }
    this.setStatus(this.status === "reconnecting" ? "reconnecting" : "connecting");
    this.client = new PublicMarketWsClient({ url: this.config.wsUrl, webSocketFactory: this.options.webSocketFactory });
    this.client.on("open", () => {
      this.reconnect.reset();
      this.setStatus("connected");
      const streams = this.subscriptions.activeStreams();
      if (streams.length > 0) {
        this.setStatus("subscribing");
        this.client?.subscribe(streams, true);
      }
      this.startTimers();
    });
    this.client.on("message", (message) => this.handleMessage(message));
    this.client.on("error", (error) => this.recordError("PERPL_REALTIME_WS_ERROR", error instanceof Error ? error.message : "Perpl market WebSocket error."));
    this.client.on("close", () => this.scheduleReconnect());
    this.client.connect();
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const mt = (message as { mt?: unknown }).mt;
    this.lastMessageAt = new Date(this.nowMs()).toISOString();
    if (mt === 6) this.handleSubscriptionResponse(message as SubscriptionResponse);
    else if (mt === 9) this.handleMarketState(message as MarketStateUpdateMessage);
    else if (mt === 10) this.handleFunding(message as MarketFundingUpdateMessage);
    else if (mt === 15 || mt === 16) this.handleBook(message as L2BookMessage);
    else if (mt === 100) this.handleHeartbeat(message as HeartbeatMessage);
  }

  private handleSubscriptionResponse(message: SubscriptionResponse): void {
    for (const item of message.subs) {
      if (item.status?.code && item.status.code !== 0) {
        this.recordError("PERPL_REALTIME_SUBSCRIPTION_FAILED", `${item.stream} subscription failed with ${item.status.code}.`);
      }
      this.subscriptions.rememberSid(item.stream, item.sid);
    }
    this.setStatus(this.lastError ? "degraded" : "live");
  }

  private handleMarketState(message: MarketStateUpdateMessage): void {
    const result = this.sequence.observe("market-state", message.sn);
    if (result.status === "duplicate") return;
    if (result.status === "gap") {
      void this.resyncAll("market-state sequence gap");
      return;
    }
    const updatedAt = new Date(this.nowMs()).toISOString();
    for (const [id, state] of Object.entries(message.d)) {
      if (!state) continue;
      const marketId = Number(id);
      if (!Number.isInteger(marketId)) continue;
      try {
        this.emitEvent({ event: "ticker", data: this.store.applyWsTicker(marketId, state, message.sn ?? null, updatedAt) });
      } catch (error) {
        this.recordError("PERPL_REALTIME_TICKER_APPLY_FAILED", error instanceof Error ? error.message : "Ticker update failed.");
      }
    }
  }

  private handleFunding(message: MarketFundingUpdateMessage): void {
    const result = this.sequence.observe("funding", message.sn);
    if (result.status === "duplicate") return;
    if (result.status === "gap") {
      void this.resyncAll("funding sequence gap");
      return;
    }
    const updatedAt = new Date(this.nowMs()).toISOString();
    for (const [id, event] of Object.entries(message.d)) {
      if (!event) continue;
      const marketId = Number(id);
      if (!Number.isInteger(marketId)) continue;
      this.emitEvent({ event: "funding", data: this.store.applyWsFunding(marketId, event, message.sn ?? null, updatedAt) });
    }
  }

  private handleBook(message: L2BookMessage): void {
    const stream = this.subscriptions.streamForSid(message.sid);
    const marketId = stream?.startsWith("order-book@") ? Number(stream.slice("order-book@".length)) : null;
    if (!marketId || !Number.isInteger(marketId)) return;
    const result = this.sequence.observe(`order-book:${marketId}`, message.sn);
    if (result.status === "duplicate") return;
    if (result.status === "gap") {
      void this.resyncMarket(marketId, "order book sequence gap");
      return;
    }
    const state = this.store.applyWsOrderBook(marketId, message, new Date(this.nowMs()).toISOString());
    if (!state) {
      void this.resyncMarket(marketId, "order book update arrived before base snapshot");
      return;
    }
    this.emitEvent({ event: "orderbook", data: state });
  }

  private handleHeartbeat(message: HeartbeatMessage): void {
    const result = this.sequence.observe("heartbeat", message.sn);
    if (result.status === "gap") this.recordError("PERPL_REALTIME_HEARTBEAT_GAP", "Heartbeat sequence gap detected.");
    this.emitEvent({ event: "heartbeat", data: { at: new Date(this.nowMs()).toISOString(), headBlock: message.h ?? null, sequence: message.sn ?? null, status: this.getStatus() } });
  }

  private async ensureSnapshots(marketIds: number[], channels: RealtimeChannel[]): Promise<void> {
    const context = await this.options.perplService.getRawContext();
    this.store.setContext(context);
    const fetchedAt = new Date(this.nowMs()).toISOString();
    for (const marketId of marketIds) {
      const market = context.markets.find((item) => item.id === marketId);
      if (market && channels.includes("ticker")) this.store.applyRestMarket(market, fetchedAt, "rest_fallback");
      if (market && channels.includes("funding")) this.store.applyRestFunding(marketId, market.funding ?? null, fetchedAt, "rest_fallback");
      if (channels.includes("orderbook") && this.publicClient) {
        try {
          const book = await this.publicClient.getOrderBook({ marketId, levels: 50 });
          this.store.applyRestOrderBook(marketId, book, fetchedAt, "rest_fallback");
        } catch (error) {
          this.recordError("PERPL_REALTIME_REST_BOOK_FAILED", error instanceof Error ? error.message : "Order book REST snapshot failed.");
        }
      }
    }
    this.lastRestSyncAt = fetchedAt;
  }

  private async normalizeMarkets(marketIds: number[]): Promise<number[]> {
    const context = await this.options.perplService.getRawContext();
    this.store.setContext(context);
    const requested = marketIds.length > 0 ? marketIds : context.markets.slice(0, this.config.maxMarketsPerClient).map((market) => market.id);
    const allowed = new Set(context.markets.map((market) => market.id));
    return requested.filter((marketId) => allowed.has(marketId)).slice(0, this.config.maxMarketsPerClient);
  }

  private async resyncAll(reason: string): Promise<void> {
    for (const marketId of this.store.getMarketIds()) this.store.markMarketStale(marketId);
    this.emitEvent({ event: "resync", data: { marketId: 0, reason, at: new Date(this.nowMs()).toISOString() } });
    try {
      await this.ensureSnapshots(this.store.getMarketIds().slice(0, this.config.maxMarketsPerClient), ["ticker", "funding", "orderbook"]);
      this.sequence.reset();
    } catch (error) {
      this.recordError("PERPL_REALTIME_RESYNC_FAILED", error instanceof Error ? error.message : "Realtime REST resync failed.");
    } finally {
      this.setStatus("degraded");
    }
  }

  private async resyncMarket(marketId: number, reason: string): Promise<void> {
    this.store.markMarketStale(marketId);
    this.emitEvent({ event: "resync", data: { marketId, reason, at: new Date(this.nowMs()).toISOString() } });
    try {
      await this.ensureSnapshots([marketId], ["ticker", "funding", "orderbook"]);
      this.sequence.reset(`order-book:${marketId}`);
    } catch (error) {
      this.recordError("PERPL_REALTIME_RESYNC_FAILED", error instanceof Error ? error.message : "Realtime REST resync failed.");
      this.setStatus("degraded");
    }
  }

  private scheduleReconnect(): void {
    if (this.subscriptions.activeStreams().length === 0 || this.status === "stopped") return;
    this.clearTimers();
    this.setStatus("reconnecting");
    const delay = this.reconnect.nextDelayMs();
    this.reconnectTimer = setTimeout(() => this.ensureConnected(this.subscriptions.activeStreams()), delay);
  }

  private startTimers(): void {
    this.clearTimers();
    this.heartbeatTimer = setInterval(() => this.client?.ping(), this.config.heartbeatIntervalMs);
    this.staleTimer = setInterval(() => {
      if (!this.lastMessageAt) return;
      if (this.nowMs() - Date.parse(this.lastMessageAt) > this.config.staleAfterMs) this.setStatus("stale");
    }, Math.min(this.config.staleAfterMs, 10_000));
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.staleTimer = null;
    this.reconnectTimer = null;
  }

  private setStatus(status: RealtimeStatus): void {
    this.status = status;
    this.emitEvent({ event: "status", data: this.getStatus() });
  }

  private recordError(code: string, message: string): void {
    this.lastError = { code, message: redactUrl(message), at: new Date(this.nowMs()).toISOString() };
    this.emitEvent({ event: "error", data: this.lastError });
  }

  private emitEvent(event: RealtimeSseEvent): void {
    this.emit("event", event);
  }
}

function normalizeChannels(channels: RealtimeChannel[]): RealtimeChannel[] {
  const allowed = new Set<RealtimeChannel>(["ticker", "funding", "orderbook", "heartbeat"]);
  const normalized = channels.filter((channel) => allowed.has(channel));
  return normalized.length > 0 ? normalized : ["ticker", "funding", "orderbook", "heartbeat"];
}

function readPrivatePublicClient(perplService: PerplService): PerplPublicClient | null {
  return typeof perplService.getPublicClient === "function" ? perplService.getPublicClient() : null;
}

function redactUrl(value: string): string {
  return value.replace(/(X-API-Key|X-API-Signature|secret|privateKey)[^,\s]*/gi, "$1=[redacted]");
}

export function streamsForRequest(marketIds: number[], channels: RealtimeChannel[], chainId: number): string[] {
  return buildStreams(marketIds, normalizeChannels(channels), chainId);
}

export function latestFundingEvent(funding: unknown): FundingEvent | null {
  if (!funding || typeof funding !== "object") return null;
  const data = (funding as { d?: unknown }).d;
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[data.length - 1] as FundingEvent;
}

export function assertBookSnapshot(book: L2Book): L2Book {
  return book;
}
