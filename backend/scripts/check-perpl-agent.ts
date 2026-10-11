import "dotenv/config";
import { OpenAiProvider } from "../src/llm.js";
import { runPerplAgentWorkflow } from "../src/agents/perpl/orchestrator.js";
import type { PerplAgentPolicy } from "../src/agents/perpl/types.js";
import { PerplRiskService } from "../src/risk/perplRiskService.js";

async function main(): Promise<void> {
  const riskService = new PerplRiskService();
  const inputs = await riskService.getRiskInputs({ historyCount: 20 });
  const allowedAccountIds = inputs.snapshot.accountIds;
  const allowedMarketIds = inputs.markets.map((market) => market.id);
  const policy: PerplAgentPolicy = {
    allowedAccountIds,
    allowedMarketIds,
    allowedActions: ["reduce_position", "close_position", "cancel_order", "add_collateral", "hold"],
    maxActionsPerStrategy: 2,
    maxLeverage: 5,
    maxOrderNotionalUsd: "10000",
    maxTotalNotionalUsd: "15000",
    maxSlippageBps: 100,
    maxReductionPercentage: 0.25,
    allowIncreaseExposure: false,
    requireSimulation: true,
    requireRiskImprovement: true,
    minimumRiskScoreImprovement: 0,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString()
  };

  const result = await runPerplAgentWorkflow(
    {
      userGoal: "Reduce current Perpl testnet account risk without adding exposure.",
      policy,
      mode: "dry_run",
      preferredLanguage: "en"
    },
    { perplRiskService: riskService, llm: new OpenAiProvider() }
  );

  console.log(
    [
      "perpl agent: ok",
      `state=${result.state}`,
      `risk_level=${result.riskSnapshot.riskLevel}`,
      `score=${result.riskSnapshot.score ?? "null"}`,
      `coverage=${result.riskSnapshot.scoreCoveragePercent}`,
      `positions=${result.riskSnapshot.walletMetrics.openPositionCount}`,
      `orders=${result.riskSnapshot.walletMetrics.openOrderCount}`,
      `strategy_status=${result.strategy.status}`,
      `actions=${result.strategy.actions.map((action) => action.type).join(",") || "none"}`,
      `review=${result.riskReview.decision}`,
      `before=${result.riskReview.riskScoreBefore ?? "null"}`,
      `after=${result.riskReview.riskScoreAfter ?? "null"}`,
      `execution=${result.execution.status}`
    ].join(" ")
  );
}

main().catch((error) => {
  const status = typeof error === "object" && error && "statusCode" in error ? (error as { statusCode?: unknown }).statusCode : "error";
  const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : "UNKNOWN";
  console.error(`perpl agent: failed status=${status} code=${code}`);
  process.exitCode = 1;
});
