import type {
  GenerateStrategyRequest,
  GenerateStrategyV2Request,
  Strategy,
  StrategyAction,
  StrategyActionV2,
  StrategyAgentOutput,
  StrategyJson
} from "../types.js";
import {
  expectedBuyAmountFor,
  getPrices,
  getSnapshotHash,
  minBuyAmount,
  parsePercent,
  round
} from "../utils.js";
import type { LlmProvider } from "../llm.js";
import { assertStrategy, validateStrategy } from "../validation.js";
import { validateStrategyJsonV2 } from "../validation.js";

/**
 * @deprecated Legacy MVP endpoint helper. New code should use generateStrategyV2 via runWorkflow.
 */
export async function generateStrategy(input: GenerateStrategyRequest, llm: LlmProvider): Promise<Strategy> {
  const llmStrategy = await llm.generateJson<Strategy>(
    [
      "You are AssetPilot Strategy Agent.",
      "Return only stable JSON matching the AssetPilot strategy schema.",
      "Respect policyDraft exactly: no blocked assets, only allowed assets, max spend, max single trade, and max slippage.",
      "Do not add commentary."
    ].join(" "),
    input
  );

  if (llmStrategy && validateStrategy(llmStrategy).length === 0) {
    return assertStrategy(llmStrategy);
  }

  return fallbackStrategy(input);
}

export async function generateStrategyV2(
  input: GenerateStrategyV2Request,
  llm: LlmProvider
): Promise<StrategyAgentOutput> {
  const llmStrategy = await llm.generateJson<StrategyJson>(
    [
      "You are AssetPilot Strategy Agent.",
      "Return only valid JSON matching StrategyJson.",
      "Do not generate calldata.",
      "Do not request signatures.",
      "Do not perform risk approval.",
      "Do not use protocols, chains, assets, or actions outside the supplied registries.",
      "Respect hard constraints from risk_context.constraints_for_strategy.",
      "Each action must include rationale.",
      "If the goal is unclear, return no strategy through fallback logic rather than inventing unsafe intent."
    ].join(" "),
    input
  );

  if (llmStrategy) {
    const validationErrors = [
      ...validateStrategyJsonV2(llmStrategy),
      ...validateStrategyAgainstInput(llmStrategy, input)
    ];
    if (validationErrors.length === 0) {
      return { strategy: llmStrategy, status: "generated" };
    }

    const fallback = fallbackStrategyV2(input);
    const fallbackErrors = validateStrategyJsonV2(fallback);
    if (fallbackErrors.length === 0) {
      return { strategy: fallback, status: "generated", validation_errors: validationErrors };
    }
    return { strategy: null, status: "failed", validation_errors: [...validationErrors, ...fallbackErrors] };
  }

  const fallback = fallbackStrategyV2(input);
  const fallbackErrors = validateStrategyJsonV2(fallback);
  if (fallbackErrors.length > 0) {
    return { strategy: null, status: "failed", validation_errors: fallbackErrors };
  }

  return { strategy: fallback, status: "generated" };
}

function fallbackStrategy(input: GenerateStrategyRequest): Strategy {
  const prices = getPrices(input.marketSnapshot);
  const policy = input.policyDraft;
  const userGoal = input.userGoal.toLowerCase();
  const wantsAiReduction = userGoal.includes("降低 ai") || userGoal.includes("集中风险") || userGoal.includes("concentration");
  const actions: StrategyAction[] = [];
  let remainingSpend = policy.maxSpendUsd;

  const addAction = (actionType: "SELL" | "BUY", sellToken: string, buyToken: string, preferredUsd: number) => {
    if (remainingSpend <= 0) return;
    if (!policy.allowedAssets.includes(sellToken) || !policy.allowedAssets.includes(buyToken)) return;
    if (policy.blockedAssets.includes(sellToken) || policy.blockedAssets.includes(buyToken)) return;
    const sellAmountUsd = round(Math.min(preferredUsd, policy.maxSingleTradeUsd, remainingSpend), 2);
    if (sellAmountUsd <= 0) return;
    const expectedBuyAmount = expectedBuyAmountFor(sellAmountUsd, buyToken, prices);
    actions.push({
      actionType,
      sellToken,
      buyToken,
      sellAmountUsd,
      expectedBuyAmount,
      minBuyAmount: minBuyAmount(expectedBuyAmount, policy.maxSlippageBps)
    });
    remainingSpend = round(remainingSpend - sellAmountUsd, 2);
  };

  if (wantsAiReduction) {
    addAction("SELL", "mNVDA", "USDC", 300);
    addAction("BUY", "USDC", "mSPY", 200);
  }

  if (actions.length === 0) {
    const sellToken = policy.allowedAssets.find((asset) => asset !== "USDC" && !policy.blockedAssets.includes(asset)) ?? "mNVDA";
    const buyToken = policy.allowedAssets.includes("USDC") && !policy.blockedAssets.includes("USDC") ? "USDC" : policy.allowedAssets[0];
    addAction("SELL", sellToken, buyToken, Math.min(100, policy.maxSpendUsd, policy.maxSingleTradeUsd));
  }

  const riskBefore = input.analystResult.riskScore;
  const riskAfter = Math.max(1, riskBefore - (actions.length > 1 ? 21 : 12));
  const aiBefore = parsePercent(input.analystResult.aiExposure);
  const aiAfter = Math.max(0, aiBefore - (actions.some((action) => action.sellToken === "mNVDA") ? 18 : 8));

  return {
    goal: wantsAiReduction ? "降低 AI 股票集中风险" : "按用户目标调整投资组合",
    marketSnapshotHash: getSnapshotHash(input.marketSnapshot),
    actions,
    expectedImpact: {
      riskScoreBefore: riskBefore,
      riskScoreAfter: riskAfter,
      aiExposureBefore: input.analystResult.aiExposure,
      aiExposureAfter: `${Math.round(aiAfter)}%`,
      cashBufferBefore: "8%",
      cashBufferAfter: actions.some((action) => action.buyToken === "USDC") ? "15%" : "10%"
    }
  };
}

function fallbackStrategyV2(input: GenerateStrategyV2Request): StrategyJson {
  const policy = input.policy_draft;
  const allowedChains = input.allowed_chains?.length ? input.allowed_chains : ["monad-testnet"];
  const allowedProtocols = input.allowed_protocols?.length ? input.allowed_protocols : ["mock_amm"];
  const chain = allowedChains[0];
  const protocol = allowedProtocols[0];
  const canSwap = !input.supported_actions || input.supported_actions.includes("swap");
  const wantsAiReduction = wantsAiConcentrationReduction(input.user_goal);
  const actions: StrategyActionV2[] = [];
  let remainingSpend = policy.maxSpendUsd;

  const addSwap = (
    action_id: string,
    from_asset: string,
    to_asset: string,
    preferredUsd: number,
    expectedEffects: string[],
    rationale: string
  ) => {
    if (!canSwap || remainingSpend <= 0) return;
    if (!isAllowedAsset(from_asset, policy.allowedAssets, policy.blockedAssets)) return;
    if (!isAllowedAsset(to_asset, policy.allowedAssets, policy.blockedAssets)) return;
    const value = round(Math.min(preferredUsd, policy.maxSingleTradeUsd, remainingSpend), 2);
    if (value <= 0) return;
    actions.push({
      action_id,
      type: "swap",
      chain,
      protocol,
      from_asset,
      to_asset,
      asset: null,
      amount: {
        mode: "usd_value",
        value,
        unit: "USD"
      },
      constraints: {
        max_slippage_bps: policy.maxSlippageBps
      },
      preconditions: [
        `${from_asset} is allowed by policy`,
        `${to_asset} is allowed by policy`
      ],
      expected_effects: expectedEffects,
      rationale
    });
    remainingSpend = round(remainingSpend - value, 2);
  };

  if (wantsAiReduction) {
    const actionCountBeforeReduction = actions.length;
    addSwap(
      "act_1_reduce_mnvda",
      "mNVDA",
      "USDC",
      300,
      ["Reduce mNVDA concentration", "Increase stablecoin buffer"],
      "mNVDA is the largest AI-linked position"
    );
    if (actions.length > actionCountBeforeReduction) {
      addSwap(
        "act_2_rebalance_to_mspy",
        "USDC",
        "mSPY",
        200,
        ["Keep broad market exposure", "Reduce single asset concentration"],
        "mSPY keeps broad market exposure after reducing AI-linked concentration"
      );
    }
  }

  if (actions.length === 0) {
    actions.push(buildHoldAction(chain));
  }

  return {
    strategy_id: actions[0]?.type === "hold" ? "strategy_hold_unclear_goal_mock" : "strategy_rebalance_ai_concentration_mock",
    objective: {
      type: actions[0]?.type === "hold" ? "custom" : "rebalance",
      description:
        actions[0]?.type === "hold"
          ? "Hold portfolio because the user goal is not specific enough for an active strategy"
          : "Reduce AI concentration while keeping broad market exposure"
    },
    constraints: {
      max_slippage_bps: policy.maxSlippageBps,
      max_gas_usd: null,
      min_stablecoin_ratio: inferConstraintNumber(input.risk_context.constraints_for_strategy, "stablecoin_ratio_after"),
      max_single_asset_ratio: inferConstraintNumber(input.risk_context.constraints_for_strategy, "max_single_asset_ratio"),
      allowed_chains: allowedChains,
      allowed_protocols: allowedProtocols,
      denied_assets: policy.blockedAssets
    },
    actions,
    success_criteria: {
      risk_score_after: "<= current risk score",
      stablecoin_ratio_after: ">= current stablecoin ratio"
    },
    assumptions: [
      "MVP uses mock tokenized assets",
      "Execution will be reviewed by Risk Agent before any payload is prepared"
    ]
  };
}

function buildHoldAction(chain: string): StrategyActionV2 {
  return {
    action_id: "act_1_hold",
    type: "hold",
    chain,
    protocol: null,
    from_asset: null,
    to_asset: null,
    asset: null,
    amount: {
      mode: "none",
      value: null,
      unit: null
    },
    constraints: {},
    preconditions: [],
    expected_effects: ["No portfolio change"],
    rationale: "User goal is not specific enough for an active strategy"
  };
}

function wantsAiConcentrationReduction(userGoal: string): boolean {
  const normalizedGoal = userGoal.toLowerCase();
  return (
    normalizedGoal.includes("降低 ai") ||
    normalizedGoal.includes("集中风险") ||
    normalizedGoal.includes("concentration") ||
    normalizedGoal.includes("reduce")
  );
}

function isAllowedAsset(asset: string, allowedAssets: string[], blockedAssets: string[]): boolean {
  return allowedAssets.includes(asset) && !blockedAssets.includes(asset);
}

function validateStrategyAgainstInput(strategy: StrategyJson, input: GenerateStrategyV2Request): string[] {
  const errors: string[] = [];
  const allowedChains = input.allowed_chains?.length ? input.allowed_chains : ["monad-testnet"];
  const allowedProtocols = input.allowed_protocols?.length ? input.allowed_protocols : ["mock_amm"];

  strategy.actions.forEach((action, index) => {
    const actionPath = `strategy.actions[${index}]`;
    if (input.supported_actions && !input.supported_actions.includes(action.type)) {
      errors.push(`${actionPath}.type is not supported by this request`);
    }
    if (action.chain === null || !allowedChains.includes(action.chain)) {
      errors.push(`${actionPath}.chain is not allowed by this request`);
    }
    if (action.protocol !== null && !allowedProtocols.includes(action.protocol)) {
      errors.push(`${actionPath}.protocol is not allowed by this request`);
    }
    for (const asset of [action.from_asset, action.to_asset, action.asset]) {
      if (asset !== null && !isAllowedAsset(asset, input.policy_draft.allowedAssets, input.policy_draft.blockedAssets)) {
        errors.push(`${actionPath} uses an asset outside policy`);
      }
    }
  });

  return errors;
}

function inferConstraintNumber(
  constraints: GenerateStrategyV2Request["risk_context"]["constraints_for_strategy"],
  name: string
): number | null {
  const constraint = constraints.find((item) => item.constraint.includes(name));
  if (!constraint) return null;
  const match = constraint.constraint.match(/[-+]?\d*\.?\d+/);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}
