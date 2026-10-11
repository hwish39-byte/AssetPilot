import type {
  Account,
  AccountStats,
  Context,
  Fill,
  Market,
  Order,
  PerplContext,
  PerplFill,
  PerplMarket,
  PerplMetadata,
  PerplOrder,
  PerplPosition,
  PerplWalletSummary,
  Position,
  Token,
  Wallet
} from "./types.js";

const SOURCE = "perpl" as const;
const NETWORK = "monad-testnet" as const;

export function normalizeContext(context: Context, fetchedAt = new Date().toISOString()): PerplContext {
  return {
    ...metadata(fetchedAt),
    chain: context.chain,
    instances: context.instances,
    tokens: context.tokens,
    markets: context.markets.map((market) => normalizeMarket(market, fetchedAt, collateralDecimals(context)))
  };
}

export function normalizeMarkets(context: Context, fetchedAt = new Date().toISOString()): PerplMarket[] {
  const amountDecimals = collateralDecimals(context);
  return context.markets.map((market) => normalizeMarket(market, fetchedAt, amountDecimals));
}

export function normalizeMarket(market: Market, fetchedAt = new Date().toISOString(), collateralTokenDecimals = 0): PerplMarket {
  return {
    ...metadata(fetchedAt),
    id: market.id,
    symbol: market.symbol,
    name: market.name,
    sizeUnits: market.size_units,
    priceDecimals: market.config.price_decimals,
    sizeDecimals: market.config.size_decimals,
    isOpen: market.config.is_open,
    oraclePrice: scaleInteger(market.state?.orl, market.config.price_decimals),
    markPrice: scaleInteger(market.state?.mrk, market.config.price_decimals),
    lastPrice: scaleInteger(market.state?.lst, market.config.price_decimals),
    midPrice: scaleInteger(market.state?.mid, market.config.price_decimals),
    bestBid: scaleInteger(market.state?.bid, market.config.price_decimals),
    bestAsk: scaleInteger(market.state?.ask, market.config.price_decimals),
    dailyVolumeSize: scaleInteger(market.state?.dv, market.config.size_decimals),
    dailyVolumeAmount: scaleInteger(market.state?.dva, collateralTokenDecimals),
    openInterest: scaleInteger(market.state?.oi, market.config.size_decimals),
    totalValueLocked: scaleInteger(market.state?.tvl, collateralTokenDecimals),
    fundingRateMicros: market.funding?.rate ?? null,
    fundingIndexPrice: scaleInteger(market.funding?.idx, market.config.price_decimals)
  };
}

export function normalizeWallet(wallet: Wallet, context: Context, fetchedAt = new Date().toISOString()): PerplWalletSummary {
  return {
    ...metadata(fetchedAt),
    address: wallet.addr ?? null,
    nonce: wallet.n ?? null,
    feeLevel: wallet.fl ?? null,
    accounts: (wallet.as ?? []).map((account) => normalizeAccount(account, context)),
    stats: (wallet.sts ?? []).map((stats) => normalizeAccountStats(stats, context))
  };
}

export function normalizePositions(positions: Position[], context: Context, fetchedAt = new Date().toISOString()): PerplPosition[] {
  const amountDecimals = collateralDecimals(context);
  return positions.map((position) => {
    const market = findMarket(context, position.mkt);
    return {
      ...metadata(fetchedAt),
      marketId: position.mkt,
      marketSymbol: market?.symbol ?? null,
      accountId: position.acc,
      positionId: String(position.pid),
      side: position.sd === 1 ? "long" : position.sd === 2 ? "short" : null,
      status: position.st,
      statusReason: position.sr,
      collateral: scaleInteger(position.c, amountDecimals) ?? position.c,
      entryPrice: market ? scaleInteger(position.ep, market.config.price_decimals) : null,
      size: market ? scaleInteger(position.s, market.config.size_decimals) : null,
      fee: scaleInteger(position.fee, amountDecimals) ?? position.fee,
      closeFee: scaleInteger(position.cfee, amountDecimals),
      leverage: scaleInteger(position.lv, 2) ?? String(position.lv),
      realizedDeltaPnl: scaleInteger(position.dpnl, amountDecimals),
      realizedFundingPnl: scaleInteger(position.fnd, amountDecimals),
      exitPrice: market ? scaleInteger(position.xp, market.config.price_decimals) : null,
      openedAt: position.ots,
      updatedAt: position.at
    };
  });
}

export function normalizeOrders(orders: Order[], context: Context, fetchedAt = new Date().toISOString()): PerplOrder[] {
  const amountDecimals = collateralDecimals(context);
  return orders.map((order) => {
    const market = findMarket(context, order.mkt);
    return {
      ...metadata(fetchedAt),
      marketId: order.mkt,
      marketSymbol: market?.symbol ?? null,
      accountId: order.acc,
      orderId: String(order.oid),
      requestId: String(order.rq),
      smartContractOrderId: String(order.scid),
      type: order.t,
      status: order.st,
      statusReason: order.sr,
      failureReason: order.fr ?? null,
      limitPrice: market ? scaleInteger(order.p, market.config.price_decimals) : null,
      originalSize: market ? scaleInteger(order.os, market.config.size_decimals) : null,
      fillPrice: market ? scaleInteger(order.fp, market.config.price_decimals) : null,
      filledSize: market ? scaleInteger(order.fs, market.config.size_decimals) : null,
      fee: scaleInteger(order.f, amountDecimals) ?? order.f,
      builderFee: scaleInteger(order.bfa, amountDecimals),
      flags: order.fl,
      leverage: scaleInteger(order.lv, 2) ?? String(order.lv),
      createdAt: order.c,
      updatedAt: order.at
    };
  });
}

export function normalizeFills(fills: Fill[], context: Context, fetchedAt = new Date().toISOString()): PerplFill[] {
  const amountDecimals = collateralDecimals(context);
  return fills.map((fill) => {
    const market = findMarket(context, fill.mkt);
    return {
      ...metadata(fetchedAt),
      marketId: fill.mkt,
      marketSymbol: market?.symbol ?? null,
      accountId: fill.acc,
      orderId: String(fill.oid),
      orderType: fill.t,
      liquiditySide: fill.l === 1 ? "maker" : fill.l === 2 ? "taker" : null,
      price: market ? scaleInteger(fill.p, market.config.price_decimals) : null,
      size: market ? scaleInteger(fill.s, market.config.size_decimals) : null,
      fee: scaleInteger(fill.f, amountDecimals) ?? fill.f,
      builderFee: scaleInteger(fill.bfa, amountDecimals),
      timestamp: fill.at
    };
  });
}

export function scaleInteger(value: number | string | undefined | null, decimals: number): string | null {
  if (value === undefined || value === null) return null;
  const raw = typeof value === "number" ? String(Math.trunc(value)) : value;
  if (!/^-?\d+$/.test(raw)) return raw;
  const sign = raw.startsWith("-") ? "-" : "";
  const digits = sign ? raw.slice(1) : raw;
  if (decimals === 0) return `${sign}${digits}`;
  const padded = digits.padStart(decimals + 1, "0");
  const integer = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, "");
  return `${sign}${integer}${fractional ? `.${fractional}` : ""}`;
}

function normalizeAccount(account: Account, context: Context) {
  const decimals = collateralDecimals(context);
  return {
    instanceId: account.in,
    accountId: account.id,
    isFrozen: account.fr,
    allowsForwarding: account.fw,
    feeTier: account.ft,
    lastForwardedRequestId: String(account.lfr),
    balance: scaleInteger(account.b, decimals) ?? account.b,
    lockedBalance: scaleInteger(account.lb, decimals) ?? account.lb
  };
}

function normalizeAccountStats(stats: AccountStats, context: Context) {
  const decimals = collateralDecimals(context);
  return {
    instanceId: stats.in,
    accountId: stats.id,
    totalDeposits: scaleInteger(stats.td, decimals) ?? stats.td,
    totalWithdrawals: scaleInteger(stats.tw, decimals) ?? stats.tw,
    totalVolume: scaleInteger(stats.tv, decimals) ?? stats.tv,
    totalFees: scaleInteger(stats.tf, decimals) ?? stats.tf,
    totalBuilderFees: scaleInteger(stats.tbf, decimals),
    totalRealizedPnl: scaleInteger(stats.trp, decimals) ?? stats.trp,
    winRateBps: stats.wr,
    tradeCount: stats.tt
  };
}

function collateralDecimals(context: Context): number {
  return collateralToken(context)?.decimals ?? 0;
}

function collateralToken(context: Context): Token | undefined {
  const tokenId = context.instances[0]?.collateral_token_id;
  return context.tokens.find((token) => token.id === tokenId);
}

function findMarket(context: Context, marketId: number): Market | undefined {
  return context.markets.find((market) => market.id === marketId);
}

function metadata(fetchedAt: string): PerplMetadata {
  return {
    source: SOURCE,
    network: NETWORK,
    fetchedAt
  };
}
