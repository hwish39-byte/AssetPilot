import assert from "node:assert/strict";
import test from "node:test";
import { analyzePortfolio } from "./analyst.js";
import { executionSummary } from "./execution.js";
import { reviewRisk } from "./risk.js";
import { generateStrategy } from "./strategy.js";
import type { LlmProvider } from "../llm.js";
import type { AnalystResult, PolicyDraft, Strategy } from "../types.js";

const nullLlm: LlmProvider = {
  async generateJson() {
    return null;
  },
  async generateText() {
    return null;
  }
};

const policy: PolicyDraft = {
  maxSpendUsd: 500,
  maxSingleTradeUsd: 300,
  maxSlippageBps: 100,
  allowedAssets: ["mNVDA", "mAAPL", "mSPY", "USDC"],
  blockedAssets: ["mTSLA"]
};

test("fallback flow analyzes, generates, approves, and builds execution payload", async () => {
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
      policyDraft: policy
    },
    nullLlm
  );

  assert.equal(strategy.marketSnapshotHash, "0xabc");
  assert.equal(strategy.actions.length, 2);
  assert.equal(strategy.actions[0].buyToken, "USDC");
  assert.equal(strategy.actions[1].buyToken, "mSPY");
  assert.equal(strategy.actions[0].minBuyAmount, 297);

  const review = await reviewRisk({ strategy, policy, analystResult: analyst }, nullLlm);
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

test("risk review rejects blocked or non-allowed buy tokens with stable enum", async () => {
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

  const review = await reviewRisk({ strategy, policy, analystResult }, nullLlm);
  assert.equal(review.status, "REJECTED");
  if (review.status === "REJECTED") {
    assert.equal(review.reason, "BUY_TOKEN_NOT_ALLOWED");
  }
});
