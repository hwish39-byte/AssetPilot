import type {
  AnalyticsAvailabilityResponse,
  AnalyticsHistoryMetric,
  AnalyticsPeriod,
  MarketAnalytics,
  MarketHistoryResponse,
  PerplFill,
  PerplAgentWorkflowRequest,
  PerplAgentWorkflowResponse,
  PerplCreateExecutionIntentResponse,
  PerplExecutionIntent,
  PerplMarket,
  PerplOrder,
  PerplPolicyHashResponse,
  PerplPosition,
  PerplRiskOptions,
  PerplRiskSimulationRequest,
  PerplRiskSimulationResult,
  PerplRiskSnapshot,
  PerplReceipt,
  PerplReceiptAnchorRequest,
  PerplReceiptAnchorStatus,
  PerplReceiptChainVerification,
  PerplReceiptListResponse,
  PerplReceiptType,
  PerplReceiptVerification,
  PerplRealtimeStatus,
  PerplTradingCapabilities,
  PerplWalletSummary,
  PerplWorkflowConfirmation,
  ProtocolOverview,
  SystemStatusResponse
} from "@/types/perpl";

export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(message: string, args: { status: number; code?: string | null; retryable?: boolean; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code ?? null;
    this.retryable = args.retryable ?? false;
    this.details = args.details;
  }
}

export async function getJson<T>(path: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  return requestJson<T>(path, { method: "GET", signal: options.signal, timeoutMs: options.timeoutMs });
}

export async function postJson<T>(
  path: string,
  body: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    timeoutMs: options.timeoutMs
  });
}

async function requestJson<T>(path: string, init: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init.timeoutMs ?? 12_000);
  const signal = mergeSignals(init.signal ?? undefined, controller.signal);

  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, signal });
    const text = await response.text();
    const payload = text ? parsePayload(text, response.status) : null;

    if (!response.ok) {
      const backendError = extractBackendError(payload);
      throw new ApiError(backendError.message ?? `${response.status} ${response.statusText}`, {
        status: response.status,
        code: backendError.code,
        retryable: backendError.retryable,
        details: payload
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out or was aborted.", { status: 0, code: "REQUEST_ABORTED", retryable: true });
    }
    throw new ApiError(error instanceof Error ? error.message : "Network request failed.", {
      status: 0,
      code: "NETWORK_ERROR",
      retryable: true
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function parsePayload(text: string, status: number): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Backend returned invalid JSON.", { status, code: "INVALID_JSON", retryable: false });
  }
}

function extractBackendError(payload: unknown): { code: string | null; message: string | null; retryable: boolean } {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const record = error as Record<string, unknown>;
      return {
        code: typeof record.code === "string" ? record.code : null,
        message: typeof record.message === "string" ? record.message : null,
        retryable: record.retryable === true
      };
    }
    if (typeof error === "string") return { code: error, message: error, retryable: false };
  }
  return { code: null, message: null, retryable: false };
}

function mergeSignals(left?: AbortSignal, right?: AbortSignal): AbortSignal | undefined {
  if (!left) return right;
  if (!right) return left;
  const controller = new AbortController();
  const abort = () => controller.abort();
  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export function shouldRetryApi(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) return false;
  return true;
}

export const perplApi = {
  overview: (period: AnalyticsPeriod, signal?: AbortSignal) => getJson<ProtocolOverview>(`/api/perpl/overview?period=${period}`, { signal }),
  availability: (signal?: AbortSignal) => getJson<AnalyticsAvailabilityResponse>("/api/perpl/analytics/availability", { signal }),
  market: (marketId: number, period: AnalyticsPeriod, signal?: AbortSignal) =>
    getJson<MarketAnalytics>(`/api/perpl/markets/${marketId}?period=${period}`, { signal }),
  marketHistory: (marketId: number, period: AnalyticsPeriod, metric: AnalyticsHistoryMetric, signal?: AbortSignal) =>
    getJson<MarketHistoryResponse>(`/api/perpl/markets/${marketId}/history?period=${period}&metric=${metric}`, { signal }),
  wallet: (signal?: AbortSignal) => getJson<PerplWalletSummary>("/api/perpl/wallet", { signal }),
  markets: (signal?: AbortSignal) => getJson<PerplMarket[]>("/api/perpl/markets", { signal }),
  positions: (signal?: AbortSignal) => getJson<PerplPosition[]>("/api/perpl/positions", { signal }),
  orders: (signal?: AbortSignal) => getJson<PerplOrder[]>("/api/perpl/orders", { signal }),
  fills: (signal?: AbortSignal) => getJson<{ data: PerplFill[]; nextPage: string }>("/api/perpl/fills?count=50", { signal }),
  risk: (options: PerplRiskOptions = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (options.historyCount) params.set("historyCount", String(options.historyCount));
    if (options.portfolioPeriod) params.set("portfolioPeriod", options.portfolioPeriod);
    const query = params.toString();
    return getJson<PerplRiskSnapshot>(`/api/perpl/risk${query ? `?${query}` : ""}`, { signal });
  },
  simulate: (request: PerplRiskSimulationRequest, signal?: AbortSignal) =>
    postJson<PerplRiskSimulationResult>("/api/perpl/risk/simulate", request, { signal }),
  policyHash: (policy: PerplAgentWorkflowRequest["policy"], signal?: AbortSignal) =>
    postJson<PerplPolicyHashResponse>("/api/perpl/policy/hash", policy, { signal }),
  runAgentWorkflow: (request: PerplAgentWorkflowRequest, signal?: AbortSignal) =>
    postJson<PerplAgentWorkflowResponse>("/api/perpl/agent/run", request, { signal, timeoutMs: 30_000 }),
  tradingCapabilities: (signal?: AbortSignal) => getJson<PerplTradingCapabilities>("/api/perpl/trading/capabilities", { signal }),
  confirmWorkflow: (workflowId: string, planHash: string, signal?: AbortSignal) =>
    postJson<PerplWorkflowConfirmation>(`/api/perpl/workflows/${encodeURIComponent(workflowId)}/confirm`, { workflowId, planHash, confirmation: true }, { signal }),
  createExecutionIntent: (workflowId: string, signal?: AbortSignal) =>
    postJson<PerplCreateExecutionIntentResponse>("/api/perpl/execution/intents", { workflowId }, { signal }),
  executeExecutionIntent: (intent: PerplExecutionIntent, confirmationText: string, signal?: AbortSignal) =>
    postJson<PerplExecutionIntent>(
      `/api/perpl/execution/intents/${encodeURIComponent(intent.intentId)}/execute`,
      { planHash: intent.planHash, idempotencyKey: intent.idempotencyKey, confirmationText },
      { signal, timeoutMs: 30_000 }
    ),
  reconcileExecutionIntent: (intentId: string, signal?: AbortSignal) =>
    postJson<PerplExecutionIntent>(`/api/perpl/execution/intents/${encodeURIComponent(intentId)}/reconcile`, {}, { signal }),
  receipts: (params: { type?: PerplReceiptType | ""; decision?: string; executionStatus?: string; cursor?: string | null; limit?: number } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.type) query.set("type", params.type);
    if (params.decision) query.set("decision", params.decision);
    if (params.executionStatus) query.set("executionStatus", params.executionStatus);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString();
    return getJson<PerplReceiptListResponse>(`/api/perpl/receipts${suffix ? `?${suffix}` : ""}`, { signal });
  },
  receipt: (receiptId: string, signal?: AbortSignal) => getJson<PerplReceipt>(`/api/perpl/receipts/${encodeURIComponent(receiptId)}`, { signal }),
  verifyReceipt: (receiptId: string, signal?: AbortSignal) => getJson<PerplReceiptVerification>(`/api/perpl/receipts/${encodeURIComponent(receiptId)}/verify`, { signal }),
  verifyReceiptChain: (signal?: AbortSignal) => getJson<PerplReceiptChainVerification>("/api/perpl/receipts/verify-chain", { signal }),
  receiptAnchorStatus: (receiptId: string, signal?: AbortSignal) => getJson<PerplReceiptAnchorStatus>(`/api/perpl/receipts/${encodeURIComponent(receiptId)}/anchor-status`, { signal }),
  recordReceiptAnchor: (receiptId: string, request: PerplReceiptAnchorRequest, signal?: AbortSignal) =>
    postJson<PerplReceiptAnchorStatus>(`/api/perpl/receipts/${encodeURIComponent(receiptId)}/anchor`, request, { signal, timeoutMs: 20_000 }),
  exportReceipt: (receiptId: string, signal?: AbortSignal) => getJson<PerplReceipt>(`/api/perpl/receipts/${encodeURIComponent(receiptId)}/export`, { signal }),
  realtimeStatus: (signal?: AbortSignal) => getJson<PerplRealtimeStatus>("/api/perpl/realtime/status", { signal }),
  systemStatus: (signal?: AbortSignal) => getJson<SystemStatusResponse>("/api/system/status", { signal })
};

export function perplRealtimeStreamUrl(params: { markets?: number[]; channels?: string[] } = {}) {
  const query = new URLSearchParams();
  if (params.markets?.length) query.set("markets", params.markets.join(","));
  if (params.channels?.length) query.set("channels", params.channels.join(","));
  const suffix = query.toString();
  return `${apiBase}/api/perpl/realtime/stream${suffix ? `?${suffix}` : ""}`;
}

export const getPerplRisk = (signal?: AbortSignal) => perplApi.risk({}, signal);
export const getPerplPositions = (signal?: AbortSignal) => perplApi.positions(signal);
export const getPerplOrders = (signal?: AbortSignal) => perplApi.orders(signal);
export const getPerplMarkets = (signal?: AbortSignal) => perplApi.markets(signal);
export const simulatePerplRisk = (request: PerplRiskSimulationRequest, signal?: AbortSignal) => perplApi.simulate(request, signal);
export const runPerplAgentWorkflow = (request: PerplAgentWorkflowRequest, signal?: AbortSignal) => perplApi.runAgentWorkflow(request, signal);
export const getPerplTradingCapabilities = (signal?: AbortSignal) => perplApi.tradingCapabilities(signal);
export const confirmPerplWorkflow = (workflowId: string, planHash: string, signal?: AbortSignal) => perplApi.confirmWorkflow(workflowId, planHash, signal);
export const createPerplExecutionIntent = (workflowId: string, signal?: AbortSignal) => perplApi.createExecutionIntent(workflowId, signal);
export const executePerplExecutionIntent = (intent: PerplExecutionIntent, confirmationText: string, signal?: AbortSignal) =>
  perplApi.executeExecutionIntent(intent, confirmationText, signal);
export const reconcilePerplExecutionIntent = (intentId: string, signal?: AbortSignal) => perplApi.reconcileExecutionIntent(intentId, signal);
