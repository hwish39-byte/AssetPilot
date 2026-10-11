import { PerplApiError } from "../perpl/errors.js";
import { PerplService } from "../perpl/service.js";
import type { PerplMarket, PerplOrder, PerplPosition } from "../perpl/types.js";
import { calculatePerformanceMetrics } from "./performanceMetrics.js";
import {
  PERPL_RISK_METHODOLOGY_VERSION,
  type PerplDataQuality,
  type PerplRiskDataBundle,
  type PerplRiskOptions,
  type PerplRiskSnapshot
} from "./perplRiskTypes.js";
import { scoreRisk } from "./riskScore.js";
import { calculatePositionRisks, calculateWalletMetrics } from "./walletMetrics.js";

export class PerplRiskService {
  constructor(private readonly perplService = new PerplService()) {}

  async getRiskSnapshot(options: PerplRiskOptions = {}): Promise<PerplRiskSnapshot> {
    const [bundle, markets] = await Promise.all([this.perplService.getRiskDataBundle(options), this.perplService.getMarkets()]);
    return buildRiskSnapshot(bundle, markets);
  }

  async getRiskInputs(options: PerplRiskOptions = {}): Promise<{ bundle: PerplRiskDataBundle; markets: PerplMarket[]; snapshot: PerplRiskSnapshot }> {
    const [bundle, markets] = await Promise.all([this.perplService.getRiskDataBundle(options), this.perplService.getMarkets()]);
    return { bundle, markets, snapshot: buildRiskSnapshot(bundle, markets) };
  }
}

export function buildRiskSnapshot(
  bundle: PerplRiskDataBundle,
  markets: PerplMarket[],
  calculatedAt = new Date().toISOString()
): PerplRiskSnapshot {
  const walletMetrics = calculateWalletMetrics({
    wallet: bundle.wallet,
    positions: bundle.positions,
    orders: bundle.orders,
    markets
  });
  const positions = calculatePositionRisks({ wallet: bundle.wallet, positions: bundle.positions, orders: bundle.orders, markets });
  const performance = calculatePerformanceMetrics({
    positionHistory: bundle.positionHistory,
    fills: bundle.fills,
    portfolioEquity: bundle.portfolioEquity,
    markets
  });
  const dataQuality = dataQualityFrom(bundle, positions);
  const scoring = scoreRisk({
    walletMetrics,
    positions,
    performance,
    accountFrozen: bundle.wallet.accounts.some((account) => account.isFrozen),
    dataQuality
  });
  const noExposure = walletMetrics.openPositionCount === 0 && walletMetrics.openOrderCount === 0;

  return {
    source: "assetpilot",
    protocol: "perpl",
    network: "monad-testnet",
    methodologyVersion: PERPL_RISK_METHODOLOGY_VERSION,
    calculatedAt,
    accountIds: bundle.wallet.accounts.map((account) => account.accountId),
    noExposure,
    walletMetrics,
    positions,
    performance,
    score: scoring.score,
    riskLevel: scoring.riskLevel,
    scoreCoveragePercent: scoring.scoreCoveragePercent,
    components: scoring.components,
    issues: scoring.issues,
    dataQuality,
    history: {
      historyComplete: bundle.historyComplete,
      pagesFetched: bundle.pagesFetched,
      recordsFetched: bundle.recordsFetched
    }
  };
}

export function validateRiskOptions(query: { historyCount?: unknown; portfolioPeriod?: unknown }): PerplRiskOptions {
  const options: PerplRiskOptions = {};
  if (query.historyCount !== undefined) {
    if (typeof query.historyCount !== "string") throw badRequest("historyCount must be a string integer.");
    const parsed = Number(query.historyCount);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw badRequest("historyCount must be an integer from 1 to 100.");
    }
    options.historyCount = parsed;
  }
  if (query.portfolioPeriod !== undefined) {
    if (
      query.portfolioPeriod !== "all" &&
      query.portfolioPeriod !== "day" &&
      query.portfolioPeriod !== "2weeks" &&
      query.portfolioPeriod !== "week" &&
      query.portfolioPeriod !== "month"
    ) {
      throw badRequest("portfolioPeriod must be one of all, day, 2weeks, week, month.");
    }
    options.portfolioPeriod = query.portfolioPeriod;
  }
  return options;
}

function dataQualityFrom(bundle: PerplRiskDataBundle, positions: Array<{ dataWarnings: string[] }>): PerplDataQuality {
  const missingFields = positions.flatMap((position) => position.dataWarnings);
  const warnings = [
    ...missingFields,
    ...bundle.partialErrors.map((error) => `${error.source}:${error.code}`),
    ...(bundle.historyComplete ? [] : ["History pagination was capped before all records were fetched."])
  ];
  return {
    stale: false,
    partialHistory: !bundle.historyComplete || bundle.partialErrors.length > 0,
    missingFields,
    warnings
  };
}

function badRequest(message: string): PerplApiError {
  return new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 400, message });
}

export function cloneBundleForSimulation(bundle: PerplRiskDataBundle): PerplRiskDataBundle {
  return structuredClone(bundle) as PerplRiskDataBundle;
}

export function findPositionOrThrow(positions: PerplPosition[], positionId: string): PerplPosition {
  const position = positions.find((candidate) => candidate.positionId === positionId);
  if (!position) throw badRequest(`Position ${positionId} was not found.`);
  return position;
}

export function findOrderOrThrow(orders: PerplOrder[], orderId: string): PerplOrder {
  const order = orders.find((candidate) => candidate.orderId === orderId);
  if (!order) throw badRequest(`Order ${orderId} was not found.`);
  return order;
}
