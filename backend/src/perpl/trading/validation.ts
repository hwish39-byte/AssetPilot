import { Decimal } from "decimal.js";
import { PerplApiError } from "../errors.js";
import type { ExecutionIntent, TradingCapabilities, PerplTradingConfig } from "./types.js";

export function assertIntentCanBeSubmitted(intent: ExecutionIntent, config: PerplTradingConfig, capabilities: TradingCapabilities): void {
  if (!config.enabled) {
    throw new PerplApiError({ code: "PERPL_TRADING_DISABLED", statusCode: 403, message: "Perpl testnet trading is disabled by server configuration." });
  }
  if (!capabilities.canSubmitOrder) {
    throw new PerplApiError({ code: "PERPL_TRADING_DISABLED", statusCode: 403, message: capabilities.reasons.join(" ") || "Perpl testnet trading is not available." });
  }
  if (!["reduce_position", "close_position", "cancel_order"].includes(intent.preview.actionType)) {
    throw new PerplApiError({ code: "PERPL_TRADING_UNSUPPORTED", statusCode: 422, message: "Unsupported Perpl trading action." });
  }
  if (!intent.preview.reduceOnly) {
    throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Only reduce-only Perpl actions can be submitted." });
  }
  if (config.allowedMarketIds.length > 0 && !config.allowedMarketIds.includes(intent.preview.marketId)) {
    throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Market is not in PERPL_TRADING_ALLOWED_MARKET_IDS." });
  }
  if (intent.preview.notionalUsdEstimate && new Decimal(intent.preview.notionalUsdEstimate).gt(config.maxOrderNotionalUsd)) {
    throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Order notional exceeds PERPL_TRADING_MAX_ORDER_NOTIONAL_USD." });
  }
  if (intent.preview.maxSlippageBps !== null && intent.preview.maxSlippageBps > config.maxSlippageBps) {
    throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Order slippage exceeds PERPL_TRADING_MAX_SLIPPAGE_BPS." });
  }
  if (intent.preview.leverage !== null && new Decimal(intent.preview.leverage).gt(config.maxLeverage)) {
    throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Order leverage exceeds PERPL_TRADING_MAX_LEVERAGE." });
  }
}

export function assertExecuteBody(body: unknown): { planHash: string; idempotencyKey: string; confirmationText: string } {
  if (!body || typeof body !== "object") throw bodyError("Execution confirmation body is required.");
  const record = body as Record<string, unknown>;
  const planHash = typeof record.planHash === "string" ? record.planHash : "";
  const idempotencyKey = typeof record.idempotencyKey === "string" ? record.idempotencyKey : "";
  const confirmationText = typeof record.confirmationText === "string" ? record.confirmationText : "";
  if (!/^[a-f0-9]{64}$/.test(planHash)) throw bodyError("planHash is invalid.");
  if (!idempotencyKey.startsWith("perpl_exec_")) throw bodyError("idempotencyKey is invalid.");
  if (confirmationText !== "SUBMIT TESTNET ORDER") throw bodyError("confirmationText must exactly equal SUBMIT TESTNET ORDER.");
  return { planHash, idempotencyKey, confirmationText };
}

function bodyError(message: string): PerplApiError {
  return new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 400, message });
}
