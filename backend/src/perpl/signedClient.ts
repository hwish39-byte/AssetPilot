import { createHash, randomBytes } from "node:crypto";
import * as ed from "@noble/ed25519";
import type { PerplConfig } from "./config.js";
import { hasPerplCredentials } from "./config.js";
import { PerplApiError } from "./errors.js";
import { perplRequest, type PerplFetch, type PerplHttpClientOptions } from "./publicClient.js";
import type { AccountEvent, Fill, HistoryPage, Order, Portfolio, Position, Wallet, WalletOrders, WalletPositions } from "./types.js";

export interface SignedRequestDebug {
  canonical: string;
  nonce: string;
  timestamp: string;
  bodyHash: string;
  signature: string;
}

export interface PerplSignedClientOptions extends Omit<PerplHttpClientOptions, "apiUrl"> {
  config: PerplConfig;
  nowMs?: () => number;
  nonceGenerator?: () => string;
  onSignedRequest?: (debug: SignedRequestDebug) => void;
}

export class PerplSignedClient {
  private readonly config: PerplConfig;
  private readonly fetchImpl: PerplFetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: (attempt: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly nowMs: () => number;
  private readonly nonceGenerator: () => string;
  private readonly onSignedRequest?: (debug: SignedRequestDebug) => void;

  constructor(options: PerplSignedClientOptions) {
    this.config = { ...options.config, apiUrl: options.config.apiUrl.replace(/\/+$/, "") };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? ((attempt) => 250 * 2 ** attempt);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.nowMs = options.nowMs ?? Date.now;
    this.nonceGenerator = options.nonceGenerator ?? (() => randomBytes(16).toString("base64url"));
    this.onSignedRequest = options.onSignedRequest;
  }

  getWallet(): Promise<Wallet> {
    return this.get<Wallet>("/v1/trading/wallet");
  }

  getPositions(): Promise<WalletPositions> {
    return this.get<WalletPositions>("/v1/trading/positions");
  }

  getOrders(): Promise<WalletOrders> {
    return this.get<WalletOrders>("/v1/trading/orders");
  }

  getFills(params: PaginationParams = {}): Promise<HistoryPage<Fill>> {
    return this.get<HistoryPage<Fill>>(withPagination("/v1/trading/fills", params));
  }

  getAccountHistory(params: PaginationParams = {}): Promise<HistoryPage<AccountEvent>> {
    return this.get<HistoryPage<AccountEvent>>(withPagination("/v1/trading/account-history", params));
  }

  getOrderHistory(params: PaginationParams = {}): Promise<HistoryPage<Order>> {
    return this.get<HistoryPage<Order>>(withPagination("/v1/trading/order-history", params));
  }

  getPositionHistory(params: PaginationParams = {}): Promise<HistoryPage<Position>> {
    return this.get<HistoryPage<Position>>(withPagination("/v1/trading/position-history", params));
  }

  getPortfolio(kind: "equity" | "pnl", period: "all" | "day" | "2weeks" | "week" | "month"): Promise<Portfolio> {
    return this.get<Portfolio>(`/v1/trading/portfolio/${kind}/${period}`);
  }

  async get<T>(target: string): Promise<T> {
    return perplRequest<T>({
      apiUrl: this.config.apiUrl,
      target,
      method: "GET",
      getHeaders: async () => (await this.sign("GET", target, "")).headers,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryDelayMs: this.retryDelayMs,
      sleep: this.sleep
    });
  }

  async sign(method: string, target: string, rawBody = ""): Promise<{ headers: Record<string, string>; debug: SignedRequestDebug }> {
    if (!hasPerplCredentials(this.config)) {
      throw new PerplApiError({
        code: "PERPL_CREDENTIALS_NOT_CONFIGURED",
        statusCode: 503,
        message: "Perpl read API credentials are not configured."
      });
    }

    const timestamp = String(this.nowMs());
    const nonce = this.nonceGenerator();
    const bodyHash = sha256Hex(rawBody);
    const canonical = [this.config.chainId, method.toUpperCase(), target, timestamp, nonce, bodyHash].join("\n");
    const signatureBytes = await ed.signAsync(new TextEncoder().encode(canonical), privateKeyBytes(this.config.readApiKeySecret));
    const signature = Buffer.from(signatureBytes).toString("base64url");
    const debug = { canonical, nonce, timestamp, bodyHash, signature };
    this.onSignedRequest?.(debug);

    return {
      headers: {
        "X-API-Key": this.config.readApiKey ?? "",
        "X-API-Timestamp": timestamp,
        "X-API-Nonce": nonce,
        "X-API-Signature": signature
      },
      debug
    };
  }
}

export interface PaginationParams {
  count?: number;
  page?: string;
}

export function withPagination(target: string, params: PaginationParams): string {
  const search = new URLSearchParams();
  if (params.count !== undefined) search.set("count", String(params.count));
  if (params.page) search.set("page", params.page);
  const query = search.toString();
  return query ? `${target}?${query}` : target;
}

export function sha256Hex(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function privateKeyBytes(secret: string | undefined): Uint8Array {
  const hex = secret?.replace(/^0x/, "") ?? "";
  return Buffer.from(hex, "hex");
}
