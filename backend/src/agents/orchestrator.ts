import type { LlmProvider } from "../llm.js";
import type {
  AgentName,
  AnalystAgentOutput,
  OrchestratorRequest,
  OrchestratorResponse,
  RiskReviewV2,
  StrategyAgentOutput,
  WorkflowState
} from "../types.js";
import { analyzePortfolioV2 } from "./analyst.js";
import { prepareExecutionPlan } from "./execution.js";
import { reviewRiskV2 } from "./risk.js";
import { generateStrategyV2 } from "./strategy.js";

export async function runWorkflow(input: OrchestratorRequest, llm: LlmProvider): Promise<OrchestratorResponse> {
  let currentState: WorkflowState = input.current_state ?? "draft_strategy";
  let analyseAgent: AnalystAgentOutput | null = null;
  let strategyAgent: StrategyAgentOutput | null = null;
  let riskAgent: RiskReviewV2 | null = null;

  try {
    analyseAgent = await analyzePortfolioV2(
      {
        portfolio: input.portfolio,
        marketSnapshot: input.market_snapshot,
        userGoal: input.user_goal
      },
      llm
    );
  } catch (error) {
    return failureResponse(currentState, "analyse", "retry", error, {
      analyseAgent,
      strategyAgent,
      riskAgent,
      executionAgent: null
    });
  }

  try {
    strategyAgent = await generateStrategyV2(
      {
        user_goal: input.user_goal,
        portfolio_snapshot: analyseAgent.portfolio_snapshot,
        risk_context: analyseAgent.risk_context,
        market_snapshot: input.market_snapshot,
        policy_draft: input.policy_draft,
        allowed_chains: ["monad-testnet"],
        allowed_protocols: ["mock_amm"],
        supported_actions: ["swap", "hold"]
      },
      llm
    );
  } catch (error) {
    return failureResponse(currentState, "strategy", "retry", error, {
      analyseAgent,
      strategyAgent,
      riskAgent,
      executionAgent: null
    });
  }

  if (strategyAgent.status === "need_clarification") {
    return {
      current_state: "draft_strategy",
      next_agent: "user",
      analyse_agent: analyseAgent,
      strategy_agent: strategyAgent,
      risk_agent: null,
      execution_agent: null,
      next_user_action: "clarify_goal",
      reason: strategyAgent.clarification_questions?.join(" ") ?? "Strategy Agent needs goal clarification."
    };
  }

  if (strategyAgent.status !== "generated" || strategyAgent.strategy === null) {
    return {
      current_state: "draft_strategy",
      next_agent: "strategy",
      analyse_agent: analyseAgent,
      strategy_agent: strategyAgent,
      risk_agent: null,
      execution_agent: null,
      next_user_action: "retry_strategy_generation",
      reason: strategyAgent.validation_errors?.join("; ") ?? "Strategy Agent did not generate a usable strategy."
    };
  }

  try {
    riskAgent = await reviewRiskV2(
      {
        strategy: strategyAgent.strategy,
        portfolio_snapshot: analyseAgent.portfolio_snapshot,
        risk_context: analyseAgent.risk_context,
        policy_draft: input.policy_draft,
        protocol_registry: input.protocol_registry,
        market_context: input.market_snapshot
      },
      llm
    );
    currentState = "risk_reviewed";
  } catch (error) {
    return failureResponse(currentState, "risk", "retry", error, {
      analyseAgent,
      strategyAgent,
      riskAgent,
      executionAgent: null
    });
  }

  try {
    const executionAgent = prepareExecutionPlan({
      strategy: strategyAgent.strategy,
      risk_review: riskAgent,
      wallet: input.wallet,
      execution_mode: input.execution_mode ?? "dry_run",
      market_snapshot: input.market_snapshot,
      chain_context: input.chain_context
    });

    if (riskAgent.decision === "reject") {
      return {
        current_state: "risk_reviewed",
        next_agent: "user",
        analyse_agent: analyseAgent,
        strategy_agent: strategyAgent,
        risk_agent: riskAgent,
        execution_agent: executionAgent,
        next_user_action: "revise_goal_or_policy",
        reason: riskAgent.human_readable_summary
      };
    }

    if (riskAgent.decision === "revise") {
      return {
        current_state: "risk_reviewed",
        next_agent: "strategy",
        analyse_agent: analyseAgent,
        strategy_agent: strategyAgent,
        risk_agent: riskAgent,
        execution_agent: executionAgent,
        next_user_action: "regenerate_strategy_with_risk_patch",
        reason: riskAgent.human_readable_summary
      };
    }

    if (executionAgent.status === "dry_run_prepared") {
      return {
        current_state: "payload_prepared",
        next_agent: "user",
        analyse_agent: analyseAgent,
        strategy_agent: strategyAgent,
        risk_agent: riskAgent,
        execution_agent: executionAgent,
        next_user_action: "review_execution_plan",
        reason: executionAgent.reason
      };
    }

    return {
      current_state: "risk_reviewed",
      next_agent: "execution",
      analyse_agent: analyseAgent,
      strategy_agent: strategyAgent,
      risk_agent: riskAgent,
      execution_agent: executionAgent,
      next_user_action: "fix_execution_plan",
      reason: executionAgent.reason
    };
  } catch (error) {
    return failureResponse(currentState, "execution", "retry", error, {
      analyseAgent,
      strategyAgent,
      riskAgent,
      executionAgent: null
    });
  }
}

function failureResponse(
  currentState: WorkflowState,
  nextAgent: AgentName,
  nextUserAction: string,
  error: unknown,
  agents: {
    analyseAgent: AnalystAgentOutput | null;
    strategyAgent: StrategyAgentOutput | null;
    riskAgent: RiskReviewV2 | null;
    executionAgent: OrchestratorResponse["execution_agent"];
  }
): OrchestratorResponse {
  return {
    current_state: currentState,
    next_agent: nextAgent,
    analyse_agent: agents.analyseAgent,
    strategy_agent: agents.strategyAgent,
    risk_agent: agents.riskAgent,
    execution_agent: agents.executionAgent,
    next_user_action: nextUserAction,
    reason: safeErrorMessage(error)
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Workflow failed with an unknown error.";
}
