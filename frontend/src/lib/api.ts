import type { OrchestratorResponse, PolicyDraft } from "@/types/assetpilot";
import { fallbackWorkflowResponse, marketSnapshot, portfolioBefore } from "./mockData";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

async function postJson<T>(path: string, body: unknown, fallback: T): Promise<{ data: T; usedFallback: boolean }> {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return { data: (await response.json()) as T, usedFallback: false };
  } catch {
    return { data: fallback, usedFallback: true };
  }
}

// V2 workflow API client. Prefer this for new UI code.
export async function runWorkflow(userGoal: string, policyDraft: PolicyDraft, wallet?: string) {
  return postJson<OrchestratorResponse>(
    "/api/workflow/run",
    {
      user_goal: userGoal,
      portfolio: portfolioBefore.map(({ symbol, valueUsd }) => ({ symbol, valueUsd })),
      market_snapshot: marketSnapshot,
      policy_draft: policyDraft,
      current_state: "draft_strategy",
      wallet,
      execution_mode: "dry_run"
    },
    fallbackWorkflowResponse
  );
}
