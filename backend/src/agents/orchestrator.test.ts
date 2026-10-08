import assert from "node:assert/strict";
import test from "node:test";
import { analyzePortfolio } from "./analyst.js";
import { executionSummary, prepareExecutionPlan } from "./execution.js";
import { buildMockAmmContractPayload } from "./executionAdapters.js";
import { runWorkflow } from "./orchestrator.js";
import { reviewRisk, reviewRiskV2 } from "./risk.js";
import { generateStrategy } from "./strategy.js";
import type { LlmProvider } from "../llm.js";
import type { AnalystResult, PolicyDraft, PortfolioItem, RiskContext, RiskReviewV2, Strategy, StrategyJson } from "../types.js";

const nullLlm: LlmProvider = {
  async generateJson() {
    return null;
  },
  async generateText() {
    return null;
  }
};

const basePolicy: PolicyDraft = {
  maxSpendUsd: 500,
  maxSingleTradeUsd: 300,
  maxSlippageBps: 100,
  allowedAssets: ["mNVDA", "mAAPL", "mSPY", "USDC"],
  blockedAssets: ["mTSLA"]
};

const basePortfolio: PortfolioItem[] = [
  { symbol: "mNVDA", valueUsd: 5200 },
  { symbol: "mAAPL", valueUsd: 1800 },
  { symbol: "mSPY", valueUsd: 2200 },
  { symbol: "USDC", valueUsd: 800 }
];

const baseMarketSnapshot = {
  hash: "0xabc",
  prices: { mNVDA: 125, mAAPL: 210, mSPY: 550, USDC: 1, mTSLA: 300 }
};

test("deprecated legacy fallback flow analyzes, generates, approves, and builds execution payload", async () => {
  const analyst = await analyzePortfolio(
    {
      portfolio: [
        { symbol: "mNVDA", valueUsd: 520 },
        { symbol: "mAAPL", valueUsd: 180 },
        { symbol: "mSPY", valueUsd: 220 },
        { symbol: "USDC", valueUsd: 80 }
      ],
      marketSnapshot: { mNVDA: 125, mAAPL: 210, mSPY: 550, USDC: 1 },
      userGoal: "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。"
    },
    nullLlm
  );

  assert.equal(analyst.riskScore, 82);
  assert.equal(analyst.aiExposure, "76%");
  assert.equal(analyst.concentrationRisk, "High");

  const strategy = await generateStrategy(
    {
      userGoal: "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。",
      analystResult: analyst,
      marketSnapshot: { hash: "0xabc", prices: { mNVDA: 125, mAAPL: 210, mSPY: 550, USDC: 1 } },
      policyDraft: basePolicy
    },
    nullLlm
  );

  assert.equal(strategy.marketSnapshotHash, "0xabc");
  assert.equal(strategy.actions.length, 2);
  assert.equal(strategy.actions[0].buyToken, "USDC");
  assert.equal(strategy.actions[1].buyToken, "mSPY");
  assert.equal(strategy.actions[0].minBuyAmount, 297);

  const review = await reviewRisk({ strategy, policy: basePolicy, analystResult: analyst }, nullLlm);
  assert.equal(review.status, "APPROVED");

  const summary = executionSummary({
    strategy,
    policyId: "0xpolicy",
    strategyHash: "0xstrategy",
    marketSnapshotHash: "0xabc",
    txResult: { status: "success", txHash: "0xtx" }
  });

  assert.equal(summary.status, "EXECUTED");
  assert.deepEqual(summary.contractCall.args, ["0xpolicy", strategy.actions, "0xstrategy", "0xabc"]);
});

test("deprecated legacy risk review rejects blocked or non-allowed buy tokens with stable enum", async () => {
  const analystResult: AnalystResult = {
    riskScore: 82,
    aiExposure: "76%",
    concentrationRisk: "High",
    summary: "demo"
  };
  const strategy: Strategy = {
    goal: "bad strategy",
    marketSnapshotHash: "0xabc",
    actions: [
      {
        actionType: "BUY",
        sellToken: "USDC",
        buyToken: "mTSLA",
        sellAmountUsd: 100,
        expectedBuyAmount: 1,
        minBuyAmount: 0.99
      }
    ],
    expectedImpact: {
      riskScoreBefore: 82,
      riskScoreAfter: 70,
      aiExposureBefore: "76%",
      aiExposureAfter: "80%",
      cashBufferBefore: "8%",
      cashBufferAfter: "4%"
    }
  };

  const review = await reviewRisk({ strategy, policy: basePolicy, analystResult }, nullLlm);
  assert.equal(review.status, "REJECTED");
  if (review.status === "REJECTED") {
    assert.equal(review.reason, "BUY_TOKEN_NOT_ALLOWED");
  }
});

test("v2 workflow runs through dry-run execution planning", async () => {
  const response = await runWorkflow(
    {
      portfolio: [
        { symbol: "mNVDA", valueUsd: 520 },
        { symbol: "mAAPL", valueUsd: 180 },
        { symbol: "mSPY", valueUsd: 220 },
        { symbol: "USDC", valueUsd: 80 }
      ],
      market_snapshot: { hash: "0xabc", prices: { mNVDA: 125, mAAPL: 210, mSPY: 550, USDC: 1 } },
      user_goal: "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。",
      policy_draft: basePolicy
    },
    nullLlm
  );

  assert.notEqual(response.analyse_agent, null);
  assert.equal(response.strategy_agent?.status, "generated");
  assert.ok(response.risk_agent?.decision === "approve" || response.risk_agent?.decision === "revise");
  assert.notEqual(response.execution_agent, null);
  assert.ok(response.current_state === "payload_prepared" || response.current_state === "risk_reviewed");

  if (response.risk_agent?.decision === "approve") {
    assert.equal(response.execution_agent?.status, "dry_run_prepared");
    for (const step of response.execution_agent?.execution_plan?.steps ?? []) {
      assert.equal(step.calldata, null);
      if (step.type === "swap") {
        assert.notEqual(step.contract_payload, null);
      }
    }
  }
});

test("adapter builds mock_amm contract payload", () => {
  const strategy = mockStrategyJson();
  const action = strategy.actions[0];
  const result = buildMockAmmContractPayload(
    action,
    strategy,
    { prices: { mNVDA: 125, mSPY: 550, USDC: 1 } }
  );

  assert.equal(result.supported, true);
  assert.notEqual(result.payload, null);
  assert.equal(result.payload?.sell_token_symbol, "mNVDA");
  assert.equal(result.payload?.buy_token_symbol, "USDC");
  assert.equal(result.payload?.sell_amount_usd, 300);
  assert.equal(result.payload?.expected_buy_amount, 300);
  assert.equal(result.payload?.min_buy_amount, 297);
});

test("prepareExecutionPlan includes contract_payload and keeps calldata null", () => {
  const strategy = mockStrategyJson();
  const result = prepareExecutionPlan({
    strategy,
    risk_review: approvedRiskReview(strategy),
    execution_mode: "dry_run",
    market_snapshot: { prices: { mNVDA: 125, mSPY: 550, USDC: 1 } }
  });

  assert.equal(result.status, "dry_run_prepared");
  const step = result.execution_plan?.steps[0];
  assert.notEqual(step, undefined);
  assert.equal(step?.calldata, null);
  assert.notEqual(step?.contract_payload, null);
  assert.equal(step?.contract_payload?.contract_method, "executeStrategy");
  assert.equal(result.execution_plan?.user_confirmation_summary.assets_spent.mNVDA, "300 USD");
  assert.equal(result.execution_plan?.user_confirmation_summary.assets_received_expected.USDC, ">= 297");
  assert.equal(result.execution_plan?.user_confirmation_summary.approval_requests.length, 1);
});

test("unsupported execution adapter action remains blocked", () => {
  const strategy = mockStrategyJson({
    protocol: "unsupported_amm"
  });
  const result = prepareExecutionPlan({
    strategy,
    risk_review: approvedRiskReview(strategy),
    execution_mode: "dry_run",
    market_snapshot: { prices: { mNVDA: 125, USDC: 1 } }
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.execution_plan?.status, "blocked");
  assert.match(result.reason, /unsupported_amm/);
});

test("v2 workflow runs analyse, strategy, risk, and execution dry-run", async () => {
  const response = await runWorkflow(
    {
      user_goal: "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。",
      portfolio: basePortfolio,
      market_snapshot: baseMarketSnapshot,
      policy_draft: basePolicy,
      current_state: "draft_strategy",
      execution_mode: "dry_run"
    },
    nullLlm
  );

  assert.notEqual(response.analyse_agent, null);
  assert.notEqual(response.strategy_agent, null);
  assert.equal(response.strategy_agent?.status, "generated");
  assert.notEqual(response.strategy_agent?.strategy, null);
  assert.notEqual(response.risk_agent, null);
  assert.notEqual(response.execution_agent, null);

  if (response.risk_agent?.decision === "approve") {
    assert.equal(response.execution_agent?.status, "dry_run_prepared");
    assert.notEqual(response.execution_agent?.execution_plan, null);
    assert.ok((response.execution_agent?.execution_plan?.steps.length ?? 0) > 0);
    assert.equal(response.execution_agent?.execution_plan?.steps.every((step) => step.calldata === null), true);
    assert.equal(response.current_state, "payload_prepared");
  } else if (response.risk_agent?.decision === "revise") {
    assert.equal(response.execution_agent?.status, "blocked");
    assert.equal(response.current_state, "risk_reviewed");
  } else {
    assert.equal(response.execution_agent?.status, "blocked");
    assert.equal(response.current_state, "risk_reviewed");
  }
});

test("risk v2 rejects strategy actions that include calldata", async () => {
  const strategy = mockStrategyJson();
  const strategyWithCalldata = {
    ...strategy,
    actions: [{ ...strategy.actions[0], calldata: "0x1234" }]
  } as unknown as StrategyJson;

  const review = await reviewRiskV2(riskRequest(strategyWithCalldata), nullLlm);

  assert.equal(review.decision, "reject");
  assert.equal(review.blocking_issues.some((issue) => issue.code === "DIRECT_CALLDATA_NOT_ALLOWED"), true);
});

test("risk v2 rejects denied asset mTSLA", async () => {
  const strategy = mockStrategyJson({
    from_asset: "USDC",
    to_asset: "mTSLA"
  });

  const review = await reviewRiskV2(riskRequest(strategy), nullLlm);

  assert.equal(review.decision, "reject");
  assert.equal(
    review.blocking_issues.some((issue) => issue.code === "DENIED_ASSET" || issue.code === "HARD_ANALYST_CONSTRAINT_VIOLATION"),
    true
  );
});

test("risk v2 rejects borrow action in MVP", async () => {
  const strategy = mockStrategyJson({
    type: "borrow",
    from_asset: null,
    to_asset: null,
    asset: "mNVDA"
  });

  const review = await reviewRiskV2(riskRequest(strategy), nullLlm);

  assert.equal(review.decision, "reject");
  assert.equal(
    review.blocking_issues.some((issue) => issue.code === "HIDDEN_LEVERAGE" || issue.code === "UNSUPPORTED_ACTION"),
    true
  );
});

test("execution plan blocks unsupported borrow action even with artificial approval", () => {
  const strategy = mockStrategyJson({
    type: "borrow",
    from_asset: null,
    to_asset: null,
    asset: "mNVDA"
  });

  const result = prepareExecutionPlan({
    strategy,
    risk_review: approvedRiskReview(strategy),
    execution_mode: "dry_run",
    market_snapshot: baseMarketSnapshot
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.execution_plan?.status, "blocked");
});

test("execution plan blocks when risk review is not approve", () => {
  const strategy = mockStrategyJson();
  const result = prepareExecutionPlan({
    strategy,
    risk_review: {
      decision: "reject",
      risk_score: 100,
      blocking_issues: [
        {
          code: "TEST_REJECT",
          severity: "critical",
          message: "rejected",
          suggested_fix: "Use an approved strategy."
        }
      ],
      warnings: [],
      approved_action_ids: [],
      revised_strategy_patch: [],
      human_readable_summary: "rejected"
    },
    execution_mode: "dry_run",
    market_snapshot: baseMarketSnapshot
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.execution_plan?.status, "blocked");
  assert.equal(result.execution_plan?.steps.length, 0);
});

test("execution adapter prepares contract payload descriptor without calldata", () => {
  const strategy = mockStrategyJson();
  const result = prepareExecutionPlan({
    strategy,
    risk_review: approvedRiskReview(strategy),
    execution_mode: "dry_run",
    market_snapshot: baseMarketSnapshot
  });

  const step = result.execution_plan?.steps[0];
  assert.equal(result.status, "dry_run_prepared");
  assert.notEqual(step?.contract_payload, null);
  assert.equal(step?.contract_payload?.contract_method, "executeStrategy");
  assert.equal(step?.contract_payload?.sell_token_symbol, "mNVDA");
  assert.equal(step?.contract_payload?.buy_token_symbol, "USDC");
  assert.equal(step?.contract_payload?.min_buy_amount, 297);
  assert.equal(step?.calldata, null);
});

test("workflow does not skip risk gate before execution", async () => {
  const response = await runWorkflow(
    {
      user_goal: "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。",
      portfolio: basePortfolio,
      market_snapshot: baseMarketSnapshot,
      policy_draft: basePolicy,
      execution_mode: "dry_run"
    },
    nullLlm
  );

  assert.notEqual(response.risk_agent, null);
  if (response.execution_agent) {
    assert.notEqual(response.risk_agent, null);
  }
  if (response.risk_agent?.decision !== "approve") {
    assert.equal(response.execution_agent?.status, "blocked");
  }
});

function mockStrategyJson(
  overrides: Partial<{
    protocol: string;
    type: StrategyJson["actions"][number]["type"];
    from_asset: string | null;
    to_asset: string | null;
    asset: string | null;
  }> = {}
): StrategyJson {
  const actionType = overrides.type ?? "swap";
  return {
    strategy_id: "strategy_test",
    objective: {
      type: "rebalance",
      description: "Reduce concentration"
    },
    constraints: {
      max_slippage_bps: 100,
      max_gas_usd: null,
      min_stablecoin_ratio: 0.15,
      max_single_asset_ratio: 0.4,
      allowed_chains: ["monad-testnet"],
      allowed_protocols: ["mock_amm", "unsupported_amm"],
      denied_assets: ["mTSLA"]
    },
    actions: [
      {
        action_id: "act_1_reduce_mnvda",
        type: actionType,
        chain: "monad-testnet",
        protocol: overrides.protocol ?? "mock_amm",
        from_asset: overrides.from_asset === undefined ? "mNVDA" : overrides.from_asset,
        to_asset: overrides.to_asset === undefined ? "USDC" : overrides.to_asset,
        asset: overrides.asset === undefined ? null : overrides.asset,
        amount: { mode: "usd_value", value: 300, unit: "USD" },
        constraints: { max_slippage_bps: 100 },
        preconditions: ["mNVDA is allowed by policy", "USDC is allowed by policy"],
        expected_effects: ["Reduce mNVDA concentration"],
        rationale: "mNVDA is the largest position"
      }
    ],
    success_criteria: {
      risk_score_after: "<= current risk score"
    },
    assumptions: ["test strategy"]
  };
}

function riskRequest(strategy: StrategyJson) {
  return {
    strategy,
    portfolio_snapshot: {
      total_value_usd: 10000,
      asset_allocation: { mNVDA: 0.52, mAAPL: 0.18, mSPY: 0.22, USDC: 0.08 },
      chain_exposure: { "monad-testnet": 1 },
      protocol_exposure: { wallet: 1 },
      stablecoin_ratio: 0.08,
      leverage_ratio: null,
      largest_position: { symbol: "mNVDA", value_usd: 5200, weight: 0.52 }
    },
    risk_context: baseRiskContext(),
    policy_draft: basePolicy,
    market_context: baseMarketSnapshot
  };
}

function baseRiskContext(): RiskContext {
  return {
    risk_level: "medium",
    risk_factors: [],
    constraints_for_strategy: [
      {
        constraint: "do_not_buy mTSLA",
        reason: "User explicitly blocked mTSLA",
        hard: true
      }
    ]
  };
}

function approvedRiskReview(strategy: StrategyJson): RiskReviewV2 {
  return {
    decision: "approve",
    risk_score: 60,
    blocking_issues: [],
    warnings: [],
    approved_action_ids: strategy.actions.map((action) => action.action_id),
    revised_strategy_patch: [],
    human_readable_summary: "approved"
  };
}
