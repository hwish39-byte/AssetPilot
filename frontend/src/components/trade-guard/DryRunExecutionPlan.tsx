"use client";

import { AlertTriangle, FileCheck2 } from "lucide-react";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerplAgentWorkflowResponse, PerplMarket } from "@/types/perpl";
import { findMarket, hasUnsafeExecutionMaterial } from "./tradeGuardUtils";

export function DryRunExecutionPlan({ result, markets }: { result: PerplAgentWorkflowResponse; markets: PerplMarket[] }) {
  if (result.riskReview.decision !== "approve") return null;
  const unsafe = result.execution.descriptors.find(hasUnsafeExecutionMaterial);

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Dry-run execution plan
        </span>
      }
      actions={<StatusBadge tone="success">{result.execution.status}</StatusBadge>}
    >
      <p className="text-sm leading-6 text-terminal-muted">{result.execution.reason}</p>
      {unsafe ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-signal-danger/35 bg-signal-danger/10 p-3 text-sm text-signal-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <p>Critical safety error: backend returned execution material or non-not_submitted status. Local confirmation is disabled.</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {result.execution.descriptors.map((descriptor) => {
          const market = findMarket(markets, descriptor.marketId);
          return (
            <article key={descriptor.actionId} className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-terminal-subtle">{descriptor.actionId}</span>
                <StatusBadge tone="live">{descriptor.actionType}</StatusBadge>
                <span className="text-xs text-terminal-muted">{descriptor.protocol} · {descriptor.network}</span>
              </div>
              <p className="mt-2 text-terminal-muted">{descriptor.humanReadable}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Account" value={descriptor.accountId} />
                <Field label="Market" value={market?.symbol ?? descriptor.marketId ?? "None"} />
                <Field label="Position/order" value={descriptor.positionId ?? descriptor.orderId ?? "None"} />
                <Field label="Execution status" value={descriptor.executionStatus} />
                <Field label="User confirmation" value={descriptor.requiresUserConfirmation ? "Required" : "Missing"} />
                <Field label="Signing later" value={descriptor.signingRequiredLater ? "Would be required in future version" : "No"} />
                <Field label="Calldata" value={descriptor.calldata === null ? "null" : "non-null"} />
                <Field label="Signature / tx" value={descriptor.signature === null && descriptor.txHash === null ? "null" : "non-null"} />
              </div>
              <p className="mt-2 text-xs text-terminal-muted">Expected effect: {descriptor.expectedRiskEffect}</p>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-terminal-subtle">{label}</p>
      <p className="mt-1 break-words font-medium text-terminal-text">{value}</p>
    </div>
  );
}
