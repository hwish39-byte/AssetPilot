import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import * as ed from "@noble/ed25519";
import { canonicalJson } from "./canonicalJson.js";
import { computeReceiptHash, stableHash } from "./hashing.js";
import { ReceiptService } from "./receiptService.js";
import { ReceiptStore, verifyReceiptArray } from "./receiptStore.js";
import { redactForReceipt } from "./redaction.js";
import { signReceiptHash, verifyReceiptSignature } from "./signing.js";
import type { PerplReceipt, RiskReviewReceipt } from "./types.js";
import { createApp } from "../server.js";
import type { PerplAgentWorkflowRequest, PerplAgentWorkflowResponse } from "../agents/perpl/types.js";
import type { PublicExecutionIntent, TradingCapabilities } from "../perpl/trading/types.js";

test("canonical JSON is stable for object keys, preserves arrays/null/unicode, and rejects unsafe values", () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }));
  assert.equal(canonicalJson({ a: null, text: "风险" }), '{"a":null,"text":"风险"}');
  assert.throws(() => canonicalJson({ a: undefined }));
  assert.throws(() => canonicalJson({ a: Number.NaN }));
  assert.throws(() => canonicalJson({ a: Infinity }));
});

test("receipt hash excludes receiptHash/signature but includes previous hash and protected fields", () => {
  const receipt = finalizedReceipt(1, null, null);
  const sameWithDifferentSignature = { ...receipt, signature: "changed" };
  assert.equal(computeReceiptHash(receipt), computeReceiptHash(sameWithDifferentSignature));
  assert.equal(computeReceiptHash({ ...receipt, receiptHash: "0xabc" }), computeReceiptHash(receipt));
  assert.notEqual(computeReceiptHash({ ...receipt, previousReceiptHash: "0xprev" }), computeReceiptHash(receipt));
  assert.notEqual(computeReceiptHash({ ...receipt, risk: { ...receipt.risk, riskScore: 99 } }), computeReceiptHash(receipt));
  assert.notEqual(computeReceiptHash({ ...receipt, policy: { ...receipt.policy, failedChecks: ["max_slippage"] } }), computeReceiptHash(receipt));
  assert.notEqual(computeReceiptHash({ ...receipt, riskDecision: { ...receipt.riskDecision, decision: "reject" } }), computeReceiptHash(receipt));
});

test("receipt store appends, rebuilds index, paginates, filters, and fails closed on corruption", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetpilot-receipts-"));
  const path = join(dir, "receipts.jsonl");
  const store = new ReceiptStore({ path });
  await store.initialize();
  const first = await store.append(finalizedReceipt(1, null, null));
  const second = await store.append(finalizedReceipt(2, first.receiptHash, first.receiptId, "user_confirmation"));

  const restarted = new ReceiptStore({ path });
  await restarted.initialize();
  assert.equal(restarted.get(first.receiptId)?.receiptHash, first.receiptHash);
  assert.equal(restarted.verifyChain().valid, true);
  assert.equal(restarted.list({ limit: 1 }).data[0]?.receiptId, second.receiptId);
  assert.equal(restarted.list({ type: "risk_review" }).data.length, 1);

  await writeFile(path, `${JSON.stringify(first)}\nnot-json\n`);
  await assert.rejects(new ReceiptStore({ path }).initialize(), /Malformed/);
});

test("hash chain detects tampering, deletion, reordering, and missing parents", () => {
  const first = finalizedReceipt(1, null, null);
  const second = finalizedReceipt(2, first.receiptHash, first.receiptId, "user_confirmation");
  const good = new ReceiptStore({ path: join(tmpdir(), "unused.jsonl") });
  assert.equal(good.constructor.name, "ReceiptStore");
  assert.equal(verifyReceiptArray([first, second]).valid, true);
  assert.equal(verifyReceiptArray([{ ...first, risk: { ...first.risk, riskScore: 9 } }, second]).valid, false);
  assert.equal(verifyReceiptArray([second]).valid, false);
  assert.equal(verifyReceiptArray([second, first]).valid, false);
  assert.equal(verifyReceiptArray([finalizedReceipt(1, null, "missing")]).valid, false);
});

test("redaction removes nested sensitive fields and signing uses an independent key", async () => {
  const redacted = redactForReceipt({ nested: { apiKey: "key", privateKey: "private", canonical: "request", authPayload: { secret: "s" } } });
  assert.deepEqual(redacted, { nested: { apiKey: "[redacted]", privateKey: "[redacted]", canonical: "[redacted]", authPayload: "[redacted]" } });

  const privateKey = "04".repeat(32);
  const publicKey = Buffer.from(await ed.getPublicKey(Buffer.from(privateKey, "hex"))).toString("hex");
  const signed = await signReceiptHash("0xabc", { enabled: true, privateKey, publicKey, keyId: "receipt-key" });
  assert.equal(signed.signingKeyId, "receipt-key");
  assert.equal(await verifyReceiptSignature("0xabc", signed.signature, { enabled: true, publicKey, keyId: "receipt-key" }), true);
  assert.equal(await verifyReceiptSignature("0xdef", signed.signature, { enabled: true, publicKey, keyId: "receipt-key" }), false);
  assert.deepEqual(await signReceiptHash("0xabc", { enabled: false }), { signature: null, signingKeyId: null });
});

test("receipt API lists, returns detail, verifies, exports, paginates, filters, and 404s unknown ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetpilot-receipts-api-"));
  const store = new ReceiptStore({ path: join(dir, "receipts.jsonl") });
  await store.initialize();
  const first = await store.append(finalizedReceipt(1, null, null));
  await store.append(finalizedReceipt(2, first.receiptHash, first.receiptId, "user_confirmation"));
  const service = new ReceiptService({ store });
  const app = createApp({ receiptService: service });

  assert.equal((await dispatch(app, "GET", "/api/perpl/receipts?limit=1")).status, 200);
  assert.match((await dispatch(app, "GET", "/api/perpl/receipts?type=risk_review")).body, /risk_review/);
  assert.equal((await dispatch(app, "GET", `/api/perpl/receipts/${first.receiptId}`)).status, 200);
  assert.match((await dispatch(app, "GET", `/api/perpl/receipts/${first.receiptId}/verify`)).body, /receiptHashValid/);
  assert.match((await dispatch(app, "GET", "/api/perpl/receipts/verify-chain")).body, /receiptCount/);
  assert.match((await dispatch(app, "GET", `/api/perpl/receipts/${first.receiptId}/export`)).body, /receiptHash/);
  assert.equal((await dispatch(app, "GET", "/api/perpl/receipts/missing")).status, 404);
});

test("receipt service records approve, revise, reject, confirmation, intent, unknown update, and reconciliation append-only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetpilot-receipts-flow-"));
  const service = new ReceiptService({ store: new ReceiptStore({ path: join(dir, "receipts.jsonl") }) });
  const approve = workflow("approve");
  const revise = workflow("revise");
  const reject = workflow("reject");

  const approveReceipt = await service.appendRiskReviewReceipt(approve.request, approve.response);
  await service.appendRiskReviewReceipt(revise.request, revise.response);
  await service.appendRiskReviewReceipt(reject.request, reject.response);
  const confirmation = await service.appendUserConfirmationReceipt({
    workflow: approve,
    riskReviewReceiptId: approveReceipt.receiptId,
    planHash: "0x" + "a".repeat(64)
  });
  const intentReceipt = await service.appendExecutionIntentReceipt({
    workflow: approve,
    intent: publicIntent(),
    capabilities: capabilities(),
    userConfirmationReceiptId: confirmation.receiptId,
    serverHardLimits: { requireExecutionReceipt: true }
  });
  const update = await service.appendOrderUpdateReceipt({
    intent: publicIntent(),
    parentReceiptId: intentReceipt.receiptId,
    previousStatus: "submitted",
    currentStatus: "unknown",
    result: { status: "timeout", requestId: 42, orderId: null, perplStatus: null, perplStatusReason: null, message: "unknown", receivedAt: "2026-10-11T00:00:10.000Z" }
  });
  const reconciliation = await service.appendReconciliationReceipt({
    intent: publicIntent({ perplResult: { status: "accepted", requestId: 42, orderId: "77", perplStatus: 2, perplStatusReason: 0, message: "matched", receivedAt: "2026-10-11T00:00:11.000Z" } }),
    parentReceiptId: update.receiptId,
    previousUnknownReceiptId: update.receiptId,
    status: "accepted"
  });

  const listed = service.listReceipts({ limit: 20 }).data;
  assert.deepEqual(listed.filter((receipt) => receipt.receiptType === "risk_review").map((receipt) => receipt.receiptType), ["risk_review", "risk_review", "risk_review"]);
  assert.equal(service.verifyChain().valid, true);
  assert.equal(service.getReceipt(update.receiptId)?.receiptType, "order_update");
  assert.equal(service.getReceipt(reconciliation.receiptId)?.receiptType, "reconciliation");
  assert.notEqual(update.receiptHash, reconciliation.receiptHash);
});

function finalizedReceipt(sequenceNumber: number, previousReceiptHash: string | null, parentReceiptId: string | null, receiptType: "risk_review" | "user_confirmation" = "risk_review"): RiskReviewReceipt {
  const receipt: RiskReviewReceipt = {
    schemaVersion: "assetpilot-perpl-receipt-v1",
    receiptId: `receipt_${sequenceNumber}_${receiptType}`,
    receiptType: "risk_review",
    sequenceNumber,
    createdAt: `2026-10-11T00:00:0${sequenceNumber}.000Z`,
    protocol: "perpl",
    network: "monad-testnet",
    chainId: 10143,
    workflowId: "workflow_1",
    parentReceiptId,
    previousReceiptHash,
    receiptHash: "0x",
    hashAlgorithm: "sha256",
    signature: null,
    signingKeyId: null,
    receiptLayer: "application",
    policyEnforcement: "backend_pre_submission",
    onchainEnforced: false,
    onchainAnchored: false,
    onchainTxHash: null,
    source: "assetpilot",
    dataProvenance: {
      perplNetwork: "monad-testnet",
      perplChainId: 10143,
      dataSources: ["perpl-rest"],
      riskSnapshotFetchedAt: "2026-10-11T00:00:00.000Z",
      marketsFetchedAt: "2026-10-11T00:00:00.000Z",
      walletFetchedAt: "2026-10-11T00:00:00.000Z",
      positionsCount: 1,
      ordersCount: 0,
      historyComplete: true,
      dataFreshness: {},
      warnings: []
    },
    risk: {
      methodologyVersion: "assetpilot-perpl-risk-v1",
      riskScore: 1,
      riskLevel: "low",
      scoreCoveragePercent: 100,
      componentSummaries: [],
      issueCodes: [],
      highestWeightedContributors: []
    },
    strategy: { objective: "test", status: "generated", actionSummaries: [], strategyHash: stableHash({ strategy: 1 }), assumptions: [], clarificationStatus: "none" },
    simulation: { beforeScore: 1, afterScore: 0, scoreDelta: -1, beforeMetricsSummary: {}, afterMetricsSummary: {}, simulationHash: null, changedComponents: [], warnings: [] },
    policy: {
      policyHash: stableHash({ policy: 1 }),
      policySnapshot: {
        allowedAccountIds: [1],
        allowedMarketIds: [1],
        allowedActions: ["reduce_position"],
        maxActionsPerStrategy: 1,
        maxLeverage: 2,
        maxOrderNotionalUsd: "100",
        maxTotalNotionalUsd: "100",
        maxSlippageBps: 50,
        maxReductionPercentage: 100,
        allowIncreaseExposure: false,
        requireSimulation: true,
        requireRiskImprovement: true,
        minimumRiskScoreImprovement: 0,
        expiresAt: "2026-10-11T01:00:00.000Z"
      },
      policyExpiry: "2026-10-11T01:00:00.000Z",
      enforcementLayer: "backend_pre_submission",
      checksPerformed: ["policy_expiry"],
      passedChecks: ["policy_expiry"],
      failedChecks: [],
      serverHardLimits: {}
    },
    riskDecision: { decision: "approve", approvedActionIds: [], rejectedActionIds: [], blockingIssueCodes: [], warningCodes: [], deterministicDecision: true, llmCanOverride: false }
  };
  if (receiptType === "user_confirmation") {
    (receipt as unknown as PerplReceipt).receiptType = "user_confirmation";
    Object.assign(receipt, { userConfirmedAt: receipt.createdAt, planHash: stableHash({ plan: 1 }), riskReviewReceiptId: parentReceiptId ?? "", confirmationScope: "approved_agent_execution_plan", confirmationSource: "assetpilot_trade_guard", policyExpiry: receipt.policy.policyExpiry, noOrderSubmitted: true });
  }
  receipt.receiptHash = computeReceiptHash(receipt);
  return receipt;
}

function workflow(decision: "approve" | "revise" | "reject"): { request: PerplAgentWorkflowRequest; response: PerplAgentWorkflowResponse } {
  const request: PerplAgentWorkflowRequest = {
    userGoal: "test",
    mode: "dry_run",
    policy: finalizedReceipt(1, null, null).policy.policySnapshot,
    preferredLanguage: "en"
  };
  const response: PerplAgentWorkflowResponse = {
    workflowId: `workflow_${decision}`,
    state: decision === "approve" ? "dry_run_prepared" : "rejected",
    startedAt: "2026-10-11T00:00:00.000Z",
    completedAt: "2026-10-11T00:00:01.000Z",
    source: "assetpilot",
    network: "monad-testnet",
    methodologyVersion: "assetpilot-perpl-agent-v1",
    dataFreshness: { riskCalculatedAt: "2026-10-11T00:00:00.000Z", walletFetchedAt: "2026-10-11T00:00:00.000Z", marketFetchedAt: "2026-10-11T00:00:00.000Z" },
    riskSnapshot: {
      source: "assetpilot",
      protocol: "perpl",
      network: "monad-testnet",
      methodologyVersion: "assetpilot-perpl-risk-v1",
      calculatedAt: "2026-10-11T00:00:00.000Z",
      accountIds: [1],
      noExposure: false,
      walletMetrics: { totalBalance: "100", totalLockedBalance: "0", lockedBalanceRatio: null, grossPositionNotional: "10", longNotional: "10", shortNotional: "0", netDirectionalNotional: "10", estimatedUnrealizedPnl: null, balancePlusUnrealizedPnlEstimate: null, effectiveLeverageEstimate: 1, largestPositionShare: 1, openPositionCount: 1, openOrderCount: 0, marketCount: 1, longShortSkew: 1 },
      positions: [],
      performance: { closedPositionCount: 0, winningPositionCount: 0, losingPositionCount: 0, breakEvenPositionCount: 0, winRate: null, grossProfit: "0", grossLoss: "0", realizedPnl: "0", fundingPnl: "0", profitFactor: null, profitFactorUnavailableReason: null, maxDrawdown: null, maxDrawdownPercent: null, currentWinStreak: 0, currentLossStreak: 0, longestWinStreak: 0, longestLossStreak: 0, averageHoldingTimeSeconds: null, bestMarket: null, worstMarket: null, totalFees: "0", totalBuilderFees: "0" },
      score: 1,
      riskLevel: "low",
      scoreCoveragePercent: 100,
      components: [],
      issues: [],
      dataQuality: { stale: false, partialHistory: false, missingFields: [], warnings: [] },
      history: { historyComplete: true, pagesFetched: 1, recordsFetched: 0 }
    },
    analyst: { summary: "ok", riskLevel: "low", riskScore: 1, scoreCoveragePercent: 100, primaryRiskDrivers: [], affectedPositions: [], affectedMarkets: [], dataQualityConcerns: [], recommendedObjectives: [] },
    strategy: { status: "generated", objective: "hold", actions: [{ actionId: "hold", type: "hold", rationale: "safe", expectedEffects: [], targetAccountId: 1, confidence: 1, assumptions: [], reason: "safe" }], expectedRiskDirection: "neutral", assumptions: [], clarificationQuestions: [], validationErrors: [] },
    simulation: { beforeMetrics: { totalBalance: "100", totalLockedBalance: "0", lockedBalanceRatio: null, grossPositionNotional: "10", longNotional: "10", shortNotional: "0", netDirectionalNotional: "10", estimatedUnrealizedPnl: null, balancePlusUnrealizedPnlEstimate: null, effectiveLeverageEstimate: 1, largestPositionShare: 1, openPositionCount: 1, openOrderCount: 0, marketCount: 1, longShortSkew: 1 }, beforeScore: 1, afterMetrics: { totalBalance: "100", totalLockedBalance: "0", lockedBalanceRatio: null, grossPositionNotional: "10", longNotional: "10", shortNotional: "0", netDirectionalNotional: "10", estimatedUnrealizedPnl: null, balancePlusUnrealizedPnlEstimate: null, effectiveLeverageEstimate: 1, largestPositionShare: 1, openPositionCount: 1, openOrderCount: 0, marketCount: 1, longShortSkew: 1 }, afterScore: 1, scoreDelta: 0, changedComponents: [], assumptions: [], warnings: [], actions: [{ type: "hold" }], before: {} as never, after: {} as never },
    riskReview: { decision, riskScoreBefore: 1, riskScoreAfter: 1, scoreDelta: 0, blockingIssues: decision === "reject" ? [{ code: "BLOCKED", severity: "high", message: "blocked" }] : [], warnings: [], approvedActionIds: decision === "approve" ? ["hold"] : [], rejectedActionIds: decision === "approve" ? [] : ["hold"], revisedActions: [], humanReadableSummary: decision },
    execution: { status: decision === "approve" ? "dry_run_prepared" : "blocked", descriptors: [], reason: decision },
    nextUserAction: "",
    warnings: []
  };
  return { request, response };
}

function publicIntent(overrides: Partial<PublicExecutionIntent> = {}): PublicExecutionIntent {
  return {
    intentId: "intent_1",
    workflowId: "workflow_approve",
    status: "prepared",
    source: "assetpilot",
    protocol: "perpl",
    network: "monad-testnet",
    createdAt: "2026-10-11T00:00:00.000Z",
    expiresAt: "2026-10-11T00:03:00.000Z",
    planHash: "0x" + "a".repeat(64),
    riskFingerprint: "0x" + "b".repeat(64),
    idempotencyKey: "perpl_exec_test",
    preview: { actionId: "hold", actionType: "cancel_order", accountId: 1, marketId: 1, marketSymbol: "BTC", requestId: 42, orderSpec: { rq: 42, mkt: 1, acc: 1, oid: 77, t: 5, s: 0, fl: 0, lv: 0, lb: 0 }, reduceOnly: true, expectedSide: "cancel", size: "0", sizeRaw: "0", notionalUsdEstimate: null, markPrice: null, worstAcceptablePrice: null, maxSlippageBps: null, leverage: null, humanReadable: "cancel", warnings: [] },
    perplResult: null,
    reasons: [],
    warnings: [],
    ...overrides
  };
}

function capabilities(): TradingCapabilities {
  return {
    source: "perpl",
    network: "monad-testnet",
    fetchedAt: "2026-10-11T00:00:00.000Z",
    tradingEnabled: false,
    credentialsConfigured: false,
    readonlyKeyConfigured: true,
    testnetOnly: true,
    canPrepareIntent: true,
    canSubmitOrder: false,
    allowedMarketIds: [1],
    allowedActions: ["reduce_position", "close_position", "cancel_order"],
    limits: { maxOrderNotionalUsd: "100", maxLeverage: 2, maxSlippageBps: 50, intentTtlSeconds: 180, cooldownSeconds: 30 },
    wallet: { address: null, forwardingEnabled: true, frozen: false, accounts: [] },
    reasons: [],
    warnings: []
  };
}

async function dispatch(app: ReturnType<typeof createApp>, method: string, url: string): Promise<{ status: number; body: string }> {
  const req = new Readable({ read() {} }) as Readable & { method: string; url: string; headers: Record<string, string> };
  req.method = method;
  req.url = url;
  req.headers = {};
  req.push(null);
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  }) as Writable & { statusCode: number; setHeader: (name: string, value: string | number | string[]) => void; getHeader: (name: string) => string | number | string[] | undefined; removeHeader: (name: string) => void; end: (...args: unknown[]) => typeof res };
  res.statusCode = 200;
  const headers = new Map<string, string | number | string[]>();
  res.setHeader = (name, value) => headers.set(name.toLowerCase(), value);
  res.getHeader = (name) => headers.get(name.toLowerCase());
  res.removeHeader = (name) => headers.delete(name.toLowerCase());
  res.end = (...args: unknown[]) => {
    const chunk = args[0];
    if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    queueMicrotask(() => res.emit("finish"));
    return res;
  };
  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    (app as unknown as { handle: (request: typeof req, response: typeof res, done?: (error?: unknown) => void) => void }).handle(req, res, (error) => error ? reject(error) : resolve());
  });
  return { status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") };
}
