"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { RiskBadge } from "@/components/risk/RiskBadge";
import type { PerplAgentRiskReview } from "@/types/perpl";

export function RiskDecisionPanel({ review }: { review: PerplAgentRiskReview }) {
  const Icon = review.decision === "approve" ? CheckCircle2 : review.decision === "revise" ? ShieldAlert : XCircle;
  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${review.decision === "approve" ? "text-emerald-700" : review.decision === "revise" ? "text-amber-700" : "text-red-700"}`} aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-950">System risk decision</h2>
        </div>
        <span className="rounded border border-slate-200 px-2 py-0.5 text-xs font-bold uppercase text-slate-800">{review.decision}</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{review.humanReadableSummary}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">Deterministic review. LLM text cannot approve or override this decision.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Before" value={review.riskScoreBefore ?? "Unavailable"} />
        <Metric label="After" value={review.riskScoreAfter ?? "Unavailable"} />
        <Metric label="Delta" value={review.scoreDelta ?? "Unavailable"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <IssueList title="Blocking issues" issues={review.blockingIssues} empty="No blocking issue." />
        <IssueList title="Warnings" issues={review.warnings} empty="No warning." />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <IdList title="Approved action IDs" ids={review.approvedActionIds} />
        <IdList title="Rejected action IDs" ids={review.rejectedActionIds} />
      </div>

      {review.revisedActions.length ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Revised actions require rerun</div>
          <pre className="mt-2 max-h-56 overflow-auto text-xs">{JSON.stringify(review.revisedActions, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-l border-slate-200 pl-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function IssueList({ title, issues, empty }: { title: string; issues: PerplAgentRiskReview["blockingIssues"]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {issues.length ? issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className="border-l border-slate-200 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{issue.code}</span>
              <RiskBadge level={issue.severity as never} />
            </div>
            <p className="mt-1 text-slate-700">{issue.message}</p>
            {issue.suggestedFix ? <p className="mt-1 text-xs text-slate-500">Suggested fix: {issue.suggestedFix}</p> : null}
          </li>
        )) : <li className="text-slate-500">{empty}</li>}
      </ul>
    </div>
  );
}

function IdList({ title, ids }: { title: string; ids: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <p className="mt-2 break-words font-mono text-xs text-slate-700">{ids.length ? ids.join(", ") : "None"}</p>
    </div>
  );
}
