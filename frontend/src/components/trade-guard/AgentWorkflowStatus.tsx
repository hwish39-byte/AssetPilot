"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { PerplAgentWorkflowResponse } from "@/types/perpl";

const steps: Array<{ key: PerplAgentWorkflowResponse["state"] | "data_loaded"; label: string }> = [
  { key: "data_loaded", label: "Data loaded" },
  { key: "analyzed", label: "Analyzed" },
  { key: "strategy_generated", label: "Strategy generated" },
  { key: "risk_reviewed", label: "Risk reviewed" },
  { key: "dry_run_prepared", label: "Dry-run prepared" }
];

export function AgentWorkflowStatus({ result, isRunning, error, stale }: { result: PerplAgentWorkflowResponse | null; isRunning: boolean; error: unknown; stale: boolean }) {
  return (
    <section className="border border-slate-200 bg-white p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-950">Agent workflow</h2>
        {stale ? <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">workflow stale</span> : null}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {steps.map((step) => {
          const state = statusFor(step.key, result, isRunning, error);
          const Icon = state === "complete" ? CheckCircle2 : state === "running" ? Loader2 : state === "failed" ? XCircle : Circle;
          return (
            <li key={step.key} className="flex items-center gap-2 border-l border-slate-200 pl-3 text-sm">
              <Icon className={`h-4 w-4 ${state === "running" ? "animate-spin text-cyan-700" : state === "complete" ? "text-emerald-700" : state === "failed" ? "text-red-700" : "text-slate-400"}`} aria-hidden="true" />
              <span className="font-medium text-slate-700">{step.label}</span>
            </li>
          );
        })}
      </ol>
      {result ? <p className="mt-3 text-xs text-slate-600">Current returned state: <span className="font-mono font-semibold">{result.state}</span></p> : null}
      {isRunning ? <p className="mt-3 text-xs text-slate-600">Waiting for the backend workflow response. No synthetic step output is shown.</p> : null}
    </section>
  );
}

function statusFor(step: string, result: PerplAgentWorkflowResponse | null, isRunning: boolean, error: unknown) {
  if (error) return "failed";
  if (isRunning) return step === "data_loaded" ? "running" : "pending";
  if (!result) return "pending";
  if (result.state === "clarification_required" && ["data_loaded", "analyzed", "strategy_generated"].includes(step)) return "complete";
  if (result.state === "rejected" && ["data_loaded", "analyzed", "strategy_generated", "risk_reviewed"].includes(step)) return "complete";
  if (result.state === "dry_run_prepared") return "complete";
  return ["data_loaded", "analyzed", "strategy_generated", "risk_reviewed"].includes(step) ? "complete" : "pending";
}
