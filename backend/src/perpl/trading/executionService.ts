import { createHash } from "node:crypto";
import { PerplApiError } from "../errors.js";
import { loadPerplConfig, hasPerplCredentials, type PerplConfig } from "../config.js";
import { PerplService } from "../service.js";
import { loadPerplTradingConfig, hasPerplTradeCredentials } from "./config.js";
import { buildExactOrderPreview } from "./orderBuilder.js";
import { ExecutionIntentStore, toPublicIntent } from "./intentStore.js";
import { assertExecuteBody, assertIntentCanBeSubmitted } from "./validation.js";
import { PerplTradingWsClient } from "./wsClient.js";
import { ReceiptService, workflowPlanHash } from "../../receipts/receiptService.js";
import type { PerplAgentWorkflowRequest, PerplAgentWorkflowResponse } from "../../agents/perpl/types.js";
import type {
  CreateExecutionIntentResponse,
  PerplTradingClient,
  PerplTradingConfig,
  PublicExecutionIntent,
  TradingCapabilities
} from "./types.js";

export interface PerplTradingExecutionServiceOptions {
  perplService?: PerplService;
  perplConfig?: PerplConfig;
  tradingConfig?: PerplTradingConfig;
  store?: ExecutionIntentStore;
  tradingClient?: PerplTradingClient;
  receiptService?: ReceiptService;
  requireExecutionReceipt?: boolean;
  nowMs?: () => number;
}

export class PerplTradingExecutionService {
  private readonly perpl: PerplService;
  private readonly perplConfig: PerplConfig;
  private readonly config: PerplTradingConfig;
  private readonly store: ExecutionIntentStore;
  private readonly client: PerplTradingClient;
  private readonly receiptService?: ReceiptService;
  private readonly requireExecutionReceipt: boolean;
  private readonly nowMs: () => number;

  constructor(options: PerplTradingExecutionServiceOptions = {}) {
    this.perpl = options.perplService ?? new PerplService();
    this.perplConfig = options.perplConfig ?? loadPerplConfig();
    this.config = options.tradingConfig ?? loadPerplTradingConfig(this.perplConfig);
    this.nowMs = options.nowMs ?? Date.now;
    this.store = options.store ?? new ExecutionIntentStore({ ttlMs: this.config.intentTtlMs, nowMs: this.nowMs });
    this.client = options.tradingClient ?? new PerplTradingWsClient({ config: this.config });
    this.receiptService = options.receiptService;
    this.requireExecutionReceipt = options.requireExecutionReceipt ?? parseBoolean(process.env.PERPL_REQUIRE_EXECUTION_RECEIPT, true);
  }

  getConfig(): PerplTradingConfig {
    return this.config;
  }

  recordWorkflow(request: PerplAgentWorkflowRequest, response: PerplAgentWorkflowResponse, riskReviewReceiptId: string | null = null): void {
    this.store.recordWorkflow(request, response, riskReviewReceiptId);
  }

  getWorkflow(workflowId: string) {
    return this.store.getWorkflow(workflowId);
  }

  async confirmWorkflow(workflowId: string, body: unknown) {
    const stored = this.store.getWorkflow(workflowId);
    if (!stored) throw new PerplApiError({ code: "PERPL_TRADING_INTENT_NOT_FOUND", statusCode: 404, message: "Workflow was not found in server memory. Rerun the Agent workflow." });
    const planHash = typeof (body as { planHash?: unknown })?.planHash === "string" ? (body as { planHash: string }).planHash : "";
    const confirmation = (body as { confirmation?: unknown })?.confirmation === true;
    if (!confirmation) throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 400, message: "confirmation must be true." });
    if (stored.response.riskReview.decision !== "approve") throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Only approved workflows can be confirmed." });
    if (new Date(stored.request.policy.expiresAt).getTime() <= this.nowMs()) throw new PerplApiError({ code: "PERPL_TRADING_INTENT_EXPIRED", statusCode: 410, message: "Workflow policy has expired." });
    if (workflowPlanHash(stored.response) !== planHash) throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 409, message: "planHash does not match workflow execution plan." });
    if (stored.response.execution.descriptors.some((descriptor) => descriptor.calldata !== null || descriptor.signature !== null)) {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Execution plan must not contain calldata or signatures." });
    }
    if (!this.receiptService || !stored.riskReviewReceiptId) {
      if (this.requireExecutionReceipt) throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 503, message: "Receipt service is required before workflow confirmation." });
      return { workflowId, confirmedAt: new Date(this.nowMs()).toISOString(), planHash, userConfirmationReceiptId: null };
    }
    const receipt = await this.receiptService.appendUserConfirmationReceipt({ workflow: stored, riskReviewReceiptId: stored.riskReviewReceiptId, planHash });
    this.store.confirmWorkflow(workflowId, receipt.receiptId);
    return { workflowId, confirmedAt: receipt.createdAt, planHash, userConfirmationReceiptId: receipt.receiptId };
  }

  async getCapabilities(): Promise<TradingCapabilities> {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let wallet: TradingCapabilities["wallet"] = {
      address: null,
      forwardingEnabled: null,
      frozen: null,
      accounts: []
    };

    if (!this.config.enabled) reasons.push("PERPL_TRADING_ENABLED is false.");
    if (!hasPerplTradeCredentials(this.config)) reasons.push("Perpl trade API credentials are not configured.");
    if (!hasPerplCredentials(this.perplConfig)) reasons.push("Perpl read API credentials are required to validate wallet state before trading.");
    if (this.config.allowedMarketIds.length === 0) warnings.push("PERPL_TRADING_ALLOWED_MARKET_IDS is empty, so all documented testnet markets are eligible after policy checks.");

    if (hasPerplCredentials(this.perplConfig)) {
      try {
        const summary = await this.perpl.getWalletSummary();
        wallet = {
          address: summary.address,
          forwardingEnabled: summary.accounts.length > 0 ? summary.accounts.every((account) => account.allowsForwarding) : false,
          frozen: summary.accounts.some((account) => account.isFrozen),
          accounts: summary.accounts.map((account) => ({
            accountId: account.accountId,
            allowsForwarding: account.allowsForwarding,
            isFrozen: account.isFrozen,
            lastForwardedRequestId: account.lastForwardedRequestId
          }))
        };
        if (!wallet.forwardingEnabled) reasons.push("One or more Perpl accounts have order forwarding disabled.");
        if (wallet.frozen) reasons.push("One or more Perpl accounts are frozen.");
      } catch (error) {
        reasons.push("Wallet state could not be validated.");
        warnings.push(error instanceof Error ? error.message : "Unknown wallet validation error.");
      }
    }

    const canSubmitOrder = this.config.enabled && hasPerplTradeCredentials(this.config) && hasPerplCredentials(this.perplConfig) && wallet.forwardingEnabled === true && wallet.frozen === false;

    return {
      source: "perpl",
      network: "monad-testnet",
      fetchedAt: new Date(this.nowMs()).toISOString(),
      tradingEnabled: this.config.enabled,
      credentialsConfigured: hasPerplTradeCredentials(this.config),
      readonlyKeyConfigured: hasPerplCredentials(this.perplConfig),
      testnetOnly: true,
      canPrepareIntent: hasPerplCredentials(this.perplConfig),
      canSubmitOrder,
      allowedMarketIds: this.config.allowedMarketIds,
      allowedActions: ["reduce_position", "close_position", "cancel_order"],
      limits: {
        maxOrderNotionalUsd: this.config.maxOrderNotionalUsd,
        maxLeverage: this.config.maxLeverage,
        maxSlippageBps: this.config.maxSlippageBps,
        intentTtlSeconds: Math.floor(this.config.intentTtlMs / 1000),
        cooldownSeconds: Math.floor(this.config.cooldownMs / 1000)
      },
      wallet,
      reasons,
      warnings
    };
  }

  async createIntent(workflowId: string): Promise<CreateExecutionIntentResponse> {
    const stored = this.store.getWorkflow(workflowId);
    if (!stored) throw new PerplApiError({ code: "PERPL_TRADING_INTENT_NOT_FOUND", statusCode: 404, message: "Approved workflow was not found in server memory. Rerun the Agent workflow." });
    const { request, response } = stored;
    if (response.state !== "dry_run_prepared" || response.riskReview.decision !== "approve" || response.execution.status !== "dry_run_prepared") {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Workflow is not approved for execution." });
    }
    if (new Date(request.policy.expiresAt).getTime() <= this.nowMs()) {
      throw new PerplApiError({ code: "PERPL_TRADING_INTENT_EXPIRED", statusCode: 410, message: "Workflow policy has expired." });
    }

    const approvedActions = response.strategy.actions.filter((action) => response.riskReview.approvedActionIds.includes(action.actionId));
    const executable = approvedActions.filter((action) => ["reduce_position", "close_position", "cancel_order"].includes(action.type));
    if (executable.length !== 1 || approvedActions.length !== 1) {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 422, message: "Exactly one approved reduce, close, or cancel action is required for testnet execution." });
    }

    const [wallet, positions, orders, markets, capabilities] = await Promise.all([
      this.perpl.getWalletSummary(),
      this.perpl.getPositions(),
      this.perpl.getOrders(),
      this.perpl.getMarkets(),
      this.getCapabilities()
    ]);
    const preview = buildExactOrderPreview({ action: executable[0]!, wallet, positions, orders, markets });
    const intent = this.store.createIntent({
      workflowId,
      preview,
      approvedAction: executable[0]!,
      riskFingerprint: workflowFingerprint(response),
      warnings: [...response.warnings, ...capabilities.warnings],
      reasons: capabilities.reasons
    });
    const publicIntent = toPublicIntent(intent);
    let executionIntentReceiptId: string | null = null;
    if (this.receiptService) {
      if (!stored.userConfirmationReceiptId && this.requireExecutionReceipt) {
        throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 412, message: "User confirmation receipt is required before creating an execution intent." });
      }
      const receipt = await this.receiptService.appendExecutionIntentReceipt({
        workflow: stored,
        intent: publicIntent,
        capabilities,
        userConfirmationReceiptId: stored.userConfirmationReceiptId ?? "",
        serverHardLimits: this.serverHardLimits()
      });
      executionIntentReceiptId = receipt.receiptId;
      this.store.attachReceipt(intent.intentId, "executionIntent", receipt.receiptId);
    } else if (this.requireExecutionReceipt) {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 503, message: "Execution intent receipt is required but receipt service is unavailable." });
    }
    return { intent: toPublicIntent(intent), capabilities, executionIntentReceiptId };
  }

  getIntent(intentId: string): PublicExecutionIntent {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw new PerplApiError({ code: "PERPL_TRADING_INTENT_NOT_FOUND", statusCode: 404, message: "Execution intent was not found." });
    return toPublicIntent(intent);
  }

  async executeIntent(intentId: string, body: unknown): Promise<PublicExecutionIntent> {
    const parsed = assertExecuteBody(body);
    const intent = this.store.getIntent(intentId);
    if (!intent) throw new PerplApiError({ code: "PERPL_TRADING_INTENT_NOT_FOUND", statusCode: 404, message: "Execution intent was not found." });
    if (intent.status !== "prepared") {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 409, message: `Execution intent is ${intent.status}.` });
    }
    if (intent.planHash !== parsed.planHash || intent.idempotencyKey !== parsed.idempotencyKey) {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 409, message: "Execution confirmation does not match the prepared intent." });
    }

    const capabilities = await this.getCapabilities();
    assertIntentCanBeSubmitted(intent, this.config, capabilities);
    if (this.requireExecutionReceipt && (!intent.executionIntentReceiptId || !this.store.getWorkflow(intent.workflowId)?.userConfirmationReceiptId)) {
      throw new PerplApiError({ code: "PERPL_TRADING_VALIDATION_FAILED", statusCode: 412, message: "Execution receipts are required before order submission." });
    }
    this.store.consume(intentId);
    const result = await this.client.submitOrder(intent.preview.orderSpec);
    const updated = this.store.updateResult(intentId, result, result.status === "accepted" ? "accepted" : "rejected");
    if (this.receiptService && updated) {
      const publicIntent = toPublicIntent(updated);
      if (result.status === "accepted" || result.status === "rejected") {
        const submission = await this.receiptService.appendOrderSubmissionReceipt({ intent: publicIntent, result, parentReceiptId: updated.executionIntentReceiptId ?? "" });
        this.store.attachReceipt(intentId, "submission", submission.receiptId);
        if (result.status === "rejected") {
          const finalized = await this.receiptService.appendOrderFinalizedReceipt({ intent: toPublicIntent(updated), parentReceiptId: submission.receiptId, finalStatus: "rejected", result });
          this.store.attachReceipt(intentId, "finalized", finalized.receiptId);
        }
      } else {
        const update = await this.receiptService.appendOrderUpdateReceipt({ intent: publicIntent, parentReceiptId: updated.executionIntentReceiptId ?? "", previousStatus: "submitted", currentStatus: "unknown", result });
        this.store.attachReceipt(intentId, "update", update.receiptId);
      }
    }
    return this.getIntent(intentId);
  }

  async reconcileIntent(intentId: string): Promise<PublicExecutionIntent> {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw new PerplApiError({ code: "PERPL_TRADING_INTENT_NOT_FOUND", statusCode: 404, message: "Execution intent was not found." });
    if (!intent.perplResult) return toPublicIntent(intent);
    this.store.updateResult(intentId, intent.perplResult, "reconciled");
    if (this.receiptService) {
      const updated = this.store.getIntent(intentId)!;
      const reconciliation = await this.receiptService.appendReconciliationReceipt({
        intent: toPublicIntent(updated),
        parentReceiptId: updated.orderUpdateReceiptId ?? updated.orderSubmissionReceiptId ?? updated.executionIntentReceiptId ?? "",
        previousUnknownReceiptId: updated.orderUpdateReceiptId,
        status: updated.perplResult?.status ?? "unknown"
      });
      this.store.attachReceipt(intentId, "reconciliation", reconciliation.receiptId);
    }
    return this.getIntent(intentId);
  }

  private serverHardLimits() {
    return {
      tradingEnabled: this.config.enabled,
      allowedMarketIds: this.config.allowedMarketIds,
      maxOrderNotionalUsd: this.config.maxOrderNotionalUsd,
      maxLeverage: this.config.maxLeverage,
      maxSlippageBps: this.config.maxSlippageBps,
      requireExecutionReceipt: this.requireExecutionReceipt
    };
  }
}

export function workflowFingerprint(response: PerplAgentWorkflowResponse): string {
  return createHash("sha256").update(JSON.stringify({
    riskCalculatedAt: response.riskSnapshot.calculatedAt,
    score: response.riskSnapshot.score,
    riskLevel: response.riskSnapshot.riskLevel,
    positions: response.riskSnapshot.positions.map((position) => ({
      positionId: position.positionId,
      size: position.size,
      notional: position.notional,
      leverage: position.leverage
    })),
    orders: response.riskSnapshot.walletMetrics.openOrderCount
  })).digest("hex");
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}
