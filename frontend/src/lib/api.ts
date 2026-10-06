import type { AnalystResult, PolicyDraft, RiskReview, Strategy } from "@/types/assetpilot";
import { fallbackAnalyst, fallbackRiskReview, fallbackStrategy, marketSnapshot, portfolioBefore } from "./mockData";

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

export async function analyze(userGoal: string) {
  return postJson<AnalystResult>(
    "/api/analyze",
    {
      portfolio: portfolioBefore.map(({ symbol, valueUsd }) => ({ symbol, valueUsd })),
      marketSnapshot: marketSnapshot.prices,
      userGoal
    },
    fallbackAnalyst
  );
}

export async function generateStrategy(userGoal: string, analystResult: AnalystResult, policyDraft: PolicyDraft) {
  return postJson<Strategy>(
    "/api/generate-strategy",
    {
      userGoal,
      analystResult,
      marketSnapshot,
      policyDraft
    },
    fallbackStrategy
  );
}

export async function reviewRisk(strategy: Strategy, policy: PolicyDraft, analystResult: AnalystResult) {
  const rejectedFallback: RiskReview = {
    status: "REJECTED",
    reason: "BUY_TOKEN_NOT_ALLOWED",
    details: "策略尝试买入不在白名单中的资产。"
  };
  const wantsRejectedDemo = strategy.actions.some((action) => action.buyToken === "mTSLA");
  return postJson<RiskReview>(
    "/api/review-risk",
    { strategy, policy, analystResult },
    wantsRejectedDemo ? rejectedFallback : fallbackRiskReview
  );
}

export async function executionSummary(body: unknown) {
  return postJson("/api/execution-summary", body, {
    status: "EXECUTED",
    summary: "策略已执行，风险评分从 82 降低到 61。",
    txHash: undefined
  });
}
