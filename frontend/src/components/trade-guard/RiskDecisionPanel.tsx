"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerplAgentRiskReview } from "@/types/perpl";

export function RiskDecisionPanel({ review, compact = false }: { review: PerplAgentRiskReview; compact?: boolean }) {
  const Icon = review.decision === "approve" ? CheckCircle2 : review.decision === "revise" ? ShieldAlert : XCircle;
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Icon className={`h-4 w-4 ${review.decision === "approve" ? "text-signal-pass" : review.decision === "revise" ? "text-signal-warn" : "text-signal-danger"}`} aria-hidden="true" />
          Risk decision
        </span>
      }
      description="Deterministic review. LLM text cannot approve or override this decision."
      actions={<StatusBadge tone={decisionTone(review.decision)}>{review.decision}</StatusBadge>}
    >
      <p className="text-sm leading-6 text-terminal-muted">{review.humanReadableSummary}</p>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
        <MetricTile label="Before" value={review.riskScoreBefore ?? "Unavailable"} />
        <MetricTile label="After" value={review.riskScoreAfter ?? "Unavailable"} tone={review.decision === "approve" ? "success" : "warning"} />
        <MetricTile label="Delta" value={review.scoreDelta ?? "Unavailable"} tone={review.scoreDelta !== null && review.scoreDelta < 0 ? "success" : "warning"} />
      </div>

      <div className={`mt-4 grid gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>
        <IssueList title="Blocking issues" issues={review.blockingIssues} empty="No blocking issue." />
        <IssueList title="Warnings" issues={review.warnings} empty="No warning." />
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <IdList title="Approved action IDs" ids={review.approvedActionIds} />
          <IdList title="Rejected action IDs" ids={review.rejectedActionIds} />
        </div>
      ) : null}

      {review.revisedActions.length ? (
        <div className="mt-4 rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-sm text-signal-warn">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Revised actions require rerun</div>
          <pre className="mt-2 max-h-56 overflow-auto rounded bg-terminal-bg p-3 text-xs text-terminal-text">{JSON.stringify(review.revisedActions, null, 2)}</pre>
        </div>
      ) : null}
    </Panel>
  );
}

function decisionTone(decision: PerplAgentRiskReview["decision"]) {
  if (decision === "approve") return "success";
  if (decision === "revise") return "warning";
  return "danger";
}

function IssueList({ title, issues, empty }: { title: string; issues: PerplAgentRiskReview["blockingIssues"]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {issues.length ? issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-terminal-text">{issue.code}</span>
              <StatusBadge tone={issue.severity === "critical" || issue.severity === "high" ? "danger" : "warning"}>{issue.severity}</StatusBadge>
            </div>
            <p className="mt-1 text-terminal-muted">{issue.message}</p>
            {issue.suggestedFix ? <p className="mt-1 text-xs text-terminal-subtle">Suggested fix: {issue.suggestedFix}</p> : null}
          </li>
        )) : <li className="text-terminal-muted">{empty}</li>}
      </ul>
    </div>
  );
}

function IdList({ title, ids }: { title: string; ids: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">{title}</h3>
      <p className="mt-2 break-words font-mono text-xs text-terminal-muted">{ids.length ? ids.join(", ") : "None"}</p>
    </div>
  );
}
