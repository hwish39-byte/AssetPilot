import type {
  AccountEvent,
  Order,
  PerplFill,
  PerplOrder,
  PerplPosition,
  PerplWalletSummary,
  Portfolio,
  Position
} from "../perpl/types.js";

export const PERPL_RISK_METHODOLOGY_VERSION = "assetpilot-perpl-risk-v1" as const;

export type PerplRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type PerplRiskSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface PerplRiskSnapshot {
  source: "assetpilot";
  protocol: "perpl";
  network: "monad-testnet";
  methodologyVersion: typeof PERPL_RISK_METHODOLOGY_VERSION;
  calculatedAt: string;
  accountIds: number[];
  noExposure: boolean;
  walletMetrics: PerplWalletMetrics;
  positions: PerplPositionRisk[];
  performance: PerplPerformanceMetrics;
  score: number | null;
  riskLevel: PerplRiskLevel;
  scoreCoveragePercent: number;
  components: PerplRiskComponent[];
  issues: PerplRiskIssue[];
  dataQuality: PerplDataQuality;
  history: {
    historyComplete: boolean;
    pagesFetched: number;
    recordsFetched: number;
  };
}

export interface PerplWalletMetrics {
  totalBalance: string;
  totalLockedBalance: string;
  lockedBalanceRatio: number | null;
  grossPositionNotional: string;
  longNotional: string;
  shortNotional: string;
  netDirectionalNotional: string;
  estimatedUnrealizedPnl: string | null;
  balancePlusUnrealizedPnlEstimate: string | null;
  effectiveLeverageEstimate: number | null;
  largestPositionShare: number | null;
  openPositionCount: number;
  openOrderCount: number;
  marketCount: number;
  longShortSkew: number | null;
}

export interface PerplPositionRisk {
  positionId: string;
  accountId: number;
  marketId: number;
  marketSymbol: string | null;
  side: "long" | "short" | null;
  size: string | null;
  entryPrice: string | null;
  markPrice: string | null;
  notional: string | null;
  leverage: string;
  estimatedUnrealizedPnl: string | null;
  estimatedPnlPercent: number | null;
  concentrationShare: number | null;
  fundingRateRaw: number | null;
  liquidationPrice: string | null;
  liquidationDistancePercent: number | null;
  dataWarnings: string[];
}

export interface PerplPerformanceMetrics {
  closedPositionCount: number;
  winningPositionCount: number;
  losingPositionCount: number;
  breakEvenPositionCount: number;
  winRate: number | null;
  grossProfit: string;
  grossLoss: string;
  realizedPnl: string;
  fundingPnl: string;
  profitFactor: number | null;
  profitFactorUnavailableReason: string | null;
  maxDrawdown: string | null;
  maxDrawdownPercent: number | null;
  currentWinStreak: number;
  currentLossStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  averageHoldingTimeSeconds: number | null;
  bestMarket: PerplMarketPerformance | null;
  worstMarket: PerplMarketPerformance | null;
  totalFees: string;
  totalBuilderFees: string;
}

export interface PerplMarketPerformance {
  marketId: number;
  marketSymbol: string | null;
  realizedPnl: string;
  closedPositionCount: number;
}

export interface PerplRiskComponent {
  id:
    | "liquidation_distance"
    | "leverage"
    | "concentration"
    | "margin_usage_proxy"
    | "max_drawdown"
    | "funding_exposure"
    | "open_order_exposure";
  label: string;
  weight: number;
  available: boolean;
  applicable: boolean;
  rawValue: string | number | null;
  score: number | null;
  weightedContribution: number | null;
  severity: PerplRiskSeverity;
  evidence: string[];
  methodology: string;
  reason?: string;
}

export interface PerplRiskIssue {
  code:
    | "ACCOUNT_FROZEN"
    | "NON_POSITIVE_BALANCE_WITH_EXPOSURE"
    | "HIGH_LEVERAGE"
    | "POSITION_CONCENTRATION"
    | "HIGH_LOCKED_BALANCE_RATIO"
    | "LARGE_DRAWDOWN"
    | "LIQUIDATION_DISTANCE_UNAVAILABLE"
    | "MARKET_PRICE_UNAVAILABLE"
    | "STALE_DATA"
    | "PARTIAL_HISTORY"
    | "FUNDING_UNIT_UNVERIFIED"
    | "OPEN_ORDER_EXPOSURE"
    | "NO_EXPOSURE";
  severity: PerplRiskSeverity;
  title: string;
  description: string;
  evidence: string[];
  affectedPositionIds: string[];
  suggestedAction: string;
}

export interface PerplDataQuality {
  stale: boolean;
  partialHistory: boolean;
  missingFields: string[];
  warnings: string[];
}

export type PerplRiskAction =
  | { type: "reduce_position"; positionId: string; percentage: number }
  | { type: "close_position"; positionId: string }
  | { type: "cancel_order"; orderId: string }
  | { type: "add_collateral"; amount: string }
  | { type: "hold" };

export interface PerplRiskSimulationRequest {
  actions: PerplRiskAction[];
}

export interface PerplRiskSimulationResult {
  beforeMetrics: PerplWalletMetrics;
  beforeScore: number | null;
  afterMetrics: PerplWalletMetrics;
  afterScore: number | null;
  scoreDelta: number | null;
  changedComponents: PerplRiskComponent[];
  assumptions: string[];
  warnings: string[];
  actions: PerplRiskAction[];
  before: PerplRiskSnapshot;
  after: PerplRiskSnapshot;
}

export interface PerplRiskDataBundle {
  wallet: PerplWalletSummary;
  positions: PerplPosition[];
  orders: PerplOrder[];
  fills: PerplFill[];
  accountHistory: AccountEvent[];
  orderHistory: Order[];
  positionHistory: Position[];
  portfolioEquity: Portfolio;
  portfolioPnl: Portfolio;
  historyComplete: boolean;
  pagesFetched: number;
  recordsFetched: number;
  partialErrors: Array<{ source: string; code: string; message: string }>;
}

export interface PerplRiskOptions {
  historyCount?: number;
  portfolioPeriod?: "all" | "day" | "2weeks" | "week" | "month";
}
