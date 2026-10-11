"use client";

import { AlertTriangle, FileCheck2 } from "lucide-react";
import type { PerplAgentWorkflowResponse, PerplMarket } from "@/types/perpl";
import { findMarket, hasUnsafeExecutionMaterial } from "./tradeGuardUtils";

export function DryRunExecutionPlan({ result, markets }: { result: PerplAgentWorkflowResponse; markets: PerplMarket[] }) {
  if (result.riskReview.decision !== "approve") return null;
  const unsafe = result.execution.descriptors.find(hasUnsafeExecutionMaterial);

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-cyan-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-950">Dry-run execution plan</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">{result.execution.reason}</p>
      {unsafe ? (
        <div className="mt-3 flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <p>Critical safety error: backend returned execution material or non-not_submitted status. Local confirmation is disabled.</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {result.execution.descriptors.map((descriptor) => {
          const market = findMarket(markets, descriptor.marketId);
          return (
            <article key={descriptor.actionId} className="border-l-2 border-slate-300 pl-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-500">{descriptor.actionId}</span>
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">{descriptor.actionType}</span>
                <span className="text-xs text-slate-500">{descriptor.protocol} · {descriptor.network}</span>
              </div>
              <p className="mt-2 text-slate-700">{descriptor.humanReadable}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Account" value={descriptor.accountId} />
                <Field label="Market" value={market?.symbol ?? descriptor.marketId ?? "None"} />
                <Field label="Position/order" value={descriptor.positionId ?? descriptor.orderId ?? "None"} />
                <Field label="Execution status" value={descriptor.executionStatus} />
                <Field label="User confirmation" value={descriptor.requiresUserConfirmation ? "Required" : "Missing"} />
                <Field label="Signing later" value={descriptor.signingRequiredLater ? "Would be required in future version" : "No"} />
                <Field label="Calldata" value={descriptor.calldata === null ? "null" : "non-null"} />
                <Field label="Signature / tx" value={descriptor.signature === null && descriptor.txHash === null ? "null" : "non-null"} />
              </div>
              <p className="mt-2 text-xs text-slate-600">Expected effect: {descriptor.expectedRiskEffect}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-900">{value}</p>
    </div>
  );
}
