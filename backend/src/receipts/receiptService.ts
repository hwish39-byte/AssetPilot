import { computeReceiptHash } from "./hashing.js";
import { assertNoSensitiveFields, redactForReceipt } from "./redaction.js";
import { ReceiptStore } from "./receiptStore.js";
import { loadReceiptSigningConfig, signReceiptHash, verifyReceiptSignature, type ReceiptSigningConfig } from "./signing.js";
import {
  baseReceipt,
  buildRiskReviewReceipt,
  intentProvenance,
  policySummary,
  provenanceFromWorkflow,
  workflowPlanHash
} from "./receiptBuilder.js";
import type { PerplAgentWorkflowRequest, PerplAgentWorkflowResponse } from "../agents/perpl/types.js";
import type { PublicExecutionIntent, TradingCapabilities, PerplOrderSubmissionResult } from "../perpl/trading/types.js";
import type {
  ChainVerificationResult,
  PerplReceipt,
  ReceiptListQuery,
  ReceiptListResponse,
  ReceiptVerificationResult
} from "./types.js";

export interface ReceiptServiceOptions {
  store?: ReceiptStore;
  signing?: ReceiptSigningConfig;
  nowMs?: () => number;
}

export class ReceiptService {
  private readonly store: ReceiptStore;
  private readonly signing: ReceiptSigningConfig;
  private readonly nowMs: () => number;

  constructor(options: ReceiptServiceOptions = {}) {
    this.store = options.store ?? new ReceiptStore();
    this.signing = options.signing ?? loadReceiptSigningConfig();
    this.nowMs = options.nowMs ?? Date.now;
  }

  getSigningStatus() {
    return { enabled: this.signing.enabled, keyId: this.signing.keyId ?? null, publicKeyConfigured: Boolean(this.signing.publicKey) };
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async appendRiskReviewReceipt(request: PerplAgentWorkflowRequest, response: PerplAgentWorkflowResponse, serverHardLimits: Record<string, string | number | boolean | number[] | null> = {}): Promise<PerplReceipt> {
    const receipt = buildRiskReviewReceipt({
      base: await this.nextBase(response.workflowId, null, provenanceFromWorkflow(response)),
      request,
      response,
      serverHardLimits
    });
    return this.finalizeAndAppend(receipt);
  }

  async appendUserConfirmationReceipt(args: {
    workflow: { request: PerplAgentWorkflowRequest; response: PerplAgentWorkflowResponse };
    riskReviewReceiptId: string;
    planHash: string;
  }): Promise<PerplReceipt> {
    const receipt: PerplReceipt = {
      ...(await this.nextBase(args.workflow.response.workflowId, args.riskReviewReceiptId, provenanceFromWorkflow(args.workflow.response))),
      receiptType: "user_confirmation",
      userConfirmedAt: new Date(this.nowMs()).toISOString(),
      planHash: args.planHash,
      riskReviewReceiptId: args.riskReviewReceiptId,
      confirmationScope: "approved_agent_execution_plan",
      confirmationSource: "assetpilot_trade_guard",
      policyExpiry: args.workflow.request.policy.expiresAt,
      noOrderSubmitted: true
    };
    return this.finalizeAndAppend(receipt);
  }

  async appendExecutionIntentReceipt(args: {
    workflow: { request: PerplAgentWorkflowRequest; response: PerplAgentWorkflowResponse };
    intent: PublicExecutionIntent;
    capabilities: TradingCapabilities;
    userConfirmationReceiptId: string;
    serverHardLimits: Record<string, string | number | boolean | number[] | null>;
  }): Promise<PerplReceipt> {
    const receipt: PerplReceipt = {
      ...(await this.nextBase(args.intent.workflowId, args.userConfirmationReceiptId, intentProvenance(args.intent, args.capabilities))),
      receiptType: "execution_intent",
      intentId: args.intent.intentId,
      intentExpiry: args.intent.expiresAt,
      planHash: args.intent.planHash,
      approvedAction: args.intent.preview.actionType === "cancel_order"
        ? { actionId: args.intent.preview.actionId, type: "cancel_order", rationale: "", expectedEffects: [], targetAccountId: args.intent.preview.accountId, confidence: 1, assumptions: [], orderId: String(args.intent.preview.orderSpec.oid ?? "") }
        : args.workflow.response.strategy.actions.find((action) => action.actionId === args.intent.preview.actionId)!,
      preview: args.intent.preview,
      policy: policySummary(args.workflow.request, args.serverHardLimits),
      validation: {
        preSubmissionValidationResults: args.intent.reasons.length ? args.intent.reasons : ["prepared"],
        orderForwardingEnabled: args.capabilities.wallet.forwardingEnabled,
        accountFrozen: args.capabilities.wallet.frozen,
        tradingEnabled: args.capabilities.tradingEnabled,
        userConfirmationReceiptId: args.userConfirmationReceiptId
      }
    };
    return this.finalizeAndAppend(receipt);
  }

  async appendOrderSubmissionReceipt(args: { intent: PublicExecutionIntent; result: PerplOrderSubmissionResult; parentReceiptId: string }): Promise<PerplReceipt> {
    const receipt: PerplReceipt = {
      ...(await this.nextBase(args.intent.workflowId, args.parentReceiptId, intentProvenance(args.intent, emptyCapabilities()))),
      receiptType: "order_submission",
      requestId: args.result.requestId,
      orderId: args.result.orderId,
      submittedAt: args.result.receivedAt,
      actionType: args.intent.preview.actionType,
      marketId: args.intent.preview.marketId,
      accountId: args.intent.preview.accountId,
      executionTransport: "perpl-trading-websocket",
      orderStatus: args.result.status,
      reduceOnly: args.intent.preview.reduceOnly,
      size: args.intent.preview.size,
      protectedPrice: args.intent.preview.worstAcceptablePrice,
      maxSlippageBps: args.intent.preview.maxSlippageBps,
      planHash: args.intent.planHash,
      acknowledgement: args.result
    };
    return this.finalizeAndAppend(receipt);
  }

  async appendOrderUpdateReceipt(args: { intent: PublicExecutionIntent; parentReceiptId: string; previousStatus: string | null; currentStatus: string; result?: PerplOrderSubmissionResult | null }): Promise<PerplReceipt> {
    const receipt: PerplReceipt = {
      ...(await this.nextBase(args.intent.workflowId, args.parentReceiptId, intentProvenance(args.intent, emptyCapabilities()))),
      receiptType: "order_update",
      orderId: args.result?.orderId ?? args.intent.perplResult?.orderId ?? null,
      requestId: args.result?.requestId ?? args.intent.preview.requestId,
      previousStatus: args.previousStatus,
      currentStatus: args.currentStatus,
      filledSize: null,
      remainingSize: null,
      averageFillPrice: null,
      fees: null,
      updatedAt: args.result?.receivedAt ?? new Date(this.nowMs()).toISOString()
    };
    return this.finalizeAndAppend(receipt);
  }

  async appendOrderFinalizedReceipt(args: { intent: PublicExecutionIntent; parentReceiptId: string; finalStatus: string; result?: PerplOrderSubmissionResult | null }): Promise<PerplReceipt> {
    const receipt: PerplReceipt = {
      ...(await this.nextBase(args.intent.workflowId, args.parentReceiptId, intentProvenance(args.intent, emptyCapabilities()))),
      receiptType: "order_finalized",
      finalStatus: args.finalStatus,
      requestId: args.result?.requestId ?? args.intent.preview.requestId,
      orderId: args.result?.orderId ?? null,
      totalFilledSize: null,
      averageFillPrice: null,
      totalFees: null,
      realizedPnl: null,
      finalPositionSummary: null,
      finalizedAt: args.result?.receivedAt ?? new Date(this.nowMs()).toISOString()
    };
    return this.finalizeAndAppend(receipt);
  }

  async appendReconciliationReceipt(args: { intent: PublicExecutionIntent; parentReceiptId: string; previousUnknownReceiptId: string | null; status: string }): Promise<PerplReceipt> {
    const receipt: PerplReceipt = {
      ...(await this.nextBase(args.intent.workflowId, args.parentReceiptId, intentProvenance(args.intent, emptyCapabilities()))),
      receiptType: "reconciliation",
      previousUnknownReceiptId: args.previousUnknownReceiptId,
      dataSourcesChecked: ["perpl-rest-orders", "perpl-rest-order-history", "perpl-rest-fills", "perpl-rest-positions"],
      reconciledStatus: args.status,
      matchedRequestId: args.intent.preview.requestId,
      matchedOrderId: args.intent.perplResult?.orderId ?? null,
      matchedFillIds: [],
      reconciledAt: new Date(this.nowMs()).toISOString()
    };
    return this.finalizeAndAppend(receipt);
  }

  getReceipt(receiptId: string): PerplReceipt | null {
    return this.store.get(receiptId);
  }

  listReceipts(query: ReceiptListQuery): ReceiptListResponse {
    return this.store.list(query);
  }

  async verifyReceipt(receiptId: string): Promise<ReceiptVerificationResult> {
    const receipt = this.store.get(receiptId);
    if (!receipt) {
      return { receiptHashValid: false, chainLinkValid: false, parentValid: false, signaturePresent: false, signatureValid: null, onchainAnchored: false, verificationErrors: ["Receipt not found."] };
    }
    const all = this.store.all();
    const index = all.findIndex((item) => item.receiptId === receiptId);
    const previous = all[index - 1] ?? null;
    const parent = receipt.parentReceiptId ? this.store.get(receipt.parentReceiptId) : null;
    const receiptHashValid = computeReceiptHash(receipt) === receipt.receiptHash;
    const chainLinkValid = index === 0 ? receipt.previousReceiptHash === null : receipt.previousReceiptHash === previous?.receiptHash;
    const parentValid = !receipt.parentReceiptId || Boolean(parent);
    const signatureValid = await verifyReceiptSignature(receipt.receiptHash, receipt.signature, this.signing);
    const verificationErrors = [
      ...(receiptHashValid ? [] : ["receipt hash mismatch"]),
      ...(chainLinkValid ? [] : ["chain link mismatch"]),
      ...(parentValid ? [] : ["parent receipt missing"]),
      ...(signatureValid === false ? ["signature invalid"] : [])
    ];
    return {
      receiptHashValid,
      chainLinkValid,
      parentValid,
      signaturePresent: Boolean(receipt.signature),
      signatureValid,
      onchainAnchored: false,
      verificationErrors
    };
  }

  verifyChain(): ChainVerificationResult {
    return this.store.verifyChain();
  }

  exportReceipt(receiptId: string): PerplReceipt | null {
    return this.store.get(receiptId);
  }

  private async nextBase(workflowId: string, parentReceiptId: string | null, provenance: ReturnType<typeof provenanceFromWorkflow>) {
    await this.store.initialize();
    const latest = this.store.latest();
    return baseReceipt({
      sequenceNumber: (latest?.sequenceNumber ?? 0) + 1,
      createdAt: new Date(this.nowMs()).toISOString(),
      workflowId,
      parentReceiptId,
      previousReceiptHash: latest?.receiptHash ?? null,
      dataProvenance: provenance
    });
  }

  private async finalizeAndAppend(receipt: PerplReceipt): Promise<PerplReceipt> {
    const redacted = redactForReceipt(receipt);
    assertNoSensitiveFields(redacted);
    redacted.receiptHash = computeReceiptHash(redacted);
    const signed = await signReceiptHash(redacted.receiptHash, this.signing);
    redacted.signature = signed.signature;
    redacted.signingKeyId = signed.signingKeyId;
    return this.store.append(redacted);
  }
}

function emptyCapabilities(): TradingCapabilities {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: new Date(0).toISOString(),
    tradingEnabled: false,
    credentialsConfigured: false,
    readonlyKeyConfigured: false,
    testnetOnly: true,
    canPrepareIntent: false,
    canSubmitOrder: false,
    allowedMarketIds: [],
    allowedActions: ["reduce_position", "close_position", "cancel_order"],
    limits: { maxOrderNotionalUsd: "0", maxLeverage: 0, maxSlippageBps: 0, intentTtlSeconds: 0, cooldownSeconds: 0 },
    wallet: { address: null, forwardingEnabled: null, frozen: null, accounts: [] },
    reasons: [],
    warnings: []
  };
}

export { workflowPlanHash };
