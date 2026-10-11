import { hasPerplCredentials, loadPerplConfig, type PerplConfig } from "./config.js";
import { PerplApiError } from "./errors.js";
import {
  normalizeContext,
  normalizeFills,
  normalizeMarkets,
  normalizeOrders,
  normalizePositions,
  normalizeWallet
} from "./normalize.js";
import { PerplPublicClient, type PerplHttpClientOptions } from "./publicClient.js";
import { PerplSignedClient, type PaginationParams, type PerplSignedClientOptions } from "./signedClient.js";
import type { Context, PerplContext, PerplFill, PerplMarket, PerplOrder, PerplPosition, PerplWalletSummary } from "./types.js";
import type { PerplRiskDataBundle, PerplRiskOptions } from "../risk/perplRiskTypes.js";

export interface PerplServiceOptions {
  config?: PerplConfig;
  publicClient?: PerplPublicClient;
  signedClient?: PerplSignedClient;
  clientOptions?: Omit<PerplHttpClientOptions, "apiUrl">;
  signedClientOptions?: Omit<PerplSignedClientOptions, "config">;
  contextTtlMs?: number;
  nowMs?: () => number;
}

export class PerplService {
  private readonly config: PerplConfig;
  private readonly publicClient: PerplPublicClient;
  private readonly signedClient: PerplSignedClient;
  private readonly contextTtlMs: number;
  private readonly nowMs: () => number;
  private contextCache?: { expiresAt: number; value: Context };

  constructor(options: PerplServiceOptions = {}) {
    this.config = options.config ?? loadPerplConfig();
    this.publicClient =
      options.publicClient ??
      new PerplPublicClient({
        apiUrl: this.config.apiUrl,
        ...options.clientOptions
      });
    this.signedClient =
      options.signedClient ??
      new PerplSignedClient({
        config: this.config,
        ...options.clientOptions,
        ...options.signedClientOptions
      });
    this.contextTtlMs = options.contextTtlMs ?? 30_000;
    this.nowMs = options.nowMs ?? Date.now;
  }

  async health() {
    return {
      status: "ok",
      source: "perpl",
      network: "monad-testnet",
      publicApiConfigured: true,
      privateApiConfigured: hasPerplCredentials(this.config)
    };
  }

  async getContext(): Promise<PerplContext> {
    const fetchedAt = new Date(this.nowMs()).toISOString();
    return normalizeContext(await this.getRawContext(), fetchedAt);
  }

  async getMarkets(): Promise<PerplMarket[]> {
    const fetchedAt = new Date(this.nowMs()).toISOString();
    return normalizeMarkets(await this.getRawContext(), fetchedAt);
  }

  async getWalletSummary(): Promise<PerplWalletSummary> {
    this.assertCredentials();
    const [context, wallet] = await Promise.all([this.getRawContext(), this.signedClient.getWallet()]);
    return normalizeWallet(wallet, context, new Date(this.nowMs()).toISOString());
  }

  async getPositions(): Promise<PerplPosition[]> {
    this.assertCredentials();
    const [context, response] = await Promise.all([this.getRawContext(), this.signedClient.getPositions()]);
    return normalizePositions(response.d, context, new Date(this.nowMs()).toISOString());
  }

  async getOrders(): Promise<PerplOrder[]> {
    this.assertCredentials();
    const [context, response] = await Promise.all([this.getRawContext(), this.signedClient.getOrders()]);
    return normalizeOrders(response.d, context, new Date(this.nowMs()).toISOString());
  }

  async getFills(params: PaginationParams = {}): Promise<{ data: PerplFill[]; nextPage: string }> {
    this.assertCredentials();
    const [context, response] = await Promise.all([this.getRawContext(), this.signedClient.getFills(params)]);
    return {
      data: normalizeFills(response.d, context, new Date(this.nowMs()).toISOString()),
      nextPage: response.np
    };
  }

  async getPositionHistory(params: PaginationParams = {}) {
    this.assertCredentials();
    return this.signedClient.getPositionHistory(params);
  }

  async getOrderHistory(params: PaginationParams = {}) {
    this.assertCredentials();
    return this.signedClient.getOrderHistory(params);
  }

  async getAccountHistory(params: PaginationParams = {}) {
    this.assertCredentials();
    return this.signedClient.getAccountHistory(params);
  }

  async getPortfolioEquity(period: "all" | "day" | "2weeks" | "week" | "month" = "week") {
    this.assertCredentials();
    return this.signedClient.getPortfolio("equity", period);
  }

  async getPortfolioPnl(period: "all" | "day" | "2weeks" | "week" | "month" = "week") {
    this.assertCredentials();
    return this.signedClient.getPortfolio("pnl", period);
  }

  async getRiskDataBundle(options: PerplRiskOptions = {}): Promise<PerplRiskDataBundle> {
    this.assertCredentials();
    const count = Math.min(Math.max(options.historyCount ?? 50, 1), 100);
    const portfolioPeriod = options.portfolioPeriod ?? "week";
    const [wallet, positions, orders, fills, accountHistory, orderHistory, positionHistory, portfolioEquity, portfolioPnl] =
      await Promise.all([
        this.getWalletSummary(),
        this.getPositions(),
        this.getOrders(),
        this.getFills({ count }),
        this.signedClient.getAccountHistory({ count }),
        this.signedClient.getOrderHistory({ count }),
        this.signedClient.getPositionHistory({ count }),
        this.signedClient.getPortfolio("equity", portfolioPeriod),
        this.signedClient.getPortfolio("pnl", portfolioPeriod)
      ]);

    const pagesFetched = 3;
    const recordsFetched = accountHistory.d.length + orderHistory.d.length + positionHistory.d.length;
    const historyComplete = !accountHistory.np && !orderHistory.np && !positionHistory.np;

    return {
      wallet,
      positions,
      orders,
      fills: fills.data,
      accountHistory: accountHistory.d,
      orderHistory: orderHistory.d,
      positionHistory: positionHistory.d,
      portfolioEquity,
      portfolioPnl,
      historyComplete,
      pagesFetched,
      recordsFetched,
      partialErrors: []
    };
  }

  async getRawContext(): Promise<Context> {
    const now = this.nowMs();
    if (this.contextCache && this.contextCache.expiresAt > now) {
      return this.contextCache.value;
    }

    const value = await this.publicClient.getContext();
    this.contextCache = { value, expiresAt: now + this.contextTtlMs };
    return value;
  }

  getPublicClient(): PerplPublicClient {
    return this.publicClient;
  }

  private assertCredentials(): void {
    if (!hasPerplCredentials(this.config)) {
      throw new PerplApiError({
        code: "PERPL_CREDENTIALS_NOT_CONFIGURED",
        statusCode: 503,
        message: "Perpl read API credentials are not configured."
      });
    }
  }
}
