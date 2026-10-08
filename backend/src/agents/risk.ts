import type { LlmProvider } from "../llm.js";
import type {
  JsonPatchOperation,
  RejectionReason,
  ReviewRiskRequest,
  ReviewRiskV2Request,
  RiskIssue,
  RiskReview,
  RiskReviewV2,
  StrategyAction,
  StrategyActionType,
  StrategyActionV2
} from "../types.js";
import { clamp, minBuyAmount, totalSellAmount } from "../utils.js";
import { validateRiskReviewV2, validateStrategyJsonV2 } from "../validation.js";

const rejectionDetails: Record<RejectionReason, string> = {
  SELL_TOKEN_NOT_ALLOWED: "策略尝试卖出不在白名单中的资产。",
  BUY_TOKEN_NOT_ALLOWED: "策略尝试买入不在白名单中的资产。",
  SELL_TOKEN_BLOCKED: "策略尝试卖出黑名单资产。",
  BUY_TOKEN_BLOCKED: "策略尝试买入黑名单资产。",
  MAX_SPEND_EXCEEDED: "策略总交易金额超过策略上限。",
  MAX_SINGLE_TRADE_EXCEEDED: "策略中的单笔交易金额超过上限。",
  SLIPPAGE_TOO_HIGH: "策略的 minBuyAmount 低于策略允许的最小滑点保护。"
};

const supportedActionTypes: StrategyActionType[] = ["swap", "deposit", "withdraw", "hold"];
const hiddenLeverageActionTypes: StrategyActionType[] = ["borrow", "provide_liquidity", "bridge"];

/**
 * @deprecated Legacy MVP endpoint helper. New code should use reviewRiskV2 via runWorkflow.
 */
export async function reviewRisk(
  input: ReviewRiskRequest,
  llm: LlmProvider,
  options: { skipLlmNotes?: boolean } = {}
): Promise<RiskReview> {
  const rejection = firstRejection(input);
  if (rejection) {
    return {
      status: "REJECTED",
      reason: rejection,
      details: rejectionDetails[rejection]
    };
  }

  const llmNotes = options.skipLlmNotes
    ? null
    : await llm.generateJson<string[]>(
        "You are AssetPilot Risk Agent. Return a JSON array of three short Chinese approval notes. No markdown.",
        input
      );

  return {
    status: "APPROVED",
    riskScoreBefore: input.analystResult.riskScore,
    riskScoreAfter: input.strategy.expectedImpact.riskScoreAfter,
    notes:
      Array.isArray(llmNotes) && llmNotes.every((note) => typeof note === "string")
        ? llmNotes
        : ["mNVDA 集中度降低", "AI 敞口降低", "USDC 缓冲提高"],
    warnings: []
  };
}

export async function reviewRiskV2(
  input: ReviewRiskV2Request,
  llm: LlmProvider,
  options: { skipLlmSummary?: boolean } = {}
): Promise<RiskReviewV2> {
  if (strategyContainsCalldata(input.strategy)) {
    return safeValidatedReview({
      decision: "reject",
      risk_score: 100,
      blocking_issues: [
        issue(
          "DIRECT_CALLDATA_NOT_ALLOWED",
          "critical",
          "Strategy Agent must not generate calldata; Execution Agent owns payload preparation.",
          "Regenerate StrategyJson without calldata."
        )
      ],
      warnings: [],
      approved_action_ids: [],
      revised_strategy_patch: [],
      human_readable_summary: "策略包含 calldata，已拒绝。"
    });
  }

  const strategyErrors = validateStrategyJsonV2(input.strategy);
  if (strategyErrors.length > 0) {
    return safeValidatedReview({
      decision: "reject",
      risk_score: 100,
      blocking_issues: [
        issue(
          "INVALID_STRATEGY_SCHEMA",
          "critical",
          strategyErrors.join("; "),
          "Regenerate StrategyJson using the v2 schema."
        )
      ],
      warnings: [],
      approved_action_ids: [],
      revised_strategy_patch: [],
      human_readable_summary: "策略 JSON 不符合 V2 schema，已拒绝。"
    });
  }

  const blockingIssues: RiskIssue[] = [];
  const warnings: RiskIssue[] = [];
  const revisedStrategyPatch: JsonPatchOperation[] = [];
  let totalUsdSpend = 0;

  const pushBlocking = (code: string, severity: "medium" | "high" | "critical", message: string, suggested_fix?: string) => {
    blockingIssues.push(issue(code, severity, message, suggested_fix));
  };
  const pushWarning = (code: string, severity: "low" | "medium" | "high", message: string) => {
    warnings.push(warning(code, severity, message));
  };

  if (input.strategy.constraints.max_slippage_bps !== undefined &&
      input.strategy.constraints.max_slippage_bps > input.policy_draft.maxSlippageBps) {
    pushBlocking(
      "SLIPPAGE_TOO_HIGH",
      "high",
      "Strategy max_slippage_bps exceeds policy maxSlippageBps.",
      "Reduce strategy.constraints.max_slippage_bps to policy limit."
    );
  }

  for (const action of input.strategy.actions) {
    const actionRecord = action as StrategyActionV2 & Record<string, unknown>;

    if (!supportedActionTypes.includes(action.type)) {
      pushBlocking("UNSUPPORTED_ACTION", "high", `Action ${action.action_id} type ${action.type} is not supported.`);
    }
    if (hiddenLeverageActionTypes.includes(action.type)) {
      pushBlocking(
        "HIDDEN_LEVERAGE",
        "critical",
        `Action ${action.action_id} type ${action.type} is not supported in MVP risk rules.`,
        "Use swap/hold in MVP or add explicit protocol adapter and risk rules."
      );
    }
    if (!input.strategy.constraints.allowed_chains?.includes(action.chain ?? "")) {
      pushBlocking("UNKNOWN_CHAIN", "high", `Action ${action.action_id} uses unknown chain ${action.chain ?? "null"}.`);
    }
    if (action.protocol !== null && !input.strategy.constraints.allowed_protocols?.includes(action.protocol)) {
      pushBlocking("UNKNOWN_PROTOCOL", "high", `Action ${action.action_id} uses unknown protocol ${action.protocol}.`);
    }
    if ("calldata" in actionRecord) {
      pushBlocking(
        "DIRECT_CALLDATA_NOT_ALLOWED",
        "critical",
        "Strategy Agent must not generate calldata; Execution Agent owns payload preparation."
      );
    }

    for (const asset of actionAssets(action)) {
      if (isDeniedAsset(asset, input.strategy.constraints.denied_assets, input.policy_draft.blockedAssets)) {
        pushBlocking("DENIED_ASSET", "critical", `Action ${action.action_id} uses denied asset ${asset}.`);
      }
      if (action.type !== "hold" && !input.policy_draft.allowedAssets.includes(asset)) {
        pushBlocking("ASSET_NOT_ALLOWED_BY_POLICY", "high", `Action ${action.action_id} uses asset ${asset} outside policy.`);
      }
    }

    const actionSlippage = action.constraints.max_slippage_bps;
    if (typeof actionSlippage === "number" && actionSlippage > input.policy_draft.maxSlippageBps) {
      pushBlocking(
        "SLIPPAGE_TOO_HIGH",
        "high",
        `Action ${action.action_id} max_slippage_bps exceeds policy maxSlippageBps.`,
        "Reduce action constraints max_slippage_bps to policy limit."
      );
    }
    if (action.amount.mode === "usd_value" && typeof action.amount.value === "number") {
      totalUsdSpend += action.amount.value;
      if (action.amount.value > input.policy_draft.maxSingleTradeUsd) {
        pushBlocking(
          "MAX_SINGLE_TRADE_EXCEEDED",
          "high",
          `Action ${action.action_id} amount exceeds maxSingleTradeUsd.`,
          "Split into smaller actions or lower amount."
        );
      }
    }
  }

  if (totalUsdSpend > input.policy_draft.maxSpendUsd) {
    pushBlocking("MAX_SPEND_EXCEEDED", "high", "Total usd_value action amount exceeds maxSpendUsd.");
  }

  for (const constraint of input.risk_context.constraints_for_strategy.filter((item) => item.hard)) {
    if (constraint.constraint.includes("do_not_buy mTSLA")) {
      const violatesMtsla = input.strategy.actions.some((action) => action.to_asset === "mTSLA" || action.asset === "mTSLA");
      if (violatesMtsla) {
        pushBlocking("HARD_ANALYST_CONSTRAINT_VIOLATION", "critical", "Strategy violates hard analyst constraint do_not_buy mTSLA.");
      }
    }
  }

  if (
    input.strategy.constraints.max_single_asset_ratio == null &&
    hasAnalystConstraint(input, "max_single_asset_ratio <= 0.40")
  ) {
    revisedStrategyPatch.push({ op: "replace", path: "/constraints/max_single_asset_ratio", value: 0.4 });
  }
  if (
    input.strategy.constraints.min_stablecoin_ratio == null &&
    hasAnalystConstraint(input, "stablecoin_ratio_after >= 0.15")
  ) {
    revisedStrategyPatch.push({ op: "replace", path: "/constraints/min_stablecoin_ratio", value: 0.15 });
  }

  if (input.risk_context.risk_level === "high" || input.risk_context.risk_level === "critical") {
    pushWarning("HIGH_RISK_CONTEXT", "high", `Analyst risk context is ${input.risk_context.risk_level}.`);
  }
  if (input.portfolio_snapshot.stablecoin_ratio < 0.15) {
    pushWarning("LOW_STABLECOIN_BUFFER", "medium", "Portfolio stablecoin ratio is below 15%.");
  }
  if (
    (input.portfolio_snapshot.largest_position?.weight ?? 0) >= 0.45 &&
    !successCriteriaMentionsConcentration(input.strategy.success_criteria)
  ) {
    pushWarning("CONCENTRATION_REMAINS", "medium", "Strategy success criteria does not explicitly address concentration risk.");
  }

  const decision = blockingIssues.length > 0 ? "reject" : revisedStrategyPatch.length > 0 ? "revise" : "approve";
  const approvedActionIds = decision === "approve" ? input.strategy.actions.map((action) => action.action_id) : [];
  const riskScore = calculateRiskScore(input.risk_context.risk_level, warnings.length, revisedStrategyPatch.length, decision);
  const fallbackSummary = summaryForDecision(decision);
  const llmSummary = options.skipLlmSummary
    ? null
    : await llm.generateText(
        [
          "You are AssetPilot Risk Agent.",
          "Explain the risk review in one concise Chinese sentence.",
          "Do not approve anything not already approved by rule engine.",
          "Do not suggest bypassing policy."
        ].join(" "),
        { decision, riskScore, blockingIssues, warnings, revisedStrategyPatch }
      );

  return safeValidatedReview({
    decision,
    risk_score: riskScore,
    blocking_issues: blockingIssues,
    warnings,
    approved_action_ids: approvedActionIds,
    revised_strategy_patch: revisedStrategyPatch,
    human_readable_summary: llmSummary ?? fallbackSummary
  });
}

function firstRejection(input: ReviewRiskRequest): RejectionReason | null {
  for (const action of input.strategy.actions) {
    const assetRejection = checkAssets(action, input.policy.allowedAssets, input.policy.blockedAssets);
    if (assetRejection) return assetRejection;
  }

  if (totalSellAmount(input.strategy.actions) > input.policy.maxSpendUsd) return "MAX_SPEND_EXCEEDED";

  for (const action of input.strategy.actions) {
    if (action.sellAmountUsd > input.policy.maxSingleTradeUsd) return "MAX_SINGLE_TRADE_EXCEEDED";
    const minAllowed = minBuyAmount(action.expectedBuyAmount, input.policy.maxSlippageBps);
    if (action.minBuyAmount < minAllowed) return "SLIPPAGE_TOO_HIGH";
  }

  return null;
}

function checkAssets(action: StrategyAction, allowedAssets: string[], blockedAssets: string[]): RejectionReason | null {
  if (!allowedAssets.includes(action.sellToken)) return "SELL_TOKEN_NOT_ALLOWED";
  if (!allowedAssets.includes(action.buyToken)) return "BUY_TOKEN_NOT_ALLOWED";
  if (blockedAssets.includes(action.sellToken)) return "SELL_TOKEN_BLOCKED";
  if (blockedAssets.includes(action.buyToken)) return "BUY_TOKEN_BLOCKED";
  return null;
}

function issue(
  code: string,
  severity: "medium" | "high" | "critical",
  message: string,
  suggested_fix: string | null = null
): RiskIssue {
  return { code, severity, message, suggested_fix };
}

function warning(code: string, severity: "low" | "medium" | "high", message: string): RiskIssue {
  return { code, severity, message };
}

function actionAssets(action: StrategyActionV2): string[] {
  return [action.from_asset, action.to_asset, action.asset].filter((asset): asset is string => !!asset);
}

function strategyContainsCalldata(strategy: ReviewRiskV2Request["strategy"]): boolean {
  return strategy.actions.some((action) => "calldata" in (action as StrategyActionV2 & Record<string, unknown>));
}

function isDeniedAsset(asset: string, deniedAssets: string[] | undefined, blockedAssets: string[]): boolean {
  return !!deniedAssets?.includes(asset) || blockedAssets.includes(asset);
}

function hasAnalystConstraint(input: ReviewRiskV2Request, constraint: string): boolean {
  return input.risk_context.constraints_for_strategy.some((item) => item.constraint.includes(constraint));
}

function successCriteriaMentionsConcentration(successCriteria: Record<string, string>): boolean {
  return Object.entries(successCriteria).some(([key, value]) => {
    const text = `${key} ${value}`.toLowerCase();
    return text.includes("single") || text.includes("concentration") || text.includes("risk");
  });
}

function calculateRiskScore(
  riskLevel: ReviewRiskV2Request["risk_context"]["risk_level"],
  warningCount: number,
  patchCount: number,
  decision: RiskReviewV2["decision"]
): number {
  const levelScore = riskLevel === "critical" ? 45 : riskLevel === "high" ? 30 : riskLevel === "medium" ? 15 : 0;
  const warningScore = Math.min(warningCount * 10, 20);
  const reviseScore = patchCount > 0 ? 25 : 0;
  const rejectScore = decision === "reject" ? 70 : 0;
  return Math.round(clamp(30 + levelScore + warningScore + reviseScore + rejectScore, 0, 100));
}

function summaryForDecision(decision: RiskReviewV2["decision"]): string {
  if (decision === "approve") return "策略通过规则风控审核，可进入 Execution Agent 准备 dry-run。";
  if (decision === "revise") return "策略需要按风控建议修订后再进入执行准备。";
  return "策略违反硬性风控或用户约束，已拒绝。";
}

function safeValidatedReview(result: RiskReviewV2): RiskReviewV2 {
  const errors = validateRiskReviewV2(result);
  if (errors.length === 0) return result;

  const safeReject: RiskReviewV2 = {
    decision: "reject",
    risk_score: 100,
    blocking_issues: [
      issue(
        "INVALID_RISK_REVIEW_OUTPUT",
        "critical",
        errors.join("; "),
        "Fix Risk Agent output schema."
      )
    ],
    warnings: [],
    approved_action_ids: [],
    revised_strategy_patch: [],
    human_readable_summary: "Risk Agent 输出不符合 schema，已安全拒绝。"
  };
  return validateRiskReviewV2(safeReject).length === 0 ? safeReject : result;
}
