import { Decimal } from "decimal.js";
import { PerplApiError } from "../errors.js";
import type { PerplMarket, PerplOrder, PerplPosition, PerplWalletSummary } from "../types.js";
import type { PerplAgentAction } from "../../agents/perpl/types.js";
import type { ExactOrderPreview, PerplOrderSpec, SupportedTradingActionType } from "./types.js";

const ORDER_TYPE_CLOSE_LONG = 3;
const ORDER_TYPE_CLOSE_SHORT = 4;
const ORDER_TYPE_CANCEL = 5;
const ORDER_FLAG_IMMEDIATE_OR_CANCEL = 4;

export interface OrderBuildInput {
  action: PerplAgentAction;
  wallet: PerplWalletSummary;
  positions: PerplPosition[];
  orders: PerplOrder[];
  markets: PerplMarket[];
}

export function buildExactOrderPreview(input: OrderBuildInput): ExactOrderPreview {
  if (input.action.type === "reduce_position") return buildPositionOrder(input, input.action.percentage);
  if (input.action.type === "close_position") return buildPositionOrder(input, 100);
  if (input.action.type === "cancel_order") return buildCancelOrder(input);
  throw new PerplApiError({
    code: "PERPL_TRADING_UNSUPPORTED",
    statusCode: 422,
    message: "Only reduce_position, close_position, and cancel_order are supported for Perpl testnet execution."
  });
}

function buildPositionOrder(input: OrderBuildInput, percentage: number): ExactOrderPreview {
  const action = input.action;
  if (action.type !== "reduce_position" && action.type !== "close_position") {
    throw new Error("Invalid position action.");
  }
  const position = input.positions.find((item) => item.positionId === action.positionId);
  if (!position) throw validationError("Position no longer exists.");
  if (position.side !== "long" && position.side !== "short") throw validationError("Position side is unavailable.");
  if (!position.size) throw validationError("Position size is unavailable.");

  const market = findMarket(input.markets, position.marketId);
  assertMarketReady(market);
  const account = findAccount(input.wallet, position.accountId);
  assertAccountReady(account);

  const rawSize = decimalToRaw(new Decimal(position.size).mul(percentage).div(100), market.sizeDecimals, "floor");
  if (new Decimal(rawSize).lte(0)) throw validationError("Calculated reduction size is zero.");

  const requestId = nextRequestId(account.lastForwardedRequestId);
  const mark = market.markPrice ? new Decimal(market.markPrice) : null;
  const notional = mark ? new Decimal(position.size).mul(percentage).div(100).mul(mark).toFixed() : null;
  const slippageBps = Math.trunc(action.maxSlippageBps);
  const leverageRaw = decimalToRaw(new Decimal(position.leverage), 2, "half-up");
  const type = position.side === "long" ? ORDER_TYPE_CLOSE_LONG : ORDER_TYPE_CLOSE_SHORT;
  const orderSpec: PerplOrderSpec = {
    rq: requestId,
    mkt: market.id,
    acc: position.accountId,
    t: type,
    p: 0,
    s: safeInteger(rawSize, "Order size"),
    ms: slippageBps,
    fl: ORDER_FLAG_IMMEDIATE_OR_CANCEL,
    lv: safeInteger(leverageRaw, "Order leverage"),
    lb: 0
  };
  const exactSize = rawToDecimal(rawSize, market.sizeDecimals);
  const actionType = action.type as SupportedTradingActionType;

  return {
    actionId: action.actionId,
    actionType,
    accountId: position.accountId,
    marketId: market.id,
    marketSymbol: market.symbol,
    requestId,
    orderSpec,
    reduceOnly: true,
    expectedSide: position.side === "long" ? "close_long" : "close_short",
    size: exactSize,
    sizeRaw: rawSize,
    notionalUsdEstimate: notional,
    markPrice: market.markPrice,
    worstAcceptablePrice: mark ? worstPrice(mark, position.side, slippageBps) : null,
    maxSlippageBps: slippageBps,
    leverage: position.leverage,
    humanReadable: `${action.type === "close_position" ? "Close" : `Reduce ${percentage}% of`} ${position.marketSymbol ?? `market ${market.id}`} ${position.side} position ${position.positionId}.`,
    warnings: []
  };
}

function buildCancelOrder(input: OrderBuildInput): ExactOrderPreview {
  const action = input.action;
  if (action.type !== "cancel_order") throw new Error("Invalid cancel action.");
  const order = input.orders.find((item) => item.orderId === action.orderId);
  if (!order) throw validationError("Order no longer exists.");
  const market = findMarket(input.markets, order.marketId);
  const account = findAccount(input.wallet, order.accountId);
  assertAccountReady(account);
  const requestId = nextRequestId(account.lastForwardedRequestId);
  const orderSpec: PerplOrderSpec = {
    rq: requestId,
    mkt: order.marketId,
    acc: order.accountId,
    oid: Number(order.orderId),
    t: ORDER_TYPE_CANCEL,
    p: 0,
    s: 0,
    fl: 0,
    lv: 0,
    lb: 0
  };
  return {
    actionId: action.actionId,
    actionType: "cancel_order",
    accountId: order.accountId,
    marketId: order.marketId,
    marketSymbol: order.marketSymbol,
    requestId,
    orderSpec,
    reduceOnly: true,
    expectedSide: "cancel",
    size: "0",
    sizeRaw: "0",
    notionalUsdEstimate: null,
    markPrice: market?.markPrice ?? null,
    worstAcceptablePrice: null,
    maxSlippageBps: null,
    leverage: null,
    humanReadable: `Cancel Perpl order ${order.orderId} on ${order.marketSymbol ?? `market ${order.marketId}`}.`,
    warnings: []
  };
}

function findMarket(markets: PerplMarket[], marketId: number): PerplMarket {
  const market = markets.find((item) => item.id === marketId);
  if (!market) throw validationError(`Market ${marketId} is unavailable.`);
  return market;
}

function assertMarketReady(market: PerplMarket): void {
  if (!market.isOpen) throw validationError(`Market ${market.id} is not open.`);
  if (!market.markPrice) throw validationError(`Market ${market.id} mark price is unavailable.`);
}

function findAccount(wallet: PerplWalletSummary, accountId: number): PerplWalletSummary["accounts"][number] {
  const account = wallet.accounts.find((item) => item.accountId === accountId);
  if (!account) throw validationError(`Account ${accountId} is unavailable.`);
  return account;
}

function assertAccountReady(account: PerplWalletSummary["accounts"][number]): void {
  if (account.isFrozen) throw validationError(`Account ${account.accountId} is frozen.`);
  if (!account.allowsForwarding) throw validationError(`Account ${account.accountId} has order forwarding disabled.`);
}

function nextRequestId(value: string): number {
  const current = Number(value);
  if (!Number.isSafeInteger(current) || current < 0) throw validationError("Account request id is outside JavaScript safe integer range.");
  return current + 1;
}

function safeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw validationError(`${label} is outside JavaScript safe integer range.`);
  return parsed;
}

function decimalToRaw(value: Decimal, decimals: number, rounding: "floor" | "half-up"): string {
  const scaled = value.mul(new Decimal(10).pow(decimals));
  const mode = rounding === "floor" ? Decimal.ROUND_FLOOR : Decimal.ROUND_HALF_UP;
  return scaled.toDecimalPlaces(0, mode).toFixed(0);
}

function rawToDecimal(value: string, decimals: number): string {
  return new Decimal(value).div(new Decimal(10).pow(decimals)).toFixed();
}

function worstPrice(mark: Decimal, side: "long" | "short", slippageBps: number): string {
  const factor = new Decimal(slippageBps).div(10_000);
  return side === "long" ? mark.mul(new Decimal(1).minus(factor)).toFixed() : mark.mul(new Decimal(1).plus(factor)).toFixed();
}

function validationError(message: string): PerplApiError {
  return new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message });
}
