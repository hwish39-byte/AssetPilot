import * as ed from "@noble/ed25519";
import { createHash, randomBytes } from "node:crypto";
import { PerplApiError } from "../errors.js";
import { hasPerplTradeCredentials } from "./config.js";
import type { PerplTradingConfig } from "./types.js";

ed.etc.sha512Sync = (...messages) => createHash("sha512").update(Buffer.concat(messages.map((message) => Buffer.from(message)))).digest();

export interface TradingAuthDeps {
  nowMs?: () => number;
  nonce?: () => string;
}

export interface TradingAuthFrame {
  mt: 29;
  chain_id: number;
  api_key: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

export function buildTradingWsCanonical(chainId: number, timestampMs: number, nonce: string): string {
  return `${chainId}\ntrading-ws-signin\n${timestampMs}\n${nonce}`;
}

export async function signTradingWsAuth(config: PerplTradingConfig, deps: TradingAuthDeps = {}): Promise<{ frame: TradingAuthFrame; canonical: string }> {
  if (!hasPerplTradeCredentials(config)) {
    throw new PerplApiError({
      code: "PERPL_CREDENTIALS_NOT_CONFIGURED",
      statusCode: 503,
      message: "Perpl trade API credentials are not configured."
    });
  }

  const timestamp = deps.nowMs?.() ?? Date.now();
  const nonce = deps.nonce?.() ?? randomBase64UrlNonce();
  const canonical = buildTradingWsCanonical(config.chainId, timestamp, nonce);
  const signatureBytes = await ed.sign(new TextEncoder().encode(canonical), privateKeyBytes(config.tradeApiKeySecret!));
  return {
    canonical,
    frame: {
      mt: 29,
      chain_id: config.chainId,
      api_key: config.tradeApiKey!,
      timestamp,
      nonce,
      signature: Buffer.from(signatureBytes).toString("base64url")
    }
  };
}

export function randomBase64UrlNonce(): string {
  return randomBytes(24).toString("base64url");
}

function privateKeyBytes(secret: string): Uint8Array {
  return Buffer.from(secret.replace(/^0x/, ""), "hex");
}
