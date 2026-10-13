import "dotenv/config";
import { pathToFileURL } from "node:url";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { runPerplAgentWorkflow } from "./agents/perpl/orchestrator.js";
import { assertPerplAgentWorkflowRequest, normalizePolicy, validatePolicy } from "./agents/perpl/validation.js";
import { OpenAiProvider, type LlmProvider } from "./llm.js";
import { PerplApiError, toPublicPerplError } from "./perpl/errors.js";
import {
  PerplAnalyticsService,
  validateAnalyticsPeriod,
  validateHistoryMetric,
  validateMarketId
} from "./perpl/analytics/analyticsService.js";
import { PerplService } from "./perpl/service.js";
import { PerplRealtimeService } from "./perpl/realtime/realtimeService.js";
import type { RealtimeChannel, RealtimeSseEvent } from "./perpl/realtime/types.js";
import { PerplTradingExecutionService } from "./perpl/trading/executionService.js";
import { ReceiptNotFoundError, ReceiptService, workflowPlanHash } from "./receipts/receiptService.js";
import { policyHashForPolicy } from "./receipts/receiptBuilder.js";
import type { ReceiptAnchorRequest, ReceiptListQuery, ReceiptType } from "./receipts/types.js";
import { PerplRiskService, validateRiskOptions } from "./risk/perplRiskService.js";
import { simulatePerplRisk } from "./risk/simulator.js";
import { ValidationError } from "./validation.js";

export function createApp(
  options: {
    perplService?: PerplService;
    perplAnalyticsService?: PerplAnalyticsService;
    perplRiskService?: PerplRiskService;
    perplRealtimeService?: PerplRealtimeService;
    perplTradingService?: PerplTradingExecutionService;
    receiptService?: ReceiptService;
    llm?: LlmProvider;
  } = {}
) {
  const app = express();
  const llm = options.llm ?? new OpenAiProvider();
  const perpl = options.perplService ?? new PerplService();
  const perplRisk = options.perplRiskService ?? new PerplRiskService(perpl);
  const perplAnalytics = options.perplAnalyticsService ?? new PerplAnalyticsService({ perplService: perpl });
  const perplRealtime = options.perplRealtimeService ?? new PerplRealtimeService({ perplService: perpl });
  const receiptService = options.receiptService ?? new ReceiptService();
  const perplTrading = options.perplTradingService ?? new PerplTradingExecutionService({ perplService: perpl, receiptService });

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "assetpilot-backend-orchestrator" });
  });

  app.get("/api/perpl/health", async (_req, res, next) => {
    try {
      res.json(await perpl.health());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/context", async (_req, res, next) => {
    try {
      res.json(await perpl.getContext());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/markets", async (_req, res, next) => {
    try {
      res.json(await perpl.getMarkets());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/wallet", async (_req, res, next) => {
    try {
      res.json(await perpl.getWalletSummary());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/positions", async (_req, res, next) => {
    try {
      res.json(await perpl.getPositions());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/orders", async (_req, res, next) => {
    try {
      res.json(await perpl.getOrders());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/fills", async (req, res, next) => {
    try {
      const count = parsePositiveInteger(req.query.count, 50);
      const page = typeof req.query.page === "string" && req.query.page ? req.query.page : undefined;
      res.json(await perpl.getFills({ count, page }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/risk", async (req, res, next) => {
    try {
      res.json(await perplRisk.getRiskSnapshot(validateRiskOptions(req.query)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/risk/simulate", async (req, res, next) => {
    try {
      const inputs = await perplRisk.getRiskInputs(validateRiskOptions(req.query));
      res.json(simulatePerplRisk(inputs.snapshot, inputs.bundle, inputs.markets, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/policy/hash", async (req, res, next) => {
    try {
      const errors = validatePolicy(req.body, "policy");
      if (errors.length) throw new ValidationError(errors);
      const policy = normalizePolicy(req.body as Record<string, unknown>);
      res.json({ policyHash: policyHashForPolicy(policy), canonicalPolicy: policy });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/agent/run", async (req, res, next) => {
    try {
      const request = assertPerplAgentWorkflowRequest(req.body);
      const response = await runPerplAgentWorkflow(request, { perplRiskService: perplRisk, llm });
      let riskReviewReceiptId: string | null = null;
      try {
        const receipt = await receiptService.appendRiskReviewReceipt(request, response, {
          tradingEnabled: perplTrading.getConfig().enabled,
          allowedMarketIds: perplTrading.getConfig().allowedMarketIds,
          maxOrderNotionalUsd: perplTrading.getConfig().maxOrderNotionalUsd,
          maxLeverage: perplTrading.getConfig().maxLeverage,
          maxSlippageBps: perplTrading.getConfig().maxSlippageBps
        });
        riskReviewReceiptId = receipt.receiptId;
        response.auditStatus = { status: "saved", riskReviewReceiptId, planHash: workflowPlanHash(response), error: null };
      } catch (error) {
        response.auditStatus = { status: "failed", riskReviewReceiptId: null, planHash: workflowPlanHash(response), error: error instanceof Error ? error.message : "Receipt write failed." };
      }
      perplTrading.recordWorkflow(request, response, riskReviewReceiptId);
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/workflows/:workflowId/confirm", requireExecutionRequest(perplTrading), async (req, res, next) => {
    try {
      res.json(await perplTrading.confirmWorkflow(req.params.workflowId, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/trading/capabilities", async (_req, res, next) => {
    try {
      res.json(await perplTrading.getCapabilities());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/execution/intents", requireExecutionRequest(perplTrading), async (req, res, next) => {
    try {
      const workflowId = typeof req.body?.workflowId === "string" ? req.body.workflowId : "";
      if (!workflowId) throw new ValidationError(["workflowId is required."]);
      res.status(201).json(await perplTrading.createIntent(workflowId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/execution/intents/:intentId", async (req, res, next) => {
    try {
      res.json(perplTrading.getIntent(req.params.intentId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/execution/intents/:intentId/execute", requireExecutionRequest(perplTrading), async (req, res, next) => {
    try {
      res.json(await perplTrading.executeIntent(req.params.intentId, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/perpl/execution/intents/:intentId/reconcile", requireExecutionRequest(perplTrading), async (req, res, next) => {
    try {
      res.json(await perplTrading.reconcileIntent(req.params.intentId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/overview", async (req, res, next) => {
    try {
      res.json(await perplAnalytics.getOverview(validateAnalyticsPeriod(req.query.period)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/markets/:marketId", async (req, res, next) => {
    try {
      res.json(await perplAnalytics.getMarketAnalytics(validateMarketId(req.params.marketId), validateAnalyticsPeriod(req.query.period)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/markets/:marketId/history", async (req, res, next) => {
    try {
      res.json(
        await perplAnalytics.getMarketHistory(
          validateMarketId(req.params.marketId),
          validateAnalyticsPeriod(req.query.period),
          validateHistoryMetric(req.query.metric)
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/analytics/availability", (_req, res) => {
    res.json(perplAnalytics.getAvailability());
  });

  app.get("/api/perpl/realtime/status", (_req, res) => {
    res.json(perplRealtime.getStatus());
  });

  app.get("/api/perpl/realtime/stream", async (req, res, next) => {
    try {
      const marketIds = parseMarketIds(req.query.markets);
      const channels = parseRealtimeChannels(req.query.channels);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const writeEvent = (message: RealtimeSseEvent) => {
        res.write(`event: ${message.event}\n`);
        res.write(`data: ${JSON.stringify(message.data)}\n\n`);
      };

      const release = await perplRealtime.subscribe({ marketIds, channels, listener: writeEvent });
      const heartbeat = setInterval(() => writeEvent({ event: "heartbeat", data: { at: new Date().toISOString(), headBlock: null, sequence: null, status: perplRealtime.getStatus() } }), 15_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        release();
        res.end();
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/status", async (_req, res) => {
    const perplHealth = await safeStatus(() => perpl.health());
    const receiptChain = await safeStatus(async () => {
      await receiptService.initialize();
      return receiptService.verifyChain();
    });
    const analytics = perplAnalytics.getAvailability();
    const realtime = perplRealtime.getStatus();
    res.json({
      source: "assetpilot",
      network: "monad-testnet",
      checkedAt: new Date().toISOString(),
      services: {
        perplRest: statusItem(perplHealth.ok, perplHealth.ok ? "REST configured" : perplHealth.error),
        perplPublicWs: statusItem(["live", "connected", "subscribing"].includes(realtime.status), realtime.status),
        perplReadApi: statusItem(Boolean(perplHealth.ok && perplHealth.value.privateApiConfigured), perplHealth.ok && perplHealth.value.privateApiConfigured ? "configured" : "read API key not configured"),
        risk: statusItem(true, "available"),
        analytics: statusItem(analytics.dataAvailability.some((item) => item.status !== "unavailable"), "available"),
        agent: statusItem(true, "available with deterministic fallback when LLM is unavailable"),
        trading: statusItem(perplTrading.getConfig().enabled, perplTrading.getConfig().enabled ? "enabled" : "disabled"),
        receiptStore: statusItem(receiptChain.ok && receiptChain.value.valid, receiptChain.ok ? (receiptChain.value.valid ? "chain valid" : "chain invalid") : receiptChain.error),
        monadRpc: statusItem(Boolean(process.env.PERPL_RPC_URL), process.env.PERPL_RPC_URL ? "configured" : "not configured"),
        contracts: statusItem(false, "not in Perpl execution path")
      }
    });
  });

  app.get("/api/perpl/receipts", async (req, res, next) => {
    try {
      await receiptService.initialize();
      res.json(receiptService.listReceipts(parseReceiptQuery(req.query)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/receipts/verify-chain", async (_req, res, next) => {
    try {
      await receiptService.initialize();
      res.json(receiptService.verifyChain());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/receipts/:receiptId", async (req, res, next) => {
    try {
      await receiptService.initialize();
      const receipt = receiptService.getReceipt(req.params.receiptId);
      if (!receipt) {
        res.status(404).json({ error: { code: "RECEIPT_NOT_FOUND", message: "Receipt not found.", retryable: false } });
        return;
      }
      res.json(receipt);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/receipts/:receiptId/verify", async (req, res, next) => {
    try {
      await receiptService.initialize();
      res.json(await receiptService.verifyReceipt(req.params.receiptId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/perpl/receipts/:receiptId/anchor-status", async (req, res, next) => {
    try {
      await receiptService.initialize();
      res.json(receiptService.getAnchorStatus(req.params.receiptId));
    } catch (error) {
      if (error instanceof ReceiptNotFoundError) {
        res.status(404).json({ error: { code: "RECEIPT_NOT_FOUND", message: "Receipt not found.", retryable: false } });
        return;
      }
      next(error);
    }
  });

  app.post("/api/perpl/receipts/:receiptId/anchor", async (req, res, next) => {
    try {
      await receiptService.initialize();
      res.status(201).json(await receiptService.appendAnchorConfirmationReceipt(req.params.receiptId, parseReceiptAnchorRequest(req.body)));
    } catch (error) {
      if (error instanceof ReceiptNotFoundError) {
        res.status(404).json({ error: { code: "RECEIPT_NOT_FOUND", message: "Receipt not found.", retryable: false } });
        return;
      }
      next(error);
    }
  });

  app.get("/api/perpl/receipts/:receiptId/export", async (req, res, next) => {
    try {
      await receiptService.initialize();
      const receipt = receiptService.exportReceipt(req.params.receiptId);
      if (!receipt) {
        res.status(404).json({ error: { code: "RECEIPT_NOT_FOUND", message: "Receipt not found.", retryable: false } });
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.receiptId}.json"`);
      res.json(receipt);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({ error: "VALIDATION_ERROR", details: error.details });
      return;
    }

    if (error instanceof PerplApiError) {
      res.status(error.statusCode).json(toPublicPerplError(error));
      return;
    }

    console.error(error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

function parseReceiptQuery(query: Request["query"]): ReceiptListQuery {
  return {
    type: typeof query.type === "string" ? (query.type as ReceiptType) : undefined,
    decision: query.decision === "approve" || query.decision === "revise" || query.decision === "reject" ? query.decision : undefined,
    executionStatus: typeof query.executionStatus === "string" ? query.executionStatus : undefined,
    workflowId: typeof query.workflowId === "string" ? query.workflowId : undefined,
    cursor: typeof query.cursor === "string" ? query.cursor : undefined,
    limit: typeof query.limit === "string" ? Math.min(Math.max(Number(query.limit) || 25, 1), 100) : undefined
  };
}

function parseReceiptAnchorRequest(body: unknown): ReceiptAnchorRequest {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const errors: string[] = [];
  if (input.chainId !== 10143) errors.push("chainId must be 10143.");
  if (!isAddress(input.contractAddress)) errors.push("contractAddress must be a 20-byte hex address.");
  if (!isTransactionHash(input.txHash)) errors.push("txHash must be a 32-byte hex transaction hash.");
  if (!isAddress(input.submitter)) errors.push("submitter must be a 20-byte hex address.");
  if (errors.length) throw new ValidationError(errors);
  return {
    chainId: 10143,
    contractAddress: String(input.contractAddress),
    txHash: String(input.txHash),
    submitter: String(input.submitter)
  };
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isTransactionHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function parseMarketIds(value: unknown): number[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
    .slice(0, 8);
}

function parseRealtimeChannels(value: unknown): RealtimeChannel[] {
  const allowed = new Set<RealtimeChannel>(["ticker", "funding", "orderbook", "heartbeat"]);
  if (typeof value !== "string" || !value.trim()) return ["ticker", "funding", "orderbook", "heartbeat"];
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is RealtimeChannel => allowed.has(item as RealtimeChannel));
  return parsed.length > 0 ? parsed : ["ticker", "funding", "orderbook", "heartbeat"];
}

async function safeStatus<T>(fn: () => Promise<T> | T): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unavailable" };
  }
}

function statusItem(ok: boolean, detail: string) {
  return {
    status: ok ? "ok" : "degraded",
    detail
  };
}

const executionRateLimit = new Map<string, { count: number; resetAt: number }>();

function requireExecutionRequest(trading: PerplTradingExecutionService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin || !trading.getConfig().allowedFrontendOrigins.includes(origin)) {
      res.status(403).json({ error: { code: "PERPL_TRADING_VALIDATION_FAILED", message: "Execution requests require an allowed Origin.", retryable: false, perplStatus: null } });
      return;
    }
    if (!req.is("application/json")) {
      res.status(415).json({ error: { code: "PERPL_TRADING_VALIDATION_FAILED", message: "Execution requests must use application/json.", retryable: false, perplStatus: null } });
      return;
    }
    const key = `${origin}:${req.socket?.remoteAddress ?? "unknown"}`;
    const now = Date.now();
    const current = executionRateLimit.get(key);
    if (!current || current.resetAt <= now) {
      executionRateLimit.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    current.count += 1;
    if (current.count > 20) {
      res.status(429).json({ error: { code: "PERPL_RATE_LIMITED", message: "Too many Perpl execution requests.", retryable: true, perplStatus: null } });
      return;
    }
    next();
  };
}

const port = Number(process.env.PORT ?? 8787);

if (process.env.NODE_ENV !== "test" && import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  createApp().listen(port, () => {
    console.log(`AssetPilot backend orchestrator listening on http://localhost:${port}`);
  });
}
