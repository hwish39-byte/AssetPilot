import type { LlmProvider } from "../../llm.js";
import { OpenAiProvider } from "../../llm.js";
import { simulatePerplRisk } from "../../risk/simulator.js";
import { PerplRiskService } from "../../risk/perplRiskService.js";
import type { PerplRiskSimulationResult } from "../../risk/perplRiskTypes.js";
import { analyzePerplRisk } from "./analyst.js";
import { preparePerplDryRunExecution } from "./execution.js";
import { reviewPerplStrategy } from "./riskReviewer.js";
import { generatePerplStrategy } from "./strategy.js";
import {
  PERPL_AGENT_METHODOLOGY_VERSION,
  toSimulationAction,
  type PerplAgentRiskReview,
  type PerplAgentWorkflowRequest,
  type PerplAgentWorkflowResponse,
  type PerplExecutionOutput
} from "./types.js";
import { validateStrategyOutput } from "./validation.js";

export interface PerplAgentWorkflowDeps {
  perplRiskService?: Pick<PerplRiskService, "getRiskInputs">;
  llm?: LlmProvider;
  now?: () => Date;
}

export async function runPerplAgentWorkflow(
  request: PerplAgentWorkflowRequest,
  deps: PerplAgentWorkflowDeps = {}
): Promise<PerplAgentWorkflowResponse> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const perplRiskService = deps.perplRiskService ?? new PerplRiskService();
  const llm = deps.llm ?? new OpenAiProvider();
  const { bundle, markets, snapshot } = await perplRiskService.getRiskInputs();
  const analyst = await analyzePerplRisk(snapshot, llm);
  const strategy = await generatePerplStrategy({
    userGoal: request.userGoal,
    policy: request.policy,
    riskSnapshot: snapshot,
    analyst,
    positions: bundle.positions,
    orders: bundle.orders,
    markets,
    llm
  });
  const validationErrors = validateStrategyOutput(strategy);
  if (validationErrors.length > 0) strategy.validationErrors.push(...validationErrors);

  const simulation = strategy.status === "generated" ? runSimulationSafely(strategy.actions.map(toSimulationAction), snapshot, bundle, markets) : null;
  const riskReview = reviewPerplStrategy({
    strategy,
    policy: request.policy,
    riskSnapshot: snapshot,
    positions: bundle.positions,
    orders: bundle.orders,
    markets,
    simulation
  });
  const execution = preparePerplDryRunExecution(strategy, riskReview);
  const completedAt = now().toISOString();

  return {
    workflowId: `perpl_wf_${Date.parse(startedAt) || Date.now()}`,
    state: stateFor(strategy.status, riskReview, execution),
    startedAt,
    completedAt,
    source: "assetpilot",
    network: "monad-testnet",
    methodologyVersion: PERPL_AGENT_METHODOLOGY_VERSION,
    dataFreshness: {
      riskCalculatedAt: snapshot.calculatedAt,
      walletFetchedAt: bundle.wallet.fetchedAt,
      marketFetchedAt: markets[0]?.fetchedAt ?? null
    },
    riskSnapshot: snapshot,
    analyst,
    strategy,
    simulation,
    riskReview,
    execution,
    nextUserAction: nextUserAction(riskReview, execution),
    warnings: [
      ...snapshot.dataQuality.warnings,
      ...strategy.validationErrors,
      ...riskReview.warnings.map((warning) => warning.message)
    ]
  };
}

function runSimulationSafely(
  actions: Array<ReturnType<typeof toSimulationAction>>,
  ...args: Parameters<typeof simulatePerplRisk> extends [infer A, infer B, infer C, infer _D] ? [A, B, C] : never
): PerplRiskSimulationResult | null {
  if (actions.some((action) => action === null)) return null;
  try {
    return simulatePerplRisk(args[0], args[1], args[2], { actions: actions as NonNullable<(typeof actions)[number]>[] });
  } catch {
    return null;
  }
}

function stateFor(
  strategyStatus: string,
  review: PerplAgentRiskReview,
  execution: PerplExecutionOutput
): PerplAgentWorkflowResponse["state"] {
  if (strategyStatus === "clarification_required") return "clarification_required";
  if (review.decision === "reject" || review.decision === "revise") return "rejected";
  if (execution.status === "dry_run_prepared") return "dry_run_prepared";
  return "risk_reviewed";
}

function nextUserAction(review: PerplAgentRiskReview, execution: PerplExecutionOutput): string {
  if (execution.status === "dry_run_prepared") return "Review the dry-run descriptors and decide manually whether to act in Perpl.";
  if (review.decision === "revise") return "Revise policy or requested action scope, then rerun the dry-run workflow.";
  return "Resolve blocking risk review issues before considering any Perpl action.";
}
