"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
    <Panel
      title="Testnet execution"
      description="Real Perpl Testnet submission is server-gated, reduce-only, and disabled unless trade credentials are explicitly configured."
      actions={
        <StatusBadge tone={capabilities?.canSubmitOrder ? "success" : "neutral"}>
          <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {capabilities?.canSubmitOrder ? "ready" : "locked"}
        </StatusBadge>
      }
    >
      {capabilities?.reasons.length ? (
        <div className="rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-sm text-signal-warn">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <p>{capabilities.reasons.join(" ")}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={prepareIntent} disabled={busy || !!disabledReason} variant="primary" title={disabledReason ?? "Prepare exact Perpl testnet order preview"}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Prepare intent
        </Button>
        {disabledReason ? <p className="self-center text-sm text-terminal-muted">{disabledReason}</p> : null}
      </div>

      <div className="mt-3 space-y-2 text-sm text-terminal-muted">
        {result.auditStatus ? (
          <p>
            Audit: {result.auditStatus.status === "saved" ? "Risk receipt saved" : "Risk receipt failed"}
            {result.auditStatus.riskReviewReceiptId ? ` (${result.auditStatus.riskReviewReceiptId})` : null}
          </p>
        ) : null}
        {serverConfirmation?.userConfirmationReceiptId ? <p>User confirmation receipt: {serverConfirmation.userConfirmationReceiptId}</p> : null}
        {intentResponse?.executionIntentReceiptId ? <p>Execution intent receipt: {intentResponse.executionIntentReceiptId}</p> : null}
      </div>

      {intent ? <IntentDetails intent={intent} /> : null}

      {intent ? (
        <div className="mt-4 border-t border-terminal-line pt-4">
          <label className="block text-sm font-semibold text-terminal-muted" htmlFor="perpl-confirmation-text">Type SUBMIT TESTNET ORDER</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="perpl-confirmation-text"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              className="min-h-10 min-w-0 flex-1 rounded-md border border-terminal-line bg-terminal-raised px-3 text-sm text-terminal-text focus:outline-none focus:ring-2 focus:ring-signal-live"
              autoComplete="off"
            />
            <Button type="button" onClick={executeIntent} disabled={busy || !capabilities?.canSubmitOrder || confirmationText !== "SUBMIT TESTNET ORDER" || intent.status !== "prepared"} variant="danger">
              <Send className="h-4 w-4" aria-hidden="true" />
              Submit testnet order
            </Button>
            <Button type="button" onClick={reconcile} disabled={busy || !intent.perplResult} variant="secondary">
              Reconcile
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-signal-danger">{error}</p> : null}
    </Panel>
  );
}

function IntentDetails({ intent }: { intent: PerplExecutionIntent }) {
  return (
    <div className="mt-4 grid gap-3 rounded-md border border-terminal-line bg-terminal-raised/35 p-3 text-sm text-terminal-muted md:grid-cols-2">
      <div>
        <p className="font-semibold text-terminal-text">{intent.preview.humanReadable}</p>
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
          <CheckCircle2 className="h-4 w-4 text-signal-pass" aria-hidden="true" />
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
