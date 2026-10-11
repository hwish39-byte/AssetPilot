import type { L2Book, PerplMarket } from "../types.js";
import { scaleInteger } from "../normalize.js";
import { Decimal, decimalOrNull, decimalString, ratioNumber, safeNumber, zero } from "../../risk/decimal.js";
import { metric } from "./availability.js";
import type { OrderBookAnalytics } from "./types.js";

export function calculateOrderBookMetrics(book: L2Book, market: PerplMarket, requestedLevels: number): OrderBookAnalytics {
  const bids = book.bid.map((level) => levelValue(level.p, level.s, market));
  const asks = book.ask.map((level) => levelValue(level.p, level.s, market));
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const bid = decimalOrNull(bestBid);
  const ask = decimalOrNull(bestAsk);
  const mid = bid && ask ? bid.plus(ask).div(2) : null;
  const spread = bid && ask ? ask.minus(bid) : null;
  const spreadBps = spread && mid && !mid.isZero() ? safeNumber(spread.div(mid).mul(10_000)) : null;
  const bidDepth = sumDepth(bids);
  const askDepth = sumDepth(asks);
  const imbalance = ratioNumber(bidDepth.minus(askDepth), bidDepth.plus(askDepth));

  return {
    bestBid,
    bestAsk,
    spread: metric({
      value: decimalString(spread),
      source: "perpl_public_rest_order_book",
      asOf: book.at.t ? new Date(book.at.t).toISOString() : null,
      methodology: "bestAsk - bestBid"
    }),
    spreadBps: metric({
      value: spreadBps,
      source: "perpl_public_rest_order_book",
      asOf: book.at.t ? new Date(book.at.t).toISOString() : null,
      methodology: "(bestAsk - bestBid) / midPrice * 10000"
    }),
    bidDepth: metric({ value: decimalString(bidDepth), source: "perpl_public_rest_order_book", methodology: "sum(price * size) across sampled bid levels" }),
    askDepth: metric({ value: decimalString(askDepth), source: "perpl_public_rest_order_book", methodology: "sum(price * size) across sampled ask levels" }),
    depthWithin10Bps: depthWithin(bids, asks, mid, 10),
    depthWithin50Bps: depthWithin(bids, asks, mid, 50),
    depthWithin100Bps: depthWithin(bids, asks, mid, 100),
    orderBookImbalance: metric({
      value: imbalance,
      source: "perpl_public_rest_order_book",
      methodology: "(bidDepth - askDepth) / (bidDepth + askDepth); this is not long/short skew"
    }),
    sampledLevels: { bid: bids.length, ask: asks.length, requested: requestedLevels }
  };
}

function levelValue(rawPrice: number, rawSize: number, market: PerplMarket): { price: string | null; size: string | null; notional: Decimal } {
  const price = scaleInteger(rawPrice, market.priceDecimals);
  const size = scaleInteger(rawSize, market.sizeDecimals);
  const notional = (decimalOrNull(price) ?? zero()).mul(decimalOrNull(size) ?? zero()).abs();
  return { price, size, notional };
}

function sumDepth(levels: Array<{ notional: Decimal }>): Decimal {
  return levels.reduce((sum, level) => sum.plus(level.notional), zero());
}

function depthWithin(
  bids: Array<{ price: string | null; notional: Decimal }>,
  asks: Array<{ price: string | null; notional: Decimal }>,
  mid: Decimal | null,
  bps: number
) {
  if (!mid || mid.isZero()) {
    return metric<{ bid: string; ask: string }>({
      value: null,
      source: "perpl_public_rest_order_book",
      methodology: `sum(price * size) within ${bps} bps of mid`,
      reason: "Mid price is unavailable."
    });
  }
  const band = new Decimal(bps).div(10_000);
  const minBid = mid.mul(new Decimal(1).minus(band));
  const maxAsk = mid.mul(new Decimal(1).plus(band));
  const bidDepth = bids
    .filter((level) => (decimalOrNull(level.price) ?? zero()).gte(minBid))
    .reduce((sum, level) => sum.plus(level.notional), zero());
  const askDepth = asks
    .filter((level) => (decimalOrNull(level.price) ?? zero()).lte(maxAsk))
    .reduce((sum, level) => sum.plus(level.notional), zero());
  return metric({
    value: { bid: decimalString(bidDepth) ?? "0", ask: decimalString(askDepth) ?? "0" },
    source: "perpl_public_rest_order_book",
    methodology: `sum(price * size) within ${bps} bps of mid`
  });
}
