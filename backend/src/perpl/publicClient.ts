import { codeForPerplStatus, PerplApiError, statusForPerplStatus } from "./errors.js";
import type {
  CandleSeries,
  Context,
  FundingSeries,
  L2Book,
  MarketFundingSeries,
  MarketStateUpdate
} from "./types.js";

export type PerplFetch = typeof fetch;

export interface PerplHttpClientOptions {
  apiUrl: string;
  fetchImpl?: PerplFetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

export class PerplPublicClient {
  private readonly apiUrl: string;
  private readonly fetchImpl: PerplFetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: (attempt: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: PerplHttpClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? ((attempt) => 250 * 2 ** attempt);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  getContext(): Promise<Context> {
    return this.get<Context>("/v1/pub/context");
  }

  getTicker(marketId?: number): Promise<MarketStateUpdate> {
    return this.get<MarketStateUpdate>(marketId === undefined ? "/v1/market-data/ticker" : `/v1/market-data/${marketId}/ticker`);
  }

  getCandles(args: { marketId: number; resolution: number; from: number; to: number }): Promise<CandleSeries> {
    return this.get<CandleSeries>(`/v1/market-data/${args.marketId}/candles/${args.resolution}/${args.from}-${args.to}`);
  }

  getFunding(args: { from: number; to: number; marketId?: number }): Promise<FundingSeries | MarketFundingSeries> {
    const prefix = args.marketId === undefined ? "/v1/market-data/funding" : `/v1/market-data/${args.marketId}/funding`;
    return this.get<FundingSeries | MarketFundingSeries>(`${prefix}/${args.from}-${args.to}`);
  }

  getOrderBook(args: { marketId: number; levels?: number }): Promise<L2Book> {
    const params = new URLSearchParams();
    if (args.levels !== undefined) params.set("levels", String(args.levels));
    const query = params.toString();
    return this.get<L2Book>(`/v1/market-data/${args.marketId}/book${query ? `?${query}` : ""}`);
  }

  protected async get<T>(target: string): Promise<T> {
    return perplRequest<T>({
      apiUrl: this.apiUrl,
      target,
      method: "GET",
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryDelayMs: this.retryDelayMs,
      sleep: this.sleep
    });
  }
}

export async function perplRequest<T>(args: {
  apiUrl: string;
  target: string;
  method: string;
  headers?: HeadersInit;
  getHeaders?: () => Promise<HeadersInit> | HeadersInit;
  body?: string;
  fetchImpl: PerplFetch;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: (attempt: number) => number;
  sleep: (ms: number) => Promise<void>;
}): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

    try {
      const headers = args.getHeaders ? await args.getHeaders() : args.headers;
      const response = await args.fetchImpl(`${args.apiUrl}${args.target}`, {
        method: args.method,
        headers,
        body: args.body,
        signal: controller.signal
      });

      if (!response.ok) {
        if (shouldRetry(response.status) && attempt < args.maxRetries) {
          await args.sleep(args.retryDelayMs(attempt));
          continue;
        }

        throw new PerplApiError({
          code: codeForPerplStatus(response.status),
          statusCode: statusForPerplStatus(response.status),
          perplStatus: response.status,
          retryable: shouldRetry(response.status),
          message: `Perpl API request failed with HTTP ${response.status}.`
        });
      }

      try {
        return (await response.json()) as T;
      } catch {
        throw new PerplApiError({
          code: "PERPL_INVALID_JSON",
          statusCode: 502,
          message: "Perpl API returned invalid JSON."
        });
      }
    } catch (error) {
      if (error instanceof PerplApiError) throw error;
      if (attempt < args.maxRetries) {
        await args.sleep(args.retryDelayMs(attempt));
        continue;
      }
      throw new PerplApiError({
        code: "PERPL_NETWORK_ERROR",
        statusCode: 502,
        retryable: true,
        message: "Perpl API request failed before a response was received."
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function shouldRetry(status: number): boolean {
  return status === 429 || status === 503;
}
