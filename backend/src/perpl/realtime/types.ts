import type { BlockTimestamp, FundingEvent, L2Book, L2PriceLevel, MarketState, PerplMarket } from "../types.js";

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "subscribing"
  | "live"
  | "reconnecting"
  | "degraded"
  | "stale"
  | "failed"
  | "stopped";

export type RealtimeDataMode = "websocket" | "rest_fallback" | "mixed" | "unavailable";

export type RealtimeChannel = "ticker" | "funding" | "orderbook" | "heartbeat";

export interface PerplRealtimeConfig {
  wsUrl: string;
  chainId: number;
  maxMarketsPerClient: number;
  heartbeatIntervalMs: number;
  staleAfterMs: number;
  restResyncIntervalMs: number;
  maxReconnectDelayMs: number;
}

export interface MarketTickerState {
  marketId: number;
  source: "perpl";
  network: "monad-testnet";
  mode: RealtimeDataMode;
  fetchedAt: string;
  updatedAt: string;
  sequence: number | null;
  status: RealtimeStatus;
  values: {
    oraclePrice: string | null;
    markPrice: string | null;
    lastPrice: string | null;
    midPrice: string | null;
    bestBid: string | null;
    bestAsk: string | null;
    dailyVolumeSize: string | null;
    dailyVolumeAmount: string | null;
    openInterest: string | null;
    totalValueLocked: string | null;
  };
}

export interface MarketFundingState {
  marketId: number;
  source: "perpl";
  network: "monad-testnet";
  mode: RealtimeDataMode;
  fetchedAt: string;
  updatedAt: string;
  sequence: number | null;
  status: RealtimeStatus;
  fundingRateMicros: number | null;
  fundingIndexPrice: string | null;
  event: FundingEvent | null;
}

export interface MarketOrderBookState {
  marketId: number;
  source: "perpl";
  network: "monad-testnet";
  mode: RealtimeDataMode;
  fetchedAt: string;
  updatedAt: string;
  sequence: number | null;
  status: RealtimeStatus;
  hasBaseSnapshot: boolean;
  bids: NormalizedBookLevel[];
  asks: NormalizedBookLevel[];
}

export interface NormalizedBookLevel {
  price: string;
  size: string;
  orders: number;
  rawPrice: string;
  rawSize: string;
}

export interface MarketRealtimeSnapshot {
  market: PerplMarket;
  ticker: MarketTickerState | null;
  funding: MarketFundingState | null;
  orderbook: MarketOrderBookState | null;
}

export interface RealtimeServiceStatus {
  source: "perpl";
  network: "monad-testnet";
  status: RealtimeStatus;
  mode: RealtimeDataMode;
  wsUrl: string;
  publicOnly: true;
  connected: boolean;
  subscriptions: string[];
  marketCount: number;
  lastMessageAt: string | null;
  lastRestSyncAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
}

export type RealtimeSseEvent =
  | { event: "snapshot"; data: { markets: MarketRealtimeSnapshot[]; status: RealtimeServiceStatus } }
  | { event: "ticker"; data: MarketTickerState }
  | { event: "funding"; data: MarketFundingState }
  | { event: "orderbook"; data: MarketOrderBookState }
  | { event: "status"; data: RealtimeServiceStatus }
  | { event: "resync"; data: { marketId: number; reason: string; at: string } }
  | { event: "heartbeat"; data: { at: string; headBlock: number | null; sequence: number | null; status: RealtimeServiceStatus } }
  | { event: "error"; data: { code: string; message: string; at: string } };

export interface WsHeader {
  mt: number;
  sid?: number;
  sn?: number;
  cid?: number;
  ses?: string;
}

export interface SubscriptionRequest {
  mt: 5;
  subs: Array<{ stream: string; subscribe: boolean }>;
}

export interface SubscriptionResponse extends WsHeader {
  mt: 6;
  subs: Array<{ stream: string; sid?: number; status?: { code: number; error?: string } }>;
}

export interface MarketStateUpdateMessage extends WsHeader {
  mt: 9;
  d: Record<string, MarketState | undefined>;
}

export interface MarketFundingUpdateMessage extends WsHeader {
  mt: 10;
  d: Record<string, FundingEvent | undefined>;
}

export interface L2BookMessage extends WsHeader, Omit<L2Book, "mt" | "sn"> {
  mt: 15 | 16;
  sid: number;
  sn?: number;
}

export interface HeartbeatMessage extends WsHeader {
  mt: 100;
  sn: number;
  h: number;
}

export interface PerplWebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code?: number; reason?: string }) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

export type PerplWebSocketFactory = (url: string) => PerplWebSocketLike;

export interface BookSideInput {
  side: "bid" | "ask";
  levels: L2PriceLevel[];
}
