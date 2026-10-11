"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Send, ShieldCheck } from "lucide-react";
import { ApiError, confirmPerplWorkflow, createPerplExecutionIntent, executePerplExecutionIntent, reconcilePerplExecutionIntent } from "@/lib/api";
import type { PerplAgentWorkflowResponse, PerplCreateExecutionIntentResponse, PerplExecutionIntent, PerplTradingCapabilities, PerplWorkflowConfirmation } from "@/types/perpl";
import type { LocalConfirmation } from "./tradeGuardUtils";

interface TestnetExecutionPanelProps {
  result: PerplAgentWorkflowResponse;
  confirmation: LocalConfirmation | null;
  capabilities: PerplTradingCapabilities | undefined;
}

export function TestnetExecutionPanel({ result, confirmation, capabilities }: TestnetExecutionPanelProps) {
  const [intentResponse, setIntentResponse] = useState<PerplCreateExecutionIntentResponse | null>(null);
  const [serverConfirmation, setServerConfirmation] = useState<PerplWorkflowConfirmation | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intent = intentResponse?.intent ?? null;
  const disabledReason = !confirmation
    ? "Local dry-run confirmation is required first."
    : !capabilities?.canPrepareIntent
      ? "Read-only Perpl credentials are required to prepare an execution intent."
      : null;

  async function prepareIntent() {
    setBusy(true);
    setError(null);
    try {
      const planHash = result.auditStatus?.planHash;
      if (!planHash) throw new Error("Workflow plan hash is unavailable.");
      const confirmed = serverConfirmation ?? await confirmPerplWorkflow(result.workflowId, planHash);
      setServerConfirmation(confirmed);
      setIntentResponse(await createPerplExecutionIntent(result.workflowId));
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function executeIntent() {
    if (!intent) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await executePerplExecutionIntent(intent, confirmationText);
      setIntentResponse((current) => current ? { ...current, intent: updated } : { intent: updated, capabilities: capabilities!, executionIntentReceiptId: updated.executionIntentReceiptId ?? null });
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!intent) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await reconcilePerplExecutionIntent(intent.intentId);
      setIntentResponse((current) => current ? { ...current, intent: updated } : current);
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Testnet execution</h2>
          <p className="mt-1 text-sm text-slate-600">Real Perpl Testnet submission is server-gated, reduce-only, and disabled unless trade credentials are explicitly configured.</p>
        </div>
        <span className={`inline-flex items-center gap-1 border px-2 py-1 text-xs font-semibold ${capabilities?.canSubmitOrder ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {capabilities?.canSubmitOrder ? "Ready" : "Locked"}
        </span>
      </div>

      {capabilities?.reasons.length ? (
        <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <p>{capabilities.reasons.join(" ")}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={prepareIntent}
          disabled={busy || !!disabledReason}
          className="inline-flex min-h-10 items-center gap-2 border border-cyan-700 bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
          title={disabledReason ?? "Prepare exact Perpl testnet order preview"}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Prepare intent
        </button>
        {disabledReason ? <p className="self-center text-sm text-slate-500">{disabledReason}</p> : null}
      </div>

      {result.auditStatus ? (
        <div className="mt-3 text-sm text-slate-600">
          Audit: {result.auditStatus.status === "saved" ? "Risk receipt saved" : "Risk receipt failed"}
          {result.auditStatus.riskReviewReceiptId ? ` (${result.auditStatus.riskReviewReceiptId})` : null}
        </div>
      ) : null}
      {serverConfirmation?.userConfirmationReceiptId ? <p className="mt-2 text-sm text-slate-600">User confirmation receipt: {serverConfirmation.userConfirmationReceiptId}</p> : null}
      {intentResponse?.executionIntentReceiptId ? <p className="mt-2 text-sm text-slate-600">Execution intent receipt: {intentResponse.executionIntentReceiptId}</p> : null}

      {intent ? <IntentDetails intent={intent} /> : null}

      {intent ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <label className="block text-sm font-semibold text-slate-700" htmlFor="perpl-confirmation-text">Type SUBMIT TESTNET ORDER</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="perpl-confirmation-text"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              className="min-h-10 min-w-0 flex-1 border border-slate-300 px-3 text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={executeIntent}
              disabled={busy || !capabilities?.canSubmitOrder || confirmationText !== "SUBMIT TESTNET ORDER" || intent.status !== "prepared"}
              className="inline-flex min-h-10 items-center gap-2 border border-rose-700 bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Submit testnet order
            </button>
            <button type="button" onClick={reconcile} disabled={busy || !intent.perplResult} className="min-h-10 border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              Reconcile
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}

function IntentDetails({ intent }: { intent: PerplExecutionIntent }) {
  return (
    <div className="mt-4 grid gap-3 border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
      <div>
        <p className="font-semibold text-slate-950">{intent.preview.humanReadable}</p>
        <p className="mt-1">Status: {intent.status}</p>
        <p>Intent expires: {new Date(intent.expiresAt).toLocaleString()}</p>
      </div>
      <div>
        <p>Request ID: {intent.preview.requestId}</p>
        <p>Size: {intent.preview.size}</p>
        <p>Notional estimate: {intent.preview.notionalUsdEstimate ?? "n/a"}</p>
        <p>Worst price: {intent.preview.worstAcceptablePrice ?? "n/a"}</p>
      </div>
      {intent.perplResult ? (
        <p className="flex items-center gap-2 md:col-span-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          {intent.perplResult.message}
        </p>
      ) : null}
    </div>
  );
}

function formatError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code ?? error.status}: ${error.message}`;
  return error instanceof Error ? error.message : "Execution request failed.";
}
