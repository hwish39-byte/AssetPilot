export type AnalyticsPeriod = "24h" | "7d" | "30d";
export type AnalyticsHistoryMetric = "price" | "volume" | "funding";
export type MetricStatus = "available" | "partial" | "unavailable" | "stale";
export type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type RiskSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface AnalyticsMetric<T> {
  value: T | null;
  status: MetricStatus;
  source: string | null;
  asOf: string | null;
  methodology: string;
  reason?: string;
  estimated?: boolean;
}

export interface DataFreshness {
  calculatedAt: string;
  contextAsOf: string | null;
  tickerAsOf: string | null;
}

export interface DataAvailabilityItem {
  metric: string;
  status: MetricStatus;
  source: string | null;
  scope: "market" | "protocol" | "both";
  reason: string;
  requiredNextStep: string | null;
}

export interface AnalyticsAvailabilityResponse {
  source: "perpl";
  network: "monad-testnet";
  calculatedAt: string;
  dataAvailability: DataAvailabilityItem[];
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: string | number | null;
  status: MetricStatus;
  marketCoverage?: number;
}

export interface MarketRanking {
  marketId: number;
  symbol: string;
  volume24h: string | null;
  volume7d: string | null;
  volume30d: string | null;
  openInterestUsdEstimate: string | null;
  tvl: string | null;
  absoluteFundingRate: number | null;
  priceChangePercent: number | null;
  spreadBps: number | null;
}

export interface ProtocolOverview {
  source: "perpl";
  network: "monad-testnet";
  calculatedAt: string;
  period: AnalyticsPeriod;
  dataFreshness: DataFreshness;
  dataAvailability: DataAvailabilityItem[];
  warnings: string[];
  metrics: {
    totalMarkets: AnalyticsMetric<number>;
    openMarkets: AnalyticsMetric<number>;
    closedMarkets: AnalyticsMetric<number>;
    totalVolume24h: AnalyticsMetric<string>;
    totalVolume7d: AnalyticsMetric<string>;
    totalVolume30d: AnalyticsMetric<string>;
    totalOpenInterestUsdEstimate: AnalyticsMetric<string>;
    totalTvl: AnalyticsMetric<string>;
    topMarketByVolume: AnalyticsMetric<string>;
    topMarketByOpenInterest: AnalyticsMetric<string>;
  };
  volumeByMarket: Array<{ marketId: number; symbol: string; value: string; share: number | null }>;
  openInterestByMarket: Array<{ marketId: number; symbol: string; value: string; share: number | null }>;
  tvlByMarket: Array<{ marketId: number; symbol: string; value: string; share: number | null }>;
  fundingOverview: {
    averageFundingRateRaw: AnalyticsMetric<number>;
    minFundingRateRaw: AnalyticsMetric<number>;
    maxFundingRateRaw: AnalyticsMetric<number>;
  };
  marketRankings: MarketRanking[];
  series: {
    aggregateVolumeSeries: TimeSeriesPoint[];
    aggregatePriceActivitySeries: TimeSeriesPoint[];
    aggregateFundingSeries: TimeSeriesPoint[];
    historicalOpenInterest: AnalyticsMetric<TimeSeriesPoint[]>;
    historicalTvl: AnalyticsMetric<TimeSeriesPoint[]>;
  };
  failedMarkets: Array<{ marketId: number; symbol: string; reason: string }>;
}

export interface MarketAnalytics {
  marketId: number;
  symbol: string;
  name: string;
  isOpen: boolean;
  sizeUnits: string;
  priceDecimals: number;
  sizeDecimals: number;
  current: {
    oraclePrice: string | null;
    markPrice: string | null;
    lastPrice: string | null;
    midPrice: string | null;
    bestBid: string | null;
    bestAsk: string | null;
    absoluteSpread: AnalyticsMetric<string>;
    spreadBps: AnalyticsMetric<number>;
  };
  volume: {
    volume24h: AnalyticsMetric<string>;
    volume7d: AnalyticsMetric<string>;
    volume30d: AnalyticsMetric<string>;
    selectedPeriodVolume: AnalyticsMetric<string>;
    volumeChange: AnalyticsMetric<number>;
    tradeCount24h: AnalyticsMetric<number>;
    averageTradeSize: AnalyticsMetric<string>;
  };
  openInterest: {
    openInterestBase: AnalyticsMetric<string>;
    openInterestUsdEstimate: AnalyticsMetric<string>;
    openInterestShare: AnalyticsMetric<number>;
  };
  tvl: {
    marketTvl: AnalyticsMetric<string>;
    marketTvlShare: AnalyticsMetric<number>;
  };
  funding: {
    fundingRateRaw: AnalyticsMetric<number>;
    fundingRateNormalized: AnalyticsMetric<number>;
    fundingPeriod: AnalyticsMetric<number>;
    fundingHistory: Array<{ timestamp: number | null; rateRaw: number }>;
    averageFundingRate: AnalyticsMetric<number>;
    minFundingRate: AnalyticsMetric<number>;
    maxFundingRate: AnalyticsMetric<number>;
  };
  price: {
    openPrice: AnalyticsMetric<string>;
    closePrice: AnalyticsMetric<string>;
    highPrice: AnalyticsMetric<string>;
    lowPrice: AnalyticsMetric<string>;
    priceChange: AnalyticsMetric<string>;
    priceChangePercent: AnalyticsMetric<number>;
  };
  orderBook: OrderBookAnalytics | null;
  warnings: string[];
}

export interface OrderBookAnalytics {
  bestBid: string | null;
  bestAsk: string | null;
  spread: AnalyticsMetric<string>;
  spreadBps: AnalyticsMetric<number>;
  bidDepth: AnalyticsMetric<string>;
  askDepth: AnalyticsMetric<string>;
  depthWithin10Bps: AnalyticsMetric<{ bid: string; ask: string }>;
  depthWithin50Bps: AnalyticsMetric<{ bid: string; ask: string }>;
  depthWithin100Bps: AnalyticsMetric<{ bid: string; ask: string }>;
  orderBookImbalance: AnalyticsMetric<number>;
  sampledLevels: { bid: number; ask: number; requested: number };
}

export interface MarketHistoryResponse {
  source: "perpl";
  network: "monad-testnet";
  calculatedAt: string;
  period: AnalyticsPeriod;
  marketId: number;
  metric: AnalyticsHistoryMetric;
  series: TimeSeriesPoint[];
  warnings: string[];
}

export interface BlockTimestamp {
  b?: number;
  t?: number;
  tx?: number;
  txid?: string;
  l?: number;
}

export interface PerplWalletSummary {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  address: string | null;
  nonce: number | null;
  feeLevel: number | null;
  accounts: Array<{
    instanceId: number;
    accountId: number;
    isFrozen: boolean;
    allowsForwarding: boolean;
    feeTier: number;
    lastForwardedRequestId: string;
    balance: string;
    lockedBalance: string;
  }>;
  stats: PerplAccountStats[];
}

export interface PerplAccountStats {
  instanceId: number;
  accountId: number;
  totalDeposits: string;
  totalWithdrawals: string;
  totalVolume: string;
  totalFees: string;
  totalBuilderFees: string | null;
  totalRealizedPnl: string;
  winRateBps: number;
  tradeCount: number;
}

export interface PerplPosition {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  marketId: number;
  marketSymbol: string | null;
  accountId: number;
  positionId: string;
  side: "long" | "short" | null;
  status: number;
  statusReason: number;
  collateral: string;
  entryPrice: string | null;
  size: string | null;
  fee: string;
  closeFee: string | null;
  leverage: string;
  realizedDeltaPnl: string | null;
  realizedFundingPnl: string | null;
  exitPrice: string | null;
  openedAt: BlockTimestamp;
  updatedAt: BlockTimestamp;
}

export interface PerplOrder {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  marketId: number;
  marketSymbol: string | null;
  accountId: number;
  orderId: string;
  requestId: string;
  smartContractOrderId: string;
  type: number;
  status: number;
  statusReason: number;
  failureReason: number | null;
  limitPrice: string | null;
  originalSize: string | null;
  fillPrice: string | null;
  filledSize: string | null;
  fee: string;
  builderFee: string | null;
  flags: number;
  leverage: string;
  createdAt: BlockTimestamp;
  updatedAt: BlockTimestamp;
}

export interface PerplFill {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  marketId: number;
  marketSymbol: string | null;
  accountId: number;
  orderId: string;
  orderType: number;
  liquiditySide: "maker" | "taker" | null;
  price: string | null;
  size: string | null;
  fee: string;
  builderFee: string | null;
  timestamp: BlockTimestamp;
}

export interface PerplMarket {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  id: number;
  symbol: string;
  name: string;
  sizeUnits: string;
  priceDecimals: number;
  sizeDecimals: number;
  isOpen: boolean;
  oraclePrice: string | null;
  markPrice: string | null;
  lastPrice: string | null;
  midPrice: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  dailyVolumeSize: string | null;
  dailyVolumeAmount: string | null;
  openInterest: string | null;
  totalValueLocked: string | null;
  fundingRateMicros: number | null;
  fundingIndexPrice: string | null;
}

export interface PerplRiskSnapshot {
  source: "assetpilot";
  protocol: "perpl";
  network: "monad-testnet";
  methodologyVersion: string;
  calculatedAt: string;
  accountIds: number[];
  noExposure: boolean;
  walletMetrics: PerplWalletMetrics;
  positions: PerplPositionRisk[];
  performance: PerplPerformanceMetrics;
  score: number | null;
  riskLevel: RiskLevel;
  scoreCoveragePercent: number;
  components: PerplRiskComponent[];
  issues: PerplRiskIssue[];
  dataQuality: {
    stale: boolean;
    partialHistory: boolean;
    missingFields: string[];
    warnings: string[];
  };
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
  bestMarket: { marketId: number; marketSymbol: string | null; realizedPnl: string; closedPositionCount: number } | null;
  worstMarket: { marketId: number; marketSymbol: string | null; realizedPnl: string; closedPositionCount: number } | null;
  totalFees: string;
  totalBuilderFees: string;
}

export interface PerplRiskComponent {
  id: string;
  label: string;
  weight: number;
  available: boolean;
  applicable: boolean;
  rawValue: string | number | null;
  score: number | null;
  weightedContribution: number | null;
  severity: RiskSeverity;
  evidence: string[];
  methodology: string;
  reason?: string;
}

export interface PerplRiskIssue {
  code: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  evidence: string[];
  affectedPositionIds: string[];
  suggestedAction: string;
}

export type PerplRiskAction =
  | { type: "reduce_position"; positionId: string; percentage: number }
  | { type: "close_position"; positionId: string }
  | { type: "cancel_order"; orderId: string }
  | { type: "add_collateral"; amount: string }
  | { type: "hold" };

export interface PerplRiskOptions {
  historyCount?: number;
  portfolioPeriod?: "all" | "day" | "2weeks" | "week" | "month";
}

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

export type PerplAgentActionType = "reduce_position" | "close_position" | "cancel_order" | "add_collateral" | "place_order" | "hold";

export interface PerplAgentPolicy {
  allowedAccountIds: number[];
  allowedMarketIds: number[];
  allowedActions: PerplAgentActionType[];
  maxActionsPerStrategy: number;
  maxLeverage: number;
  maxOrderNotionalUsd: string;
  maxTotalNotionalUsd: string;
  maxSlippageBps: number;
  maxReductionPercentage: number;
  allowIncreaseExposure: boolean;
  requireSimulation: boolean;
  requireRiskImprovement: boolean;
  minimumRiskScoreImprovement: number;
  expiresAt: string;
}

export interface PerplPolicyHashResponse {
  policyHash: string;
  canonicalPolicy: PerplAgentPolicy;
}

export interface PerplAgentWorkflowRequest {
  userGoal: string;
  policy: PerplAgentPolicy;
  mode: "dry_run";
  preferredLanguage?: "zh-CN" | "en";
  currentState?: string;
}

export type PerplAgentAction =
  | {
      actionId: string;
      type: "reduce_position";
      rationale: string;
      expectedEffects: string[];
      targetAccountId: number;
      confidence: number;
      assumptions: string[];
      positionId: string;
      percentage: number;
      maxSlippageBps: number;
    }
  | {
      actionId: string;
      type: "close_position";
      rationale: string;
      expectedEffects: string[];
      targetAccountId: number;
      confidence: number;
      assumptions: string[];
      positionId: string;
      maxSlippageBps: number;
    }
  | {
      actionId: string;
      type: "cancel_order";
      rationale: string;
      expectedEffects: string[];
      targetAccountId: number;
      confidence: number;
      assumptions: string[];
      orderId: string;
    }
  | {
      actionId: string;
      type: "add_collateral";
      rationale: string;
      expectedEffects: string[];
      targetAccountId: number;
      confidence: number;
      assumptions: string[];
      accountId: number;
      amount: string;
    }
  | {
      actionId: string;
      type: "place_order";
      rationale: string;
      expectedEffects: string[];
      targetAccountId: number;
      confidence: number;
      assumptions: string[];
      marketId: number;
      side: "long" | "short";
      orderType: "market" | "limit";
      size: string;
      limitPrice: string | null;
      leverage: string;
      reduceOnly: boolean;
      maxSlippageBps: number;
      timeInForce: string;
    }
  | {
      actionId: string;
      type: "hold";
      rationale: string;
      expectedEffects: string[];
      targetAccountId: number;
      confidence: number;
      assumptions: string[];
      reason: string;
    };

export interface PerplAnalystOutput {
  summary: string;
  riskLevel: RiskLevel;
  riskScore: number | null;
  scoreCoveragePercent: number;
  primaryRiskDrivers: Array<{
    componentId: string;
    label: string;
    score: number | null;
    weightedContribution: number | null;
    evidence: string[];
    severity: string;
  }>;
  affectedPositions: Array<{ positionId: string; marketId: number; marketSymbol: string | null; reasons: string[] }>;
  affectedMarkets: Array<{ marketId: number; symbol: string | null; reasons: string[] }>;
  dataQualityConcerns: string[];
  recommendedObjectives: string[];
}

export interface PerplStrategyOutput {
  status: "generated" | "clarification_required" | "failed";
  objective: string;
  actions: PerplAgentAction[];
  expectedRiskDirection: "decrease" | "neutral" | "increase" | "unknown";
  assumptions: string[];
  clarificationQuestions: string[];
  validationErrors: string[];
}

export interface PerplAgentRiskReview {
  decision: "approve" | "revise" | "reject";
  riskScoreBefore: number | null;
  riskScoreAfter: number | null;
  scoreDelta: number | null;
  blockingIssues: Array<{ code: string; severity: string; message: string; actionId?: string; suggestedFix?: string }>;
  warnings: Array<{ code: string; severity: string; message: string; actionId?: string; suggestedFix?: string }>;
  approvedActionIds: string[];
  rejectedActionIds: string[];
  revisedActions: PerplAgentAction[];
  humanReadableSummary: string;
}

export interface PerplExecutionDescriptor {
  actionId: string;
  actionType: PerplAgentActionType;
  protocol: "perpl";
  network: "monad-testnet";
  accountId: number;
  marketId: number | null;
  positionId: string | null;
  orderId: string | null;
  humanReadable: string;
  expectedRiskEffect: string;
  requiresUserConfirmation: true;
  signingRequiredLater: boolean;
  executionStatus: "not_submitted";
  calldata: null;
  signature: null;
  txHash: null;
  orderIdAfterExecution: null;
}

export interface PerplAgentWorkflowResponse {
  workflowId: string;
  state: "data_loaded" | "analyzed" | "strategy_generated" | "clarification_required" | "risk_reviewed" | "dry_run_prepared" | "rejected" | "failed";
  startedAt: string;
  completedAt: string;
  source: "assetpilot";
  network: "monad-testnet";
  methodologyVersion: string;
  dataFreshness: {
    riskCalculatedAt: string | null;
    walletFetchedAt: string | null;
    marketFetchedAt: string | null;
  };
  riskSnapshot: PerplRiskSnapshot;
  analyst: PerplAnalystOutput;
  strategy: PerplStrategyOutput;
  simulation: PerplRiskSimulationResult | null;
  riskReview: PerplAgentRiskReview;
  execution: {
    status: "dry_run_prepared" | "blocked";
    descriptors: PerplExecutionDescriptor[];
    reason: string;
  };
  auditStatus?: {
    status: "saved" | "failed";
    riskReviewReceiptId: string | null;
    planHash: string | null;
    error: string | null;
  };
  nextUserAction: string;
  warnings: string[];
}

export interface PerplTradingCapabilities {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
  tradingEnabled: boolean;
  credentialsConfigured: boolean;
  readonlyKeyConfigured: boolean;
  testnetOnly: true;
  canPrepareIntent: boolean;
  canSubmitOrder: boolean;
  allowedMarketIds: number[];
  allowedActions: Array<"reduce_position" | "close_position" | "cancel_order">;
  limits: {
    maxOrderNotionalUsd: string;
    maxLeverage: number;
    maxSlippageBps: number;
    intentTtlSeconds: number;
    cooldownSeconds: number;
  };
  wallet: {
    address: string | null;
    forwardingEnabled: boolean | null;
    frozen: boolean | null;
    accounts: Array<{ accountId: number; allowsForwarding: boolean; isFrozen: boolean; lastForwardedRequestId: string }>;
  };
  reasons: string[];
  warnings: string[];
}

export interface PerplExactOrderPreview {
  actionId: string;
  actionType: "reduce_position" | "close_position" | "cancel_order";
  accountId: number;
  marketId: number;
  marketSymbol: string | null;
  requestId: number;
  orderSpec: Record<string, number>;
  reduceOnly: boolean;
  expectedSide: "close_long" | "close_short" | "cancel";
  size: string;
  sizeRaw: string;
  notionalUsdEstimate: string | null;
  markPrice: string | null;
  worstAcceptablePrice: string | null;
  maxSlippageBps: number | null;
  leverage: string | null;
  humanReadable: string;
  warnings: string[];
}

export interface PerplOrderSubmissionResult {
  status: "accepted" | "rejected" | "timeout" | "disconnected";
  requestId: number;
  orderId: string | null;
  perplStatus: number | null;
  perplStatusReason: number | null;
  message: string;
  receivedAt: string;
}

export interface PerplExecutionIntent {
  intentId: string;
  workflowId: string;
  status: "prepared" | "submitted" | "accepted" | "rejected" | "expired" | "cancelled" | "reconciled";
  source: "assetpilot";
  protocol: "perpl";
  network: "monad-testnet";
  createdAt: string;
  expiresAt: string;
  planHash: string;
  riskFingerprint: string;
  idempotencyKey: string;
  preview: PerplExactOrderPreview;
  perplResult: PerplOrderSubmissionResult | null;
  reasons: string[];
  warnings: string[];
  executionIntentReceiptId?: string | null;
  orderSubmissionReceiptId?: string | null;
  orderUpdateReceiptId?: string | null;
  orderFinalizedReceiptId?: string | null;
  reconciliationReceiptId?: string | null;
}

export interface PerplCreateExecutionIntentResponse {
  intent: PerplExecutionIntent;
  capabilities: PerplTradingCapabilities;
  executionIntentReceiptId: string | null;
}

export interface PerplWorkflowConfirmation {
  workflowId: string;
  confirmedAt: string;
  planHash: string;
  userConfirmationReceiptId: string | null;
}

export type PerplReceiptType =
  | "risk_review"
  | "user_confirmation"
  | "execution_intent"
  | "order_submission"
  | "order_update"
  | "order_finalized"
  | "execution_rejected"
  | "reconciliation"
  | "anchor_confirmation";

export interface PerplReceipt {
  schemaVersion: "assetpilot-perpl-receipt-v1";
  receiptId: string;
  receiptType: PerplReceiptType;
  sequenceNumber: number;
  createdAt: string;
  protocol: "perpl";
  network: "monad-testnet";
  chainId: 10143;
  workflowId: string;
  parentReceiptId: string | null;
  previousReceiptHash: string | null;
  receiptHash: string;
  hashAlgorithm: "sha256";
  signature: string | null;
  signingKeyId: string | null;
  receiptLayer: "application";
  policyEnforcement: "backend_pre_submission";
  onchainEnforced: false;
  onchainAnchored: boolean;
  onchainTxHash: string | null;
  source: "assetpilot";
  dataProvenance: {
    dataSources: string[];
    riskSnapshotFetchedAt: string | null;
    marketsFetchedAt: string | null;
    walletFetchedAt: string | null;
    positionsCount: number | null;
    ordersCount: number | null;
    historyComplete: boolean | null;
    warnings: string[];
  };
  riskDecision?: { decision: "approve" | "revise" | "reject"; approvedActionIds: string[]; rejectedActionIds: string[] };
  risk?: { riskScore: number | null; riskLevel: string; scoreCoveragePercent: number; issueCodes: string[] };
  strategy?: { objective: string; status: string; actionSummaries: Array<{ actionId: string; type: string; summary: string }> };
  simulation?: { beforeScore: number | null; afterScore: number | null; scoreDelta: number | null; warnings: string[] };
  policy?: { policyHash: string; policyExpiry: string; checksPerformed: string[]; passedChecks: string[]; failedChecks: string[] };
  planHash?: string;
  intentId?: string;
  orderStatus?: string;
  currentStatus?: string;
  finalStatus?: string;
  anchoredReceiptId?: string;
  anchoredReceiptHash?: string;
  contractAddress?: string;
  txHash?: string;
  submitter?: string;
  anchoredAt?: string;
}

export interface PerplReceiptListResponse {
  data: PerplReceipt[];
  nextCursor: string | null;
}

export interface PerplReceiptVerification {
  receiptHashValid: boolean;
  chainLinkValid: boolean;
  parentValid: boolean;
  signaturePresent: boolean;
  signatureValid: boolean | null;
  onchainAnchored: boolean;
  verificationErrors: string[];
}

export interface PerplReceiptAnchorStatus {
  receiptId: string;
  receiptHash: string;
  anchored: boolean;
  chainId?: 10143;
  contractAddress?: string;
  txHash?: string;
  submitter?: string;
  anchoredAt?: string;
  anchorReceiptId?: string;
}

export interface PerplReceiptAnchorRequest {
  chainId: 10143;
  contractAddress: string;
  txHash: string;
  submitter: string;
}

export interface PerplReceiptChainVerification {
  valid: boolean;
  receiptCount: number;
  firstSequence: number | null;
  lastSequence: number | null;
  lastReceiptHash: string | null;
  corruptedSequence: number | null;
  errors: string[];
}

export type RealtimeStatus = "idle" | "connecting" | "connected" | "subscribing" | "live" | "reconnecting" | "degraded" | "stale" | "failed" | "stopped";
export type RealtimeDataMode = "websocket" | "rest_fallback" | "mixed" | "unavailable";
export type RealtimeChannel = "ticker" | "funding" | "orderbook" | "heartbeat";

export interface PerplRealtimeStatus {
  source: "perpl";
  network: "monad-testnet";
  status: RealtimeStatus;
  mode: RealtimeDataMode;
  wsUrl: string;
  publicOnly: true;
  connected: boolean;
  subscriptions: string[];
  marketCount: number;
  lastMessageAt: string | null;
  lastRestSyncAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
}

export interface PerplTickerState {
  marketId: number;
  source: "perpl";
  network: "monad-testnet";
  mode: RealtimeDataMode;
  fetchedAt: string;
  updatedAt: string;
  sequence: number | null;
  status: RealtimeStatus;
  values: {
    oraclePrice: string | null;
    markPrice: string | null;
    lastPrice: string | null;
    midPrice: string | null;
    bestBid: string | null;
    bestAsk: string | null;
    dailyVolumeSize: string | null;
    dailyVolumeAmount: string | null;
    openInterest: string | null;
    totalValueLocked: string | null;
  };
}

export interface PerplFundingState {
  marketId: number;
  source: "perpl";
  network: "monad-testnet";
  mode: RealtimeDataMode;
  fetchedAt: string;
  updatedAt: string;
  sequence: number | null;
  status: RealtimeStatus;
  fundingRateMicros: number | null;
  fundingIndexPrice: string | null;
  event: unknown | null;
}

export interface PerplOrderBookState {
  marketId: number;
  source: "perpl";
  network: "monad-testnet";
  mode: RealtimeDataMode;
  fetchedAt: string;
  updatedAt: string;
  sequence: number | null;
  status: RealtimeStatus;
  hasBaseSnapshot: boolean;
  bids: Array<{ price: string; size: string; orders: number; rawPrice: string; rawSize: string }>;
  asks: Array<{ price: string; size: string; orders: number; rawPrice: string; rawSize: string }>;
}

export interface PerplRealtimeMarketSnapshot {
  market: PerplMarket;
  ticker: PerplTickerState | null;
  funding: PerplFundingState | null;
  orderbook: PerplOrderBookState | null;
}

export interface PerplRealtimeSnapshotEvent {
  markets: PerplRealtimeMarketSnapshot[];
  status: PerplRealtimeStatus;
}

export interface SystemStatusResponse {
  source: "assetpilot";
  network: "monad-testnet";
  checkedAt: string;
  services: Record<string, { status: "ok" | "degraded"; detail: string }>;
}
