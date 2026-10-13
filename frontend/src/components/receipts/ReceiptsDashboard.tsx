"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Download, FileJson, GitCommitVertical, Link2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { formatUtc } from "@/lib/format";
import { perplApi } from "@/lib/api";
import { anchorReceiptOnchain, getAnchorConfigStatus } from "@/lib/receiptAnchor";
import type { PerplReceipt, PerplReceiptAnchorStatus, PerplReceiptChainVerification, PerplReceiptType, PerplReceiptVerification } from "@/types/perpl";

const receiptTypes: Array<"" | PerplReceiptType> = ["", "risk_review", "user_confirmation", "execution_intent", "order_submission", "order_update", "order_finalized", "execution_rejected", "reconciliation", "anchor_confirmation"];
const decisions = ["", "approve", "revise", "reject"];
const executionStatuses = ["", "accepted", "rejected", "unknown", "timeout", "disconnected", "reconciled"];

export function ReceiptsDashboard() {
  const queryClient = useQueryClient();
  const [type, setType] = useState<"" | PerplReceiptType>("");
  const [decision, setDecision] = useState("");
  const [executionStatus, setExecutionStatus] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["perpl", "receipts", type, decision, executionStatus, cursor],
    queryFn: ({ signal }) => perplApi.receipts({ type, decision, executionStatus, cursor, limit: 20 }, signal)
  });
  const selected = useMemo(() => list.data?.data.find((receipt) => receipt.receiptId === selectedId) ?? list.data?.data[0] ?? null, [list.data, selectedId]);
  const verify = useQuery({
    queryKey: ["perpl", "receipt-verify", selected?.receiptId],
    queryFn: ({ signal }) => selected ? perplApi.verifyReceipt(selected.receiptId, signal) : Promise.resolve(null),
    enabled: Boolean(selected)
  });
  const chain = useQuery({
    queryKey: ["perpl", "receipt-chain-verify"],
    queryFn: ({ signal }) => perplApi.verifyReceiptChain(signal),
    retry: false
  });
  const anchorStatus = useQuery({
    queryKey: ["perpl", "receipt-anchor-status", selected?.receiptId],
    queryFn: ({ signal }) => selected ? perplApi.receiptAnchorStatus(selected.receiptId, signal) : Promise.resolve(null),
    enabled: Boolean(selected)
  });

  const filtersCount = [type, decision, executionStatus].filter(Boolean).length;

  function clearFilters() {
    setType("");
    setDecision("");
    setExecutionStatus("");
    setCursor(null);
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-terminal-text">Receipt Audit Browser</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-terminal-muted">Application-layer Perpl audit receipts with deterministic hashes and hash-chain verification.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="live">Application layer</StatusBadge>
            <StatusBadge tone="warning">Not onchain enforced</StatusBadge>
            <StatusBadge tone="neutral">Optional hash anchoring</StatusBadge>
          </div>
        </div>
        <Button onClick={() => void list.refetch()} variant="secondary">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </section>

      <ReceiptAuditSummary receipts={list.data?.data ?? []} selected={selected} anchorStatus={anchorStatus.data ?? null} verification={verify.data ?? null} chain={chain.data ?? null} filtersCount={filtersCount} chainLoading={chain.isLoading} chainError={chain.error} />
      <ReceiptFilters type={type} decision={decision} executionStatus={executionStatus} filtersCount={filtersCount} onTypeChange={(value) => { setCursor(null); setType(value); }} onDecisionChange={(value) => { setCursor(null); setDecision(value); }} onExecutionStatusChange={(value) => { setCursor(null); setExecutionStatus(value); }} onClear={clearFilters} />

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(360px,1.1fr)_420px]">
        <ReceiptList
          receipts={list.data?.data ?? []}
          selectedId={selected?.receiptId ?? null}
          loading={list.isLoading}
          error={list.error}
          nextCursor={list.data?.nextCursor ?? null}
          onRetry={() => void list.refetch()}
          onSelect={(receipt) => setSelectedId(receipt.receiptId)}
          onFirstPage={() => setCursor(null)}
          onNextPage={() => setCursor(list.data?.nextCursor ?? null)}
        />
        <ReceiptTimeline receipt={selected} anchorStatus={anchorStatus.data ?? null} verification={verify.data ?? null} loading={verify.isLoading} error={verify.error} />
        <ReceiptDetailPanel
          receipt={selected}
          anchorStatus={anchorStatus.data ?? null}
          anchorStatusLoading={anchorStatus.isLoading}
          verification={verify.data ?? null}
          verificationLoading={verify.isLoading}
          onVerify={() => void verify.refetch()}
          onAnchored={() => {
            void anchorStatus.refetch();
            void verify.refetch();
            void chain.refetch();
            void list.refetch();
            void queryClient.invalidateQueries({ queryKey: ["perpl", "receipts"] });
          }}
        />
      </div>
    </div>
  );
}

function ReceiptAuditSummary({
  receipts,
  selected,
  anchorStatus,
  verification,
  chain,
  filtersCount,
  chainLoading,
  chainError
}: {
  receipts: PerplReceipt[];
  selected: PerplReceipt | null;
  anchorStatus: PerplReceiptAnchorStatus | null;
  verification: PerplReceiptVerification | null;
  chain: PerplReceiptChainVerification | null;
  filtersCount: number;
  chainLoading: boolean;
  chainError: unknown;
}) {
  const chainLabel = chainLoading ? "Checking" : chainError ? "Unavailable" : chain ? (chain.valid ? "Verified" : "Failed") : "Unavailable";
  const chainTone = chainLoading || chainError || !chain ? "warning" : chain.valid ? "success" : "danger";
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricTile label="Receipts on page" value={receipts.length} helper="Current query window" />
      <MetricTile label="Selected type" value={selected?.receiptType ?? "None"} helper={selected ? `Seq ${selected.sequenceNumber}` : "Select a receipt"} tone={selected ? "live" : "default"} />
      <MetricTile label="Chain health" value={chainLabel} helper={chain?.receiptCount ? `${chain.receiptCount} receipts checked` : "Application-level chain"} tone={chainTone} />
      <MetricTile label="Signature" value={selected ? (selected.signature ? "Signed" : "Unsigned") : "None"} helper={verification?.signatureValid === false ? "Signature failed" : "Selected receipt"} tone={selected?.signature ? "success" : selected ? "warning" : "default"} />
      <MetricTile label="Onchain anchored" value={anchorStatus?.anchored ? "True" : "False"} helper={anchorStatus?.txHash ? short(anchorStatus.txHash) : selected ? "Anchor status from confirmation receipts" : "No receipt selected"} tone={anchorStatus?.anchored ? "success" : "warning"} />
      <MetricTile label="Filters" value={filtersCount} helper={filtersCount ? "Active filters" : "No filters"} tone={filtersCount ? "live" : "default"} />
    </div>
  );
}

function ReceiptFilters({
  type,
  decision,
  executionStatus,
  filtersCount,
  onTypeChange,
  onDecisionChange,
  onExecutionStatusChange,
  onClear
}: {
  type: "" | PerplReceiptType;
  decision: string;
  executionStatus: string;
  filtersCount: number;
  onTypeChange: (value: "" | PerplReceiptType) => void;
  onDecisionChange: (value: string) => void;
  onExecutionStatusChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <Panel title="Filters" description="Filter application-layer receipts without changing receipt verification semantics." actions={<Button size="sm" variant="ghost" onClick={onClear} disabled={filtersCount === 0}>Clear filters</Button>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Select label="Type" value={type} onChange={(value) => onTypeChange(value as "" | PerplReceiptType)} options={receiptTypes.map((item) => ({ value: item, label: item || "All types" }))} />
        <Select label="Decision" value={decision} onChange={onDecisionChange} options={decisions.map((item) => ({ value: item, label: item || "All decisions" }))} />
        <Select label="Execution status" value={executionStatus} onChange={onExecutionStatusChange} options={executionStatuses.map((item) => ({ value: item, label: item || "All statuses" }))} />
      </div>
    </Panel>
  );
}

function ReceiptList({
  receipts,
  selectedId,
  loading,
  error,
  nextCursor,
  onRetry,
  onSelect,
  onFirstPage,
  onNextPage
}: {
  receipts: PerplReceipt[];
  selectedId: string | null;
  loading: boolean;
  error: unknown;
  nextCursor: string | null;
  onRetry: () => void;
  onSelect: (receipt: PerplReceipt) => void;
  onFirstPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <Panel title="Receipt list" description="Click a row to inspect hash-chain context." className="min-w-0">
      {loading ? <LoadingSkeleton rows={6} /> : null}
      {error ? <ErrorState error={error} title="Receipts unavailable" onRetry={onRetry} /> : null}
      {!loading && !error && receipts.length === 0 ? <EmptyState title="No receipts found." description="Adjust filters or wait for a workflow to write application-layer audit records." /> : null}
      {!loading && !error && receipts.length ? (
        <div className="space-y-2">
          {receipts.map((receipt) => (
            <button
              key={receipt.receiptId}
              type="button"
              onClick={() => onSelect(receipt)}
              className={`w-full rounded-md border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-signal-live ${selectedId === receipt.receiptId ? "border-signal-live/45 bg-signal-live/10 shadow-[inset_3px_0_0_#22d3ee]" : "border-terminal-line bg-terminal-raised/35 hover:border-signal-live/30 hover:bg-terminal-raised/70"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-terminal-subtle">{formatUtc(receipt.createdAt)}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-terminal-text">{receipt.receiptType}</p>
                </div>
                <StatusBadge tone={statusTone(statusFor(receipt))}>{statusFor(receipt)}</StatusBadge>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-terminal-muted sm:grid-cols-2">
                <ListDatum label="Workflow" value={short(receipt.workflowId)} />
                <ListDatum label="Decision" value={receipt.riskDecision?.decision ?? "n/a"} />
                <ListDatum label="Hash" value={short(receipt.receiptHash)} />
                <ListDatum label="Integrity" value={`${receipt.signature ? "Signed" : "Unsigned"} · ${receipt.onchainAnchored ? "Anchored" : "Not anchored"}`} />
              </div>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex justify-between border-t border-terminal-line pt-3">
        <Button size="sm" variant="ghost" onClick={onFirstPage}>First page</Button>
        <Button size="sm" variant="ghost" disabled={!nextCursor} onClick={onNextPage}>Next page</Button>
      </div>
    </Panel>
  );
}

function ReceiptTimeline({ receipt, anchorStatus, verification, loading, error }: { receipt: PerplReceipt | null; anchorStatus: PerplReceiptAnchorStatus | null; verification: PerplReceiptVerification | null; loading: boolean; error: unknown }) {
  if (!receipt) {
    return (
      <Panel title="Hash-chain timeline" className="min-w-0">
        <EmptyState title="Select a receipt to inspect hash-chain context." description="The timeline shows parent linkage, previous hash, receipt hash, signature, and application-layer boundary." />
      </Panel>
    );
  }

  const nodes: ChainNode[] = [
    { label: "Parent receipt", value: receipt.parentReceiptId ?? "Root receipt", status: verification?.parentValid, emptyLabel: receipt.parentReceiptId ? undefined : "root" },
    { label: "Previous hash", value: receipt.previousReceiptHash ?? "No previous hash", status: verification?.chainLinkValid, emptyLabel: receipt.previousReceiptHash ? undefined : "root" },
    { label: "Current receipt hash", value: receipt.receiptHash, status: verification?.receiptHashValid },
    { label: "Signature status", value: receipt.signature ? short(receipt.signingKeyId ?? "signed") : "Unsigned receipt", status: verification?.signaturePresent ? verification.signatureValid : null, emptyLabel: receipt.signature ? undefined : "unsigned" },
    { label: "Application layer", value: "Application-layer evidence, not a Monad transaction hash.", status: true },
    { label: "Onchain anchor", value: anchorStatus?.anchored ? anchorStatus.txHash ?? "Anchored onchain" : "Not anchored onchain", status: anchorStatus?.anchored ? true : null, emptyLabel: anchorStatus?.anchored ? undefined : "not anchored" }
  ];

  return (
    <Panel
      title="Hash-chain timeline"
      description="Application-level verification flow for the selected receipt."
      actions={<StatusBadge tone={verificationTone(verification, error)}>{verificationLabel(verification, loading, error)}</StatusBadge>}
      className="min-w-0"
    >
      {loading ? <LoadingSkeleton rows={2} /> : null}
      {error ? <ErrorState error={error} title="Receipt verification unavailable" /> : null}
      <div className="mt-1 space-y-0">
        {nodes.map((node, index) => (
          <div key={node.label} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full border ${nodeClass(node.status)}`}>
                <NodeIcon status={node.status} />
              </span>
              {index < nodes.length - 1 ? <span className="h-full min-h-8 w-px bg-terminal-line" aria-hidden="true" /> : null}
            </div>
            <div className="pb-4">
              <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-terminal-text">{node.label}</p>
                  <StatusBadge tone={nodeStatusTone(node.status)}>{nodeText(node.status, node.emptyLabel)}</StatusBadge>
                </div>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-terminal-muted">{node.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-xs leading-5 text-signal-warn">
        This receipt is application-layer evidence. It is not a Monad transaction hash and does not represent onchain policy enforcement.
      </div>
    </Panel>
  );
}

function ReceiptDetailPanel({
  receipt,
  anchorStatus,
  anchorStatusLoading,
  verification,
  verificationLoading,
  onVerify,
  onAnchored
}: {
  receipt: PerplReceipt | null;
  anchorStatus: PerplReceiptAnchorStatus | null;
  anchorStatusLoading: boolean;
  verification: PerplReceiptVerification | null;
  verificationLoading: boolean;
  onVerify: () => void;
  onAnchored: () => void;
}) {
  if (!receipt) {
    return (
      <Panel title="Receipt detail" className="min-w-0">
        <EmptyState title="No receipt selected." description="Choose a receipt from the list to view identity, enforcement boundary, hashes, and raw audit fields." />
      </Panel>
    );
  }

  const exportJson = async () => {
    const data = await perplApi.exportReceipt(receipt.receiptId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${receipt.receiptId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <FileJson className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Receipt detail
        </span>
      }
      description="Raw IDs and hashes are application-layer audit identifiers, not transaction hashes."
      actions={<ReceiptActionBar receipt={receipt} onVerify={onVerify} onExport={() => void exportJson()} />}
      className="min-w-0 xl:sticky xl:top-24 xl:self-start"
    >
      {verificationLoading ? <div className="mb-4"><LoadingSkeleton rows={1} /></div> : null}
      <div className="space-y-4 text-sm">
        <IntegrityChecklist receipt={receipt} anchorStatus={anchorStatus} verification={verification} />
        <AnchorPanel receipt={receipt} anchorStatus={anchorStatus} loading={anchorStatusLoading} onAnchored={onAnchored} />
        <DetailGroup title="Identity">
          <Info label="Receipt ID" value={receipt.receiptId} />
          <Info label="Type" value={receipt.receiptType} />
          <Info label="Sequence" value={String(receipt.sequenceNumber)} />
          <Info label="Created" value={formatUtc(receipt.createdAt)} />
          <Info label="Workflow" value={receipt.workflowId} />
        </DetailGroup>
        <DetailGroup title="Enforcement boundary">
          <Info label="Layer" value={receipt.receiptLayer} />
          <Info label="Policy enforcement" value={receipt.policyEnforcement} />
          <Info label="Onchain enforced" value={String(receipt.onchainEnforced)} tone="warning" />
          <Info label="Onchain anchored" value={String(Boolean(anchorStatus?.anchored))} tone={anchorStatus?.anchored ? "success" : "warning"} />
          <Info label="Onchain anchor tx hash" value={anchorStatus?.txHash ?? "none"} />
        </DetailGroup>
        <DetailGroup title="Risk">
          <Info label="Decision" value={receipt.riskDecision?.decision ?? "n/a"} />
          <Info label="Risk score" value={receipt.risk ? `${receipt.risk.riskScore ?? "n/a"} (${receipt.risk.riskLevel})` : "n/a"} />
          <Info label="Coverage" value={receipt.risk ? `${receipt.risk.scoreCoveragePercent}%` : "n/a"} />
          <Info label="Issues" value={receipt.risk?.issueCodes.join(", ") || "n/a"} />
        </DetailGroup>
        <DetailGroup title="Strategy">
          <Info label="Objective" value={receipt.strategy?.objective ?? "n/a"} />
          <Info label="Status" value={receipt.strategy?.status ?? "n/a"} />
          <details className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-terminal-muted focus:outline-none focus:ring-2 focus:ring-signal-live">Action summaries</summary>
            <ul className="mt-2 space-y-2 text-terminal-muted">
              {receipt.strategy?.actionSummaries.length ? receipt.strategy.actionSummaries.map((action) => (
                <li key={action.actionId} className="break-words">
                  <span className="font-mono text-terminal-subtle">{action.actionId}</span> · {action.type}: {action.summary}
                </li>
              )) : <li>n/a</li>}
            </ul>
          </details>
        </DetailGroup>
        <DetailGroup title="Policy checks">
          <Info label="Policy hash" value={receipt.policy?.policyHash ?? "n/a"} />
          <Info label="Expiry" value={receipt.policy?.policyExpiry ? formatUtc(receipt.policy.policyExpiry) : "n/a"} />
          <Info label="Passed" value={receipt.policy?.passedChecks.join(", ") || "n/a"} tone="success" />
          <Info label="Failed" value={receipt.policy?.failedChecks.join(", ") || "n/a"} tone={receipt.policy?.failedChecks.length ? "danger" : undefined} />
        </DetailGroup>
        <DetailGroup title="Simulation">
          <Info label="Before / after" value={receipt.simulation ? `${receipt.simulation.beforeScore ?? "n/a"} / ${receipt.simulation.afterScore ?? "n/a"}` : "n/a"} />
          <Info label="Delta" value={receipt.simulation?.scoreDelta === null || receipt.simulation?.scoreDelta === undefined ? "n/a" : String(receipt.simulation.scoreDelta)} />
          <Info label="Warnings" value={receipt.simulation?.warnings.join(", ") || "n/a"} tone={receipt.simulation?.warnings.length ? "warning" : undefined} />
        </DetailGroup>
        <DetailGroup title="Execution">
          <Info label="Intent ID" value={receipt.intentId ?? "n/a"} />
          <Info label="Order status" value={receipt.orderStatus ?? "n/a"} />
          <Info label="Current status" value={receipt.currentStatus ?? "n/a"} />
          <Info label="Final status" value={receipt.finalStatus ?? "n/a"} />
        </DetailGroup>
        <DetailGroup title="Raw IDs / hashes">
          <Info label="Receipt hash" value={receipt.receiptHash} />
          <Info label="Parent receipt" value={receipt.parentReceiptId ?? "none"} />
          <Info label="Previous hash" value={receipt.previousReceiptHash ?? "none"} />
          <Info label="Plan hash" value={receipt.planHash ?? "n/a"} />
          <Info label="Signing key" value={receipt.signingKeyId ?? "unsigned"} />
        </DetailGroup>
      </div>
    </Panel>
  );
}

function AnchorPanel({ receipt, anchorStatus, loading, onAnchored }: { receipt: PerplReceipt; anchorStatus: PerplReceiptAnchorStatus | null; loading: boolean; onAnchored: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = getAnchorConfigStatus();
  const disabledReason = anchorStatus?.anchored ? "Already anchored" : receipt.receiptType === "anchor_confirmation" ? "Anchor confirmation receipts are not anchored again" : !config.ready ? config.reason : null;

  async function onAnchor() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await anchorReceiptOnchain(receipt);
      const status = await perplApi.recordReceiptAnchor(receipt.receiptId, {
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        txHash: result.txHash,
        submitter: result.submitter
      });
      setMessage(`Anchor recorded: ${short(status.txHash ?? result.txHash)}`);
      onAnchored();
    } catch (anchorError) {
      setError(anchorError instanceof Error ? anchorError.message : "Anchor transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Onchain anchoring</h3>
          <p className="mt-2 text-xs leading-5 text-terminal-muted">
            This anchors the application receipt hash onchain. It does not make policy enforcement onchain and does not prove Perpl execution was performed by a smart contract.
          </p>
        </div>
        <Button type="button" size="sm" variant="primary" disabled={busy || loading || Boolean(disabledReason)} onClick={() => void onAnchor()}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {busy ? "Confirming" : "Anchor onchain"}
        </Button>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={anchorStatus?.anchored ? "success" : disabledReason ? "warning" : "live"}>{anchorStatus?.anchored ? "anchored" : disabledReason ?? "ready"}</StatusBadge>
          {loading ? <span className="text-xs text-terminal-subtle">Checking anchor status...</span> : null}
          {busy ? <span className="text-xs text-terminal-subtle">Waiting for wallet / chain confirmation.</span> : null}
        </div>
        {anchorStatus?.anchored ? (
          <div className="space-y-1">
            <Info label="Tx hash" value={anchorStatus.txHash ?? "none"} tone="success" />
            <Info label="Anchor receipt" value={anchorStatus.anchorReceiptId ?? "none"} />
            <Info label="Submitter" value={anchorStatus.submitter ?? "none"} />
          </div>
        ) : null}
        {message ? <p className="text-xs text-signal-pass">{message}</p> : null}
        {error ? <p className="text-xs text-signal-danger">{error}</p> : null}
      </div>
    </div>
  );
}

function IntegrityChecklist({ receipt, anchorStatus, verification }: { receipt: PerplReceipt; anchorStatus: PerplReceiptAnchorStatus | null; verification: PerplReceiptVerification | null }) {
  const items = [
    { label: "Receipt hash", status: verification?.receiptHashValid, fallback: "unavailable" },
    { label: "Chain link", status: verification?.chainLinkValid, fallback: receipt.previousReceiptHash ? "unavailable" : "root" },
    { label: "Parent receipt", status: verification?.parentValid, fallback: receipt.parentReceiptId ? "unavailable" : "root" },
    { label: "Signature", status: verification?.signaturePresent ? verification.signatureValid : null, fallback: receipt.signature ? "unavailable" : "unsigned" },
    { label: "Onchain anchor", status: anchorStatus?.anchored ? true : null, fallback: "not anchored onchain" }
  ];
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Integrity checklist</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-terminal-muted">{item.label}</span>
            <StatusBadge tone={nodeStatusTone(item.status)}>{nodeText(item.status, item.fallback)}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceiptActionBar({ receipt, onVerify, onExport }: { receipt: PerplReceipt; onVerify: () => void; onExport: () => void }) {
  return (
    <>
      <Button type="button" onClick={onVerify} variant="primary" size="sm" title="Verify selected receipt" aria-label="Verify selected receipt">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Verify
      </Button>
      <Button type="button" onClick={onExport} variant="secondary" size="sm" title="Export selected receipt as JSON" aria-label="Export selected receipt as JSON">
        <Download className="h-4 w-4" aria-hidden="true" />
        Export JSON
      </Button>
      <Button type="button" onClick={() => copyHash(receipt.receiptHash)} variant="secondary" size="sm" title="Copy receipt hash" aria-label="Copy receipt hash">
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copy hash
      </Button>
    </>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/25 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-subtle">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="text-sm font-semibold text-terminal-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block min-h-10 w-full rounded-md border border-terminal-line bg-terminal-raised px-3 text-sm font-normal text-terminal-text focus:outline-none focus:ring-2 focus:ring-signal-live">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-signal-pass" : tone === "warning" ? "text-signal-warn" : tone === "danger" ? "text-signal-danger" : "text-terminal-text";
  return (
    <p className="grid gap-1 sm:grid-cols-[128px_minmax(0,1fr)]">
      <span className="font-semibold text-terminal-muted">{label}</span>
      <span className={`break-all font-mono text-xs leading-5 ${toneClass}`}>{value}</span>
    </p>
  );
}

function ListDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-terminal-subtle">{label}</p>
      <p className="mt-0.5 break-all font-mono text-terminal-muted">{value}</p>
    </div>
  );
}

interface ChainNode {
  label: string;
  value: string;
  status: boolean | null | undefined;
  emptyLabel?: string;
}

function NodeIcon({ status }: { status: boolean | null | undefined }) {
  if (status === true) return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (status === false) return <XCircle className="h-4 w-4" aria-hidden="true" />;
  return <GitCommitVertical className="h-4 w-4" aria-hidden="true" />;
}

function nodeClass(status: boolean | null | undefined) {
  if (status === true) return "border-signal-pass/35 bg-signal-pass/10 text-signal-pass";
  if (status === false) return "border-signal-danger/40 bg-signal-danger/10 text-signal-danger";
  return "border-terminal-line bg-terminal-panel text-terminal-muted";
}

function nodeStatusTone(status: boolean | null | undefined): StatusTone {
  if (status === true) return "success";
  if (status === false) return "danger";
  return "warning";
}

function nodeText(status: boolean | null | undefined, fallback = "unavailable") {
  if (status === true) return "verified";
  if (status === false) return "failed";
  return fallback;
}

function verificationTone(verification: PerplReceiptVerification | null, error: unknown): StatusTone {
  if (error) return "warning";
  if (!verification) return "neutral";
  return verification.receiptHashValid && verification.chainLinkValid && verification.parentValid && verification.signatureValid !== false ? "success" : "danger";
}

function verificationLabel(verification: PerplReceiptVerification | null, loading: boolean, error: unknown) {
  if (loading) return "checking";
  if (error) return "verify unavailable";
  if (!verification) return "not checked";
  return verification.receiptHashValid && verification.chainLinkValid && verification.parentValid && verification.signatureValid !== false ? "verified" : "failed";
}

function statusFor(receipt: PerplReceipt) {
  return receipt.orderStatus ?? receipt.currentStatus ?? receipt.finalStatus ?? receipt.riskDecision?.decision ?? "n/a";
}

function statusTone(status: string): StatusTone {
  if (status === "approve" || status === "accepted" || status === "reconciled" || status === "order_finalized") return "success";
  if (status === "reject" || status === "rejected" || status === "disconnected") return "danger";
  if (status === "revise" || status === "timeout" || status === "unknown") return "warning";
  return "neutral";
}

function short(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-5)}` : value;
}

function copyHash(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
  void navigator.clipboard.writeText(value).catch(() => undefined);
}
