import { randomBytes, createHash } from "node:crypto";
import type {
  ExecutionIntent,
  ExactOrderPreview,
  PerplOrderSubmissionResult,
  PublicExecutionIntent,
  StoredWorkflow,
  TradingIntentStatus
} from "./types.js";
import type { PerplAgentAction, PerplAgentWorkflowRequest, PerplAgentWorkflowResponse } from "../../agents/perpl/types.js";

export interface ExecutionIntentStoreOptions {
  nowMs?: () => number;
  ttlMs?: number;
  idGenerator?: () => string;
}

export class ExecutionIntentStore {
  private readonly workflows = new Map<string, StoredWorkflow>();
  private readonly intents = new Map<string, ExecutionIntent>();
  private readonly nowMs: () => number;
  private readonly ttlMs: number;
  private readonly idGenerator: () => string;

  constructor(options: ExecutionIntentStoreOptions = {}) {
    this.nowMs = options.nowMs ?? Date.now;
    this.ttlMs = options.ttlMs ?? 180_000;
    this.idGenerator = options.idGenerator ?? (() => randomBytes(24).toString("base64url"));
  }

  recordWorkflow(request: PerplAgentWorkflowRequest, response: PerplAgentWorkflowResponse, riskReviewReceiptId: string | null = null): void {
    const existing = this.workflows.get(response.workflowId);
    this.workflows.set(response.workflowId, {
      request,
      response,
      recordedAt: existing?.recordedAt ?? new Date(this.nowMs()).toISOString(),
      riskReviewReceiptId,
      userConfirmationReceiptId: existing?.userConfirmationReceiptId ?? null,
      confirmedAt: existing?.confirmedAt ?? null
    });
  }

  getWorkflow(workflowId: string): StoredWorkflow | null {
    return this.workflows.get(workflowId) ?? null;
  }

  confirmWorkflow(workflowId: string, receiptId: string): StoredWorkflow | null {
    const stored = this.workflows.get(workflowId) ?? null;
    if (!stored) return null;
    stored.userConfirmationReceiptId = receiptId;
    stored.confirmedAt = new Date(this.nowMs()).toISOString();
    return stored;
  }

  createIntent(args: {
    workflowId: string;
    preview: ExactOrderPreview;
    approvedAction: PerplAgentAction;
    riskFingerprint: string;
    warnings: string[];
    reasons?: string[];
  }): ExecutionIntent {
    const createdAtMs = this.nowMs();
    const intent: ExecutionIntent = {
      intentId: `perpl_intent_${this.idGenerator()}`,
      workflowId: args.workflowId,
      status: "prepared",
      source: "assetpilot",
      protocol: "perpl",
      network: "monad-testnet",
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.ttlMs).toISOString(),
      consumedAt: null,
      planHash: hashPlan(args.preview),
      riskFingerprint: args.riskFingerprint,
      idempotencyKey: `perpl_exec_${this.idGenerator()}`,
      preview: args.preview,
      approvedAction: args.approvedAction,
      perplResult: null,
      reasons: args.reasons ?? [],
      warnings: args.warnings,
      executionIntentReceiptId: null,
      orderSubmissionReceiptId: null,
      orderUpdateReceiptId: null,
      orderFinalizedReceiptId: null,
      reconciliationReceiptId: null
    };
    this.intents.set(intent.intentId, intent);
    return intent;
  }

  getIntent(intentId: string): ExecutionIntent | null {
    const intent = this.intents.get(intentId) ?? null;
    if (!intent) return null;
    if (new Date(intent.expiresAt).getTime() <= this.nowMs() && intent.status === "prepared") {
      intent.status = "expired";
    }
    return intent;
  }

  consume(intentId: string): ExecutionIntent | null {
    const intent = this.getIntent(intentId);
    if (!intent || intent.status !== "prepared") return intent;
    intent.consumedAt = new Date(this.nowMs()).toISOString();
    intent.status = "submitted";
    return intent;
  }

  updateResult(intentId: string, result: PerplOrderSubmissionResult, status: TradingIntentStatus): ExecutionIntent | null {
    const intent = this.intents.get(intentId) ?? null;
    if (!intent) return null;
    intent.perplResult = result;
    intent.status = status;
    return intent;
  }

  attachReceipt(intentId: string, kind: "executionIntent" | "submission" | "update" | "finalized" | "reconciliation", receiptId: string): ExecutionIntent | null {
    const intent = this.intents.get(intentId) ?? null;
    if (!intent) return null;
    if (kind === "executionIntent") intent.executionIntentReceiptId = receiptId;
    if (kind === "submission") intent.orderSubmissionReceiptId = receiptId;
    if (kind === "update") intent.orderUpdateReceiptId = receiptId;
    if (kind === "finalized") intent.orderFinalizedReceiptId = receiptId;
    if (kind === "reconciliation") intent.reconciliationReceiptId = receiptId;
    return intent;
  }
}

export function toPublicIntent(intent: ExecutionIntent): PublicExecutionIntent {
  return {
    intentId: intent.intentId,
    workflowId: intent.workflowId,
    status: intent.status,
    source: intent.source,
    protocol: intent.protocol,
    network: intent.network,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
    planHash: intent.planHash,
    riskFingerprint: intent.riskFingerprint,
    idempotencyKey: intent.idempotencyKey,
    preview: intent.preview,
    perplResult: intent.perplResult,
    reasons: intent.reasons,
    warnings: intent.warnings,
    executionIntentReceiptId: intent.executionIntentReceiptId,
    orderSubmissionReceiptId: intent.orderSubmissionReceiptId,
    orderUpdateReceiptId: intent.orderUpdateReceiptId,
    orderFinalizedReceiptId: intent.orderFinalizedReceiptId,
    reconciliationReceiptId: intent.reconciliationReceiptId
  };
}

export function hashPlan(preview: ExactOrderPreview): string {
  return createHash("sha256").update(JSON.stringify(preview)).digest("hex");
}
