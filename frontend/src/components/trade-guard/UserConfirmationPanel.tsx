"use client";

import { CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Panel } from "@/components/shared/Panel";
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
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <LockKeyhole className="h-4 w-4 text-signal-live" aria-hidden="true" />
          User confirmation
        </span>
      }
      description="Local approval for the dry-run plan. No Perpl order is signed or submitted here."
    >
      <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${eligibility.eligible ? "border-signal-pass/35 bg-signal-pass/10 text-signal-pass" : "border-terminal-line bg-terminal-raised/50 text-terminal-muted"}`}>
        {eligibility.eligible ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />}
        <p>{eligibility.reason}</p>
      </div>

      {confirmation ? (
        <div className="mt-3 rounded-md border border-signal-pass/35 bg-signal-pass/10 p-3 text-sm text-signal-pass">
          <p className="font-semibold">Plan confirmed locally.</p>
          <p className="mt-1 text-xs leading-5">Workflow {confirmation.workflowId} confirmed at {confirmation.confirmedAt}. Backend confirmation is still required before any testnet execution intent.</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={!eligibility.eligible} onClick={onConfirm} variant="primary">
          Approve dry-run plan
        </Button>
        <Button type="button" onClick={onAbandon} variant="ghost">
          Abandon current plan
        </Button>
      </div>
    </Panel>
  );
}
