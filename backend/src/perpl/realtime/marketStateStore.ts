import { normalizeMarket, scaleInteger } from "../normalize.js";
import type { Context, FundingEvent, L2PriceLevel, Market, MarketState } from "../types.js";
import type {
  L2BookMessage,
  MarketFundingState,
  MarketOrderBookState,
  MarketRealtimeSnapshot,
  MarketTickerState,
  RealtimeDataMode,
  RealtimeStatus
} from "./types.js";

export class MarketStateStore {
  private context: Context | null = null;
  private readonly tickers = new Map<number, MarketTickerState>();
  private readonly fundings = new Map<number, MarketFundingState>();
  private readonly orderbooks = new Map<number, MarketOrderBookState>();

  setContext(context: Context): void {
    this.context = context;
  }

  getContext(): Context | null {
    return this.context;
  }

  getMarketIds(): number[] {
    return this.context?.markets.map((market) => market.id) ?? [];
  }

  getSnapshots(marketIds: number[]): MarketRealtimeSnapshot[] {
    const context = this.requireContext();
    return marketIds.map((marketId) => {
      const market = this.requireMarket(marketId);
      return {
        market: normalizeMarket(market, new Date().toISOString(), collateralDecimals(context)),
        ticker: this.tickers.get(marketId) ?? null,
        funding: this.fundings.get(marketId) ?? null,
        orderbook: this.orderbooks.get(marketId) ?? null
      };
    });
  }

  applyRestMarket(market: Market, fetchedAt: string, mode: RealtimeDataMode = "rest_fallback"): MarketTickerState {
    const state = this.buildTicker(market.id, market.state, fetchedAt, fetchedAt, null, mode, "degraded");
    this.tickers.set(market.id, state);
    return state;
  }

  applyRestFunding(marketId: number, event: FundingEvent | null, fetchedAt: string, mode: RealtimeDataMode = "rest_fallback"): MarketFundingState {
    const market = this.requireMarket(marketId);
    const state: MarketFundingState = {
      source: "perpl",
      network: "monad-testnet",
      marketId,
      mode,
      fetchedAt,
      updatedAt: fetchedAt,
      sequence: null,
      status: "degraded",
      fundingRateMicros: event?.rate ?? market.funding?.rate ?? null,
      fundingIndexPrice: scaleInteger(event?.idx ?? market.funding?.idx, market.config.price_decimals),
      event
    };
    this.fundings.set(marketId, state);
    return state;
  }

  applyRestOrderBook(marketId: number, book: { bid: L2PriceLevel[]; ask: L2PriceLevel[]; sn?: number }, fetchedAt: string, mode: RealtimeDataMode = "rest_fallback"): MarketOrderBookState {
    const market = this.requireMarket(marketId);
    const state: MarketOrderBookState = {
      source: "perpl",
      network: "monad-testnet",
      marketId,
      mode,
      fetchedAt,
      updatedAt: fetchedAt,
      sequence: book.sn ?? null,
      status: "degraded",
      hasBaseSnapshot: true,
      bids: normalizeBookSide(book.bid, market.config.price_decimals, market.config.size_decimals, "bid"),
      asks: normalizeBookSide(book.ask, market.config.price_decimals, market.config.size_decimals, "ask")
    };
    this.orderbooks.set(marketId, state);
    return state;
  }

  applyWsTicker(marketId: number, marketState: MarketState, sequence: number | null, updatedAt: string): MarketTickerState {
    const state = this.buildTicker(marketId, marketState, this.tickers.get(marketId)?.fetchedAt ?? updatedAt, updatedAt, sequence, "websocket", "live");
    this.tickers.set(marketId, state);
    return state;
  }

  applyWsFunding(marketId: number, event: FundingEvent, sequence: number | null, updatedAt: string): MarketFundingState {
    const market = this.requireMarket(marketId);
    const state: MarketFundingState = {
      source: "perpl",
      network: "monad-testnet",
      marketId,
      mode: "websocket",
      fetchedAt: this.fundings.get(marketId)?.fetchedAt ?? updatedAt,
      updatedAt,
      sequence,
      status: "live",
      fundingRateMicros: event.rate ?? null,
      fundingIndexPrice: scaleInteger(event.idx, market.config.price_decimals),
      event
    };
    this.fundings.set(marketId, state);
    return state;
  }

  applyWsOrderBook(marketId: number, message: L2BookMessage, updatedAt: string): MarketOrderBookState | null {
    if (message.mt === 16 && !this.orderbooks.get(marketId)?.hasBaseSnapshot) return null;
    const market = this.requireMarket(marketId);
    const previous = this.orderbooks.get(marketId);
    const state: MarketOrderBookState = {
      source: "perpl",
      network: "monad-testnet",
      marketId,
      mode: "websocket",
      fetchedAt: previous?.fetchedAt ?? updatedAt,
      updatedAt,
      sequence: message.sn ?? null,
      status: "live",
      hasBaseSnapshot: true,
      bids: message.mt === 15 ? normalizeBookSide(message.bid, market.config.price_decimals, market.config.size_decimals, "bid") : mergeBookSide(previous?.bids ?? [], message.bid, market.config.price_decimals, market.config.size_decimals, "bid"),
      asks: message.mt === 15 ? normalizeBookSide(message.ask, market.config.price_decimals, market.config.size_decimals, "ask") : mergeBookSide(previous?.asks ?? [], message.ask, market.config.price_decimals, market.config.size_decimals, "ask")
    };
    this.orderbooks.set(marketId, state);
    return state;
  }

  markMarketStale(marketId: number): void {
    for (const collection of [this.tickers, this.fundings, this.orderbooks]) {
      const value = collection.get(marketId);
      if (value) collection.set(marketId, { ...value, status: "stale", mode: "mixed" } as never);
    }
  }

  private buildTicker(
    marketId: number,
    state: MarketState,
    fetchedAt: string,
    updatedAt: string,
    sequence: number | null,
    mode: RealtimeDataMode,
    status: RealtimeStatus
  ): MarketTickerState {
    const market = this.requireMarket(marketId);
    const amountDecimals = collateralDecimals(this.requireContext());
    return {
      source: "perpl",
      network: "monad-testnet",
      marketId,
      mode,
      fetchedAt,
      updatedAt,
      sequence,
      status,
      values: {
        oraclePrice: scaleInteger(state.orl, market.config.price_decimals),
        markPrice: scaleInteger(state.mrk, market.config.price_decimals),
        lastPrice: scaleInteger(state.lst, market.config.price_decimals),
        midPrice: scaleInteger(state.mid, market.config.price_decimals),
        bestBid: scaleInteger(state.bid, market.config.price_decimals),
        bestAsk: scaleInteger(state.ask, market.config.price_decimals),
        dailyVolumeSize: scaleInteger(state.dv, market.config.size_decimals),
        dailyVolumeAmount: scaleInteger(state.dva, amountDecimals),
        openInterest: scaleInteger(state.oi, market.config.size_decimals),
        totalValueLocked: scaleInteger(state.tvl, amountDecimals)
      }
    };
  }

  private requireContext(): Context {
    if (!this.context) throw new Error("Perpl realtime context is not initialized.");
    return this.context;
  }

  private requireMarket(marketId: number): Market {
    const market = this.requireContext().markets.find((item) => item.id === marketId);
    if (!market) throw new Error(`Perpl market ${marketId} is not in context.`);
    return market;
  }
}

function normalizeBookSide(levels: L2PriceLevel[], priceDecimals: number, sizeDecimals: number, side: "bid" | "ask") {
  const rows = levels
    .filter((level) => level.o > 0)
    .map((level) => ({
      price: scaleInteger(level.p, priceDecimals) ?? String(level.p),
      size: scaleInteger(level.s, sizeDecimals) ?? String(level.s),
      orders: level.o,
      rawPrice: String(Math.trunc(level.p)),
      rawSize: String(Math.trunc(level.s))
    }));
  rows.sort((left, right) => compareIntegerStrings(left.rawPrice, right.rawPrice) * (side === "bid" ? -1 : 1));
  return rows.slice(0, 50);
}

function mergeBookSide(current: ReturnType<typeof normalizeBookSide>, updates: L2PriceLevel[], priceDecimals: number, sizeDecimals: number, side: "bid" | "ask") {
  const byPrice = new Map(current.map((level) => [level.rawPrice, level]));
  for (const update of updates) {
    const rawPrice = String(Math.trunc(update.p));
    if (update.o === 0) {
      byPrice.delete(rawPrice);
      continue;
    }
    byPrice.set(rawPrice, normalizeBookSide([update], priceDecimals, sizeDecimals, side)[0]);
  }
  return [...byPrice.values()]
    .sort((left, right) => compareIntegerStrings(left.rawPrice, right.rawPrice) * (side === "bid" ? -1 : 1))
    .slice(0, 50);
}

function compareIntegerStrings(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

function collateralDecimals(context: Context): number {
  const tokenId = context.instances[0]?.collateral_token_id;
  return context.tokens.find((token) => token.id === tokenId)?.decimals ?? 0;
}
