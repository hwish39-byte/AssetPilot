"use client";

import { CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import type { PerplAgentPolicy, PerplAgentWorkflowResponse, PerplRiskSnapshot } from "@/types/perpl";
import { confirmationEligibility, type LocalConfirmation } from "./tradeGuardUtils";

export function UserConfirmationPanel({
  result,
  policy,
  risk,
  confirmation,
  onConfirm,
  onAbandon
}: {
  result: PerplAgentWorkflowResponse | null;
  policy: PerplAgentPolicy;
  risk: PerplRiskSnapshot | undefined;
  confirmation: LocalConfirmation | null;
  onConfirm: () => void;
  onAbandon: () => void;
}) {
  const eligibility = confirmationEligibility(result, policy, risk);

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <LockKeyhole className="h-4 w-4 text-cyan-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-950">User confirmation</h2>
      </div>
      <p className="mt-2 text-sm text-slate-700">This confirms the plan locally. No Perpl order is signed or submitted.</p>
      <div className={`mt-3 flex items-start gap-2 border p-3 text-sm ${eligibility.eligible ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
        {eligibility.eligible ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />}
        <p>{eligibility.reason}</p>
      </div>

      {confirmation ? (
        <div className="mt-3 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">Plan confirmed locally.</p>
          <p className="mt-1">Workflow {confirmation.workflowId} confirmed at {confirmation.confirmedAt}. Execution is not enabled in this version.</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!eligibility.eligible}
          onClick={onConfirm}
          className="min-h-10 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
        >
          Approve dry-run plan
        </button>
        <button
          type="button"
          onClick={onAbandon}
          className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600"
        >
          Abandon current plan
        </button>
      </div>
    </section>
  );
}
