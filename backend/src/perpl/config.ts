import { PerplApiError } from "./errors.js";

export interface PerplConfig {
  apiUrl: string;
  wsUrl: string;
  chainId: number;
  rpcUrl: string;
  exchangeAddress: string;
  collateralToken: string;
  readApiKey?: string;
  readApiKeySecret?: string;
}

export const PERPL_TESTNET_DEFAULTS = {
  apiUrl: "https://testnet.perpl.xyz/api",
  wsUrl: "wss://testnet.perpl.xyz",
  chainId: 10143,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  exchangeAddress: "0x1964c32f0be608e7d29302aff5e61268e72080cc",
  collateralToken: "0xdf5b718d8fcc173335185a2a1513ee8151e3c027"
} as const;

export function loadPerplConfig(env: NodeJS.ProcessEnv = process.env): PerplConfig {
  const config: PerplConfig = {
    apiUrl: env.PERPL_API_URL ?? PERPL_TESTNET_DEFAULTS.apiUrl,
    wsUrl: env.PERPL_WS_URL ?? PERPL_TESTNET_DEFAULTS.wsUrl,
    chainId: parseChainId(env.PERPL_CHAIN_ID ?? String(PERPL_TESTNET_DEFAULTS.chainId)),
    rpcUrl: env.PERPL_RPC_URL ?? PERPL_TESTNET_DEFAULTS.rpcUrl,
    exchangeAddress: env.PERPL_EXCHANGE_ADDRESS ?? PERPL_TESTNET_DEFAULTS.exchangeAddress,
    collateralToken: env.PERPL_COLLATERAL_TOKEN ?? PERPL_TESTNET_DEFAULTS.collateralToken,
    readApiKey: normalizeOptional(env.PERPL_READ_API_KEY),
    readApiKeySecret: normalizeOptional(env.PERPL_READ_API_KEY_SECRET)
  };

  validateUrl(config.apiUrl, ["https:"], "PERPL_API_URL");
  validateUrl(config.wsUrl, ["wss:"], "PERPL_WS_URL");
  validateUrl(config.rpcUrl, ["https:"], "PERPL_RPC_URL");
  validateAddress(config.exchangeAddress, "PERPL_EXCHANGE_ADDRESS");
  validateAddress(config.collateralToken, "PERPL_COLLATERAL_TOKEN");

  if (config.readApiKeySecret) {
    validateSecret(config.readApiKeySecret);
  }

  if ((config.readApiKey && !config.readApiKeySecret) || (!config.readApiKey && config.readApiKeySecret)) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: "Perpl read API key and secret must be configured together."
    });
  }

  return config;
}

export function hasPerplCredentials(config: Pick<PerplConfig, "readApiKey" | "readApiKeySecret">): boolean {
  return Boolean(config.readApiKey && config.readApiKeySecret);
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseChainId(value: string): number {
  const chainId = Number(value);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: "PERPL_CHAIN_ID must be a positive integer."
    });
  }
  return chainId;
}

function validateUrl(value: string, protocols: string[], name: string): void {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: `${name} must be a valid ${protocols.join(" or ")} URL.`
    });
  }
}

function validateAddress(value: string, name: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: `${name} must be a 20-byte hex address.`
    });
  }
}

function validateSecret(value: string): void {
  const hex = value.replace(/^0x/, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: "PERPL_READ_API_KEY_SECRET must be a 32-byte hex Ed25519 private key."
    });
  }
}
