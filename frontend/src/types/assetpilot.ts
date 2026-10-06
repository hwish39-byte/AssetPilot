export type AgentStatus = "pending" | "running" | "completed" | "failed" | "rejected";

export type ReceiptStatus = "EXECUTED" | "REFUSED";

export interface PortfolioAsset {
  symbol: "mNVDA" | "mAAPL" | "mSPY" | "USDC";
  valueUsd: number;
  weight: number;
  color: string;
}

export interface AnalystResult {
  riskScore: number;
  aiExposure: string;
  concentrationRisk: "Low" | "Medium" | "High";
  summary: string;
}

export interface PolicyDraft {
  maxSpendUsd: number;
  maxSingleTradeUsd: number;
  maxSlippageBps: number;
  allowedAssets: string[];
  blockedAssets: string[];
}

export interface StrategyAction {
  actionType: "SELL" | "BUY";
  sellToken: string;
  buyToken: string;
  sellAmountUsd: number;
  expectedBuyAmount: number;
  minBuyAmount: number;
}

export interface Strategy {
  goal: string;
  marketSnapshotHash: `0x${string}`;
  actions: StrategyAction[];
  expectedImpact: {
    riskScoreBefore: number;
    riskScoreAfter: number;
    aiExposureBefore: string;
    aiExposureAfter: string;
    cashBufferBefore: string;
    cashBufferAfter: string;
  };
}

export type RiskReview =
  | {
      status: "APPROVED";
      riskScoreBefore: number;
      riskScoreAfter: number;
      notes: string[];
      warnings: string[];
    }
  | {
      status: "REJECTED";
      reason: string;
      details: string;
    };

export interface AgentStep {
  id: "analyst" | "strategy" | "risk" | "execution";
  name: string;
  description: string;
  status: AgentStatus;
  output: string;
}

export interface StrategyReceipt {
  id: string;
  time: string;
  goal: string;
  status: ReceiptStatus;
  riskDelta: string;
  reason: string;
  txHash: string;
  user: string;
  agent: string;
  authorizedBy: string;
  policyId: string;
  policyHash: string;
  authorizationHash: string;
  strategyHash: string;
  strategyContentHash: string;
  marketSnapshotHash: string;
}
