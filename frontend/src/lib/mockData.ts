import type { AgentStep, AnalystResult, PolicyDraft, PortfolioAsset, RiskReview, Strategy, StrategyReceipt } from "@/types/assetpilot";

export const ASSET_COLORS: Record<string, string> = {
  mNVDA: "#14b8a6",
  mAAPL: "#5b8def",
  mSPY: "#d99b2b",
  USDC: "#64748b"
};

export const portfolioBefore: PortfolioAsset[] = [
  { symbol: "mNVDA", valueUsd: 5200, weight: 52, color: ASSET_COLORS.mNVDA },
  { symbol: "mAAPL", valueUsd: 1800, weight: 18, color: ASSET_COLORS.mAAPL },
  { symbol: "mSPY", valueUsd: 2200, weight: 22, color: ASSET_COLORS.mSPY },
  { symbol: "USDC", valueUsd: 800, weight: 8, color: ASSET_COLORS.USDC }
];

export const portfolioAfter: PortfolioAsset[] = [
  { symbol: "mNVDA", valueUsd: 3500, weight: 35, color: ASSET_COLORS.mNVDA },
  { symbol: "mAAPL", valueUsd: 1800, weight: 18, color: ASSET_COLORS.mAAPL },
  { symbol: "mSPY", valueUsd: 3200, weight: 32, color: ASSET_COLORS.mSPY },
  { symbol: "USDC", valueUsd: 1500, weight: 15, color: ASSET_COLORS.USDC }
];

export const marketSnapshot = {
  hash: "0x8bbd4f4ab44d426b1fd6bf9a884b1ec40a784261472a7d7aee114ee335e9ff21",
  prices: {
    mNVDA: 125,
    mAAPL: 210,
    mSPY: 550,
    USDC: 1,
    mTSLA: 300
  }
};

export const policyDraft: PolicyDraft = {
  maxSpendUsd: 500,
  maxSingleTradeUsd: 300,
  maxSlippageBps: 100,
  allowedAssets: ["mNVDA", "mAAPL", "mSPY", "USDC"],
  blockedAssets: ["mTSLA"]
};

export const defaultGoal = "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。";

export const initialAgentSteps: AgentStep[] = [
  { id: "analyst", name: "Analyst Agent", description: "已分析投资组合风险", status: "pending", output: "等待用户目标" },
  { id: "strategy", name: "Strategy Agent", description: "已生成再平衡计划", status: "pending", output: "等待 Analyst 输出" },
  { id: "risk", name: "Risk Agent", description: "策略已通过审核", status: "pending", output: "等待策略生成" },
  { id: "execution", name: "Execution Agent", description: "已准备链上执行", status: "pending", output: "等待 Risk 审核" }
];

export const fallbackAnalyst: AnalystResult = {
  riskScore: 82,
  aiExposure: "76%",
  concentrationRisk: "High",
  summary: "mNVDA 占投资组合 52%，AI/科技敞口约 76%，集中风险为 High。"
};

export const fallbackStrategy: Strategy = {
  goal: "降低 AI 股票集中风险",
  marketSnapshotHash: marketSnapshot.hash as `0x${string}`,
  actions: [
    { actionType: "SELL", sellToken: "mNVDA", buyToken: "USDC", sellAmountUsd: 300, expectedBuyAmount: 300, minBuyAmount: 297 },
    { actionType: "BUY", sellToken: "USDC", buyToken: "mSPY", sellAmountUsd: 200, expectedBuyAmount: 0.36, minBuyAmount: 0.3564 }
  ],
  expectedImpact: {
    riskScoreBefore: 82,
    riskScoreAfter: 61,
    aiExposureBefore: "76%",
    aiExposureAfter: "58%",
    cashBufferBefore: "8%",
    cashBufferAfter: "15%"
  }
};

export const fallbackRiskReview: RiskReview = {
  status: "APPROVED",
  riskScoreBefore: 82,
  riskScoreAfter: 61,
  notes: ["mNVDA 集中度降低", "AI 敞口降低", "USDC 缓冲提高"],
  warnings: []
};

export const mockReceipts: StrategyReceipt[] = [
  {
    id: "rcpt-001",
    time: "10:30",
    goal: "降低 AI 敞口",
    status: "EXECUTED",
    riskDelta: "82 -> 61",
    reason: "-",
    txHash: "0x7be...91c",
    user: "0xA11CE00000000000000000000000000000000000",
    agent: "0xA6e7100000000000000000000000000000000000",
    authorizedBy: "0xA11CE00000000000000000000000000000000000",
    policyId: "0xpolicy-demo-success",
    policyHash: "0xpolicyhash-demo-success",
    authorizationHash: "0xauth-demo-success",
    strategyHash: "0xstrategy-demo-success",
    strategyContentHash: "0xcontent-demo-success",
    marketSnapshotHash: marketSnapshot.hash
  },
  {
    id: "rcpt-002",
    time: "10:45",
    goal: "买入 mTSLA",
    status: "REFUSED",
    riskDelta: "-",
    reason: "BUY_TOKEN_NOT_ALLOWED",
    txHash: "0x2fd...b18",
    user: "0xA11CE00000000000000000000000000000000000",
    agent: "0xA6e7100000000000000000000000000000000000",
    authorizedBy: "0xA11CE00000000000000000000000000000000000",
    policyId: "0xpolicy-demo-refused",
    policyHash: "0xpolicyhash-demo-refused",
    authorizationHash: "0xauth-demo-refused",
    strategyHash: "0xstrategy-demo-refused",
    strategyContentHash: "0xcontent-demo-refused",
    marketSnapshotHash: marketSnapshot.hash
  }
];
