export type AssetSymbol = string;

export interface PortfolioItem {
  symbol: AssetSymbol;
  valueUsd: number;
}

export interface AnalyzeRequest {
  portfolio: PortfolioItem[];
  marketSnapshot: Record<string, number>;
  userGoal: string;
}

export interface AnalystResult {
  riskScore: number;
  aiExposure: string;
  concentrationRisk: "Low" | "Medium" | "High";
  summary: string;
}

export interface MarketSnapshotInput {
  hash?: string;
  prices?: Record<string, number>;
  [symbol: string]: unknown;
}

export interface PolicyDraft {
  maxSpendUsd: number;
  maxSingleTradeUsd: number;
  maxSlippageBps: number;
  allowedAssets: AssetSymbol[];
  blockedAssets: AssetSymbol[];
}

export interface StrategyAction {
  actionType: "SELL" | "BUY";
  sellToken: AssetSymbol;
  buyToken: AssetSymbol;
  sellAmountUsd: number;
  expectedBuyAmount: number;
  minBuyAmount: number;
}

export interface Strategy {
  goal: string;
  marketSnapshotHash: string;
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

export interface GenerateStrategyRequest {
  userGoal: string;
  analystResult: AnalystResult;
  marketSnapshot: MarketSnapshotInput;
  policyDraft: PolicyDraft;
}

export type RejectionReason =
  | "SELL_TOKEN_NOT_ALLOWED"
  | "BUY_TOKEN_NOT_ALLOWED"
  | "SELL_TOKEN_BLOCKED"
  | "BUY_TOKEN_BLOCKED"
  | "MAX_SPEND_EXCEEDED"
  | "MAX_SINGLE_TRADE_EXCEEDED"
  | "SLIPPAGE_TOO_HIGH";

export interface ReviewRiskRequest {
  strategy: Strategy;
  policy: PolicyDraft;
  analystResult: AnalystResult;
}

export interface ApprovedRiskReview {
  status: "APPROVED";
  riskScoreBefore: number;
  riskScoreAfter: number;
  notes: string[];
  warnings: string[];
}

export interface RejectedRiskReview {
  status: "REJECTED";
  reason: RejectionReason;
  details: string;
}

export type RiskReview = ApprovedRiskReview | RejectedRiskReview;

export interface ExecutionSummaryRequest {
  strategy: Strategy;
  policyId: string;
  strategyHash: string;
  marketSnapshotHash: string;
  txResult?: {
    status?: "success" | "rejected" | "failed";
    txHash?: string;
    reason?: RejectionReason;
  };
  riskReview?: RiskReview;
}

export interface ContractCall {
  method: "executeStrategy";
  args: [string, StrategyAction[], string, string];
}
