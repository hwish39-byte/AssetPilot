import { PerplApiError } from "../errors.js";
import { PERPL_TESTNET_DEFAULTS, hasPerplCredentials, type PerplConfig } from "../config.js";
import type { PerplTradingConfig } from "./types.js";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function loadPerplTradingConfig(
  perplConfig: PerplConfig,
  env: NodeJS.ProcessEnv = process.env
): PerplTradingConfig {
  const config: PerplTradingConfig = {
    enabled: parseBoolean(env.PERPL_TRADING_ENABLED, false),
    network: parseNetwork(env.PERPL_TRADING_NETWORK ?? "testnet"),
    apiUrl: perplConfig.apiUrl,
    wsUrl: perplConfig.wsUrl,
    chainId: perplConfig.chainId,
    tradeApiKey: normalizeOptional(env.PERPL_TRADE_API_KEY),
    tradeApiKeySecret: normalizeOptional(env.PERPL_TRADE_API_KEY_SECRET),
    allowedFrontendOrigins: parseCsv(env.PERPL_ALLOWED_FRONTEND_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    allowedMarketIds: parseNumberCsv(env.PERPL_TRADING_ALLOWED_MARKET_IDS),
    maxOrderNotionalUsd: parsePositiveDecimal(env.PERPL_TRADING_MAX_ORDER_NOTIONAL_USD, "100"),
    maxLeverage: parsePositiveNumber(env.PERPL_TRADING_MAX_LEVERAGE, 5),
    maxSlippageBps: parsePositiveInteger(env.PERPL_TRADING_MAX_SLIPPAGE_BPS, 50),
    intentTtlMs: parsePositiveInteger(env.PERPL_TRADING_INTENT_TTL_SECONDS, 180) * 1000,
    cooldownMs: parsePositiveInteger(env.PERPL_TRADING_COOLDOWN_SECONDS, 30) * 1000
  };

  assertTestnetConfig(config);

  if (config.tradeApiKeySecret) validateSecret(config.tradeApiKeySecret, "PERPL_TRADE_API_KEY_SECRET");
  if ((config.tradeApiKey && !config.tradeApiKeySecret) || (!config.tradeApiKey && config.tradeApiKeySecret)) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: "Perpl trade API key and secret must be configured together."
    });
  }

  return config;
}

export function hasPerplTradeCredentials(config: Pick<PerplTradingConfig, "tradeApiKey" | "tradeApiKeySecret">): boolean {
  return Boolean(config.tradeApiKey && config.tradeApiKeySecret);
}

export function hasReadonlyCredentials(config: Pick<PerplConfig, "readApiKey" | "readApiKeySecret">): boolean {
  return hasPerplCredentials(config);
}

function assertTestnetConfig(config: Pick<PerplTradingConfig, "apiUrl" | "wsUrl" | "chainId" | "network">): void {
  const apiHost = new URL(config.apiUrl).host;
  const wsHost = new URL(config.wsUrl).host;
  if (config.network !== "testnet" || config.chainId !== PERPL_TESTNET_DEFAULTS.chainId || apiHost !== "testnet.perpl.xyz" || wsHost !== "testnet.perpl.xyz") {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: "Perpl trading is restricted to the documented testnet configuration."
    });
  }
}

function parseNetwork(value: string): "testnet" {
  if (value !== "testnet") {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: "PERPL_TRADING_NETWORK must be testnet."
    });
  }
  return "testnet";
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 500, message: "PERPL_TRADING_ENABLED must be true or false." });
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  const items = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return items && items.length > 0 ? items : fallback;
}

function parseNumberCsv(value: string | undefined): number[] {
  if (!value?.trim()) return [];
  return value.split(",").map((item) => {
    const parsed = Number(item.trim());
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 500, message: "PERPL_TRADING_ALLOWED_MARKET_IDS must contain integer market ids." });
    }
    return parsed;
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 500, message: "Trading numeric configuration must be a positive integer." });
  }
  return parsed;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 500, message: "Trading numeric configuration must be positive." });
  }
  return parsed;
}

function parsePositiveDecimal(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  if (!/^\d+(\.\d+)?$/.test(candidate) || Number(candidate) <= 0) {
    throw new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 500, message: "PERPL_TRADING_MAX_ORDER_NOTIONAL_USD must be a positive decimal." });
  }
  return candidate;
}

function validateSecret(value: string, name: string): void {
  const hex = value.replace(/^0x/, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: `${name} must be a 32-byte hex Ed25519 private key.`
    });
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
