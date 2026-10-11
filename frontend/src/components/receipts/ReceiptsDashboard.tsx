"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, Download, FileJson, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { perplApi } from "@/lib/api";
import type { PerplReceipt, PerplReceiptType, PerplReceiptVerification } from "@/types/perpl";

const receiptTypes: Array<"" | PerplReceiptType> = ["", "risk_review", "user_confirmation", "execution_intent", "order_submission", "order_update", "order_finalized", "execution_rejected", "reconciliation"];

export function ReceiptsDashboard() {
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

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
          <p className="mt-1 text-sm text-slate-600">Application-layer Perpl audit receipts. They are not onchain policy enforcement and are not anchored onchain.</p>
        </div>
        <button type="button" onClick={() => void list.refetch()} className="inline-flex min-h-10 items-center gap-2 border border-slate-300 px-3 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Select label="Type" value={type} onChange={(value) => { setCursor(null); setType(value as "" | PerplReceiptType); }} options={receiptTypes.map((item) => ({ value: item, label: item || "All types" }))} />
        <Select label="Decision" value={decision} onChange={(value) => { setCursor(null); setDecision(value); }} options={["", "approve", "revise", "reject"].map((item) => ({ value: item, label: item || "All decisions" }))} />
        <Select label="Execution status" value={executionStatus} onChange={(value) => { setCursor(null); setExecutionStatus(value); }} options={["", "accepted", "rejected", "unknown", "timeout", "disconnected", "reconciled"].map((item) => ({ value: item, label: item || "All statuses" }))} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="overflow-hidden border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Workflow</th>
                  <th className="px-3 py-2">Risk decision</th>
                  <th className="px-3 py-2">Score change</th>
                  <th className="px-3 py-2">Execution</th>
                  <th className="px-3 py-2">Integrity</th>
                  <th className="px-3 py-2">Network</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.data.map((receipt) => (
                  <tr key={receipt.receiptId} onClick={() => setSelectedId(receipt.receiptId)} className={`cursor-pointer border-t border-slate-100 hover:bg-cyan-50 ${selected?.receiptId === receipt.receiptId ? "bg-cyan-50" : ""}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(receipt.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 font-medium">{receipt.receiptType}</td>
                    <td className="px-3 py-2 font-mono text-xs">{short(receipt.workflowId)}</td>
                    <td className="px-3 py-2">{receipt.riskDecision?.decision ?? "n/a"}</td>
                    <td className="px-3 py-2">{receipt.simulation?.scoreDelta ?? "n/a"}</td>
                    <td className="px-3 py-2">{receipt.orderStatus ?? receipt.currentStatus ?? receipt.finalStatus ?? "n/a"}</td>
                    <td className="px-3 py-2"><IntegrityMini receipt={receipt} /></td>
                    <td className="px-3 py-2">{receipt.network}</td>
                  </tr>
                ))}
                {!list.isLoading && !list.data?.data.length ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>No receipts found.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between border-t border-slate-200 p-3">
            <button type="button" onClick={() => setCursor(null)} className="text-sm font-semibold text-slate-600">First page</button>
            <button type="button" disabled={!list.data?.nextCursor} onClick={() => setCursor(list.data?.nextCursor ?? null)} className="text-sm font-semibold text-cyan-700 disabled:text-slate-400">Next page</button>
          </div>
        </div>
        <ReceiptDetail receipt={selected} verification={verify.data ?? null} onVerify={() => void verify.refetch()} />
      </div>
    </div>
  );
}

function ReceiptDetail({ receipt, verification, onVerify }: { receipt: PerplReceipt | null; verification: PerplReceiptVerification | null; onVerify: () => void }) {
  if (!receipt) return <aside className="border border-slate-200 bg-white p-4 text-sm text-slate-500">Select a receipt.</aside>;
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
    <aside className="space-y-4 border border-slate-200 bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">{receipt.receiptType}</h2>
          <p className="font-mono text-xs text-slate-500">{receipt.receiptId}</p>
        </div>
        <FileJson className="h-5 w-5 text-slate-500" aria-hidden="true" />
      </div>
      <div className="grid gap-2">
        <Info label="Workflow" value={receipt.workflowId} />
        <Info label="Parent" value={receipt.parentReceiptId ?? "none"} />
        <Info label="Layer" value={receipt.receiptLayer} />
        <Info label="Policy enforcement" value={receipt.policyEnforcement} />
        <Info label="Onchain enforced" value={String(receipt.onchainEnforced)} />
        <Info label="Onchain anchored" value={String(receipt.onchainAnchored)} />
        <Info label="Hash" value={receipt.receiptHash} />
        <Info label="Previous hash" value={receipt.previousReceiptHash ?? "none"} />
      </div>
      <IntegrityBlock verification={verification} receipt={receipt} />
      <Section title="Risk">{receipt.risk ? `Score ${receipt.risk.riskScore ?? "n/a"} (${receipt.risk.riskLevel}), coverage ${receipt.risk.scoreCoveragePercent}%` : "n/a"}</Section>
      <Section title="Strategy">{receipt.strategy?.actionSummaries.map((action) => action.summary).join("; ") || "n/a"}</Section>
      <Section title="Policy checks">{receipt.policy ? `${receipt.policy.passedChecks.length} passed, ${receipt.policy.failedChecks.length} failed` : "n/a"}</Section>
      <Section title="Simulation">{receipt.simulation ? `Before ${receipt.simulation.beforeScore ?? "n/a"} / after ${receipt.simulation.afterScore ?? "n/a"} / delta ${receipt.simulation.scoreDelta ?? "n/a"}` : "n/a"}</Section>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onVerify} className="inline-flex min-h-9 items-center gap-2 border border-cyan-700 px-3 text-sm font-semibold text-cyan-700"><ShieldCheck className="h-4 w-4" /> Verify</button>
        <button type="button" onClick={exportJson} className="inline-flex min-h-9 items-center gap-2 border border-slate-300 px-3 text-sm font-semibold"><Download className="h-4 w-4" /> Export JSON</button>
        <button type="button" onClick={() => navigator.clipboard.writeText(receipt.receiptHash)} className="inline-flex min-h-9 items-center gap-2 border border-slate-300 px-3 text-sm font-semibold"><Copy className="h-4 w-4" /> Copy hash</button>
      </div>
    </aside>
  );
}

function IntegrityBlock({ verification, receipt }: { verification: PerplReceiptVerification | null; receipt: PerplReceipt }) {
  const items = [
    ["Hash", verification?.receiptHashValid],
    ["Chain link", verification?.chainLinkValid],
    ["Parent", verification?.parentValid],
    ["Signature", verification?.signaturePresent ? verification.signatureValid : null],
    ["Onchain", receipt.onchainAnchored ? true : null]
  ] as const;
  return <div className="grid gap-1">{items.map(([label, ok]) => <span key={label} className="inline-flex items-center gap-2 text-xs"><StatusIcon ok={ok} /> {label}: {ok === true ? "verified" : ok === false ? "failed" : label === "Signature" ? "unsigned" : "not anchored onchain"}</span>)}</div>;
}

function IntegrityMini({ receipt }: { receipt: PerplReceipt }) {
  return <span className="inline-flex items-center gap-1 text-xs text-slate-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Hashable · {receipt.signature ? "Signed" : "Unsigned"} · Not anchored</span>;
}

function StatusIcon({ ok }: { ok: boolean | null | undefined }) {
  if (ok === false) return <TriangleAlert className="h-4 w-4 text-rose-600" aria-hidden="true" />;
  return <CheckCircle2 className={`h-4 w-4 ${ok ? "text-emerald-600" : "text-slate-400"}`} aria-hidden="true" />;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block min-h-10 w-full border border-slate-300 bg-white px-3 text-sm font-normal">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><span className="font-semibold text-slate-600">{label}: </span><span className="break-all font-mono text-xs">{value}</span></p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-t border-slate-100 pt-3"><h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3><p className="mt-1 text-slate-700">{children}</p></div>;
}

function short(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-5)}` : value;
}
