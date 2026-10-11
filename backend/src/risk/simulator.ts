import { PerplApiError } from "../perpl/errors.js";
import type { PerplMarket } from "../perpl/types.js";
import { decimalOrNull, round } from "./decimal.js";
import {
  buildRiskSnapshot,
  cloneBundleForSimulation,
  findOrderOrThrow,
  findPositionOrThrow
} from "./perplRiskService.js";
import type {
  PerplRiskAction,
  PerplRiskDataBundle,
  PerplRiskSimulationRequest,
  PerplRiskSimulationResult,
  PerplRiskSnapshot
} from "./perplRiskTypes.js";
import { cloneWithAdjustedBalance, reducePosition } from "./walletMetrics.js";

export function simulatePerplRisk(
  before: PerplRiskSnapshot,
  bundle: PerplRiskDataBundle,
  markets: PerplMarket[],
  request: PerplRiskSimulationRequest
): PerplRiskSimulationResult {
  validateActions(request);
  const simulated = cloneBundleForSimulation(bundle);
  const assumptions: string[] = [
    "Simulation is deterministic and does not submit Perpl orders.",
    "No future fees, slippage, funding changes, or execution price changes are forecast."
  ];
  const warnings: string[] = [];

  for (const action of request.actions) {
    if (action.type === "hold") continue;
    if (action.type === "reduce_position") {
      findPositionOrThrow(simulated.positions, action.positionId);
      simulated.positions = simulated.positions.map((position) =>
        position.positionId === action.positionId ? reducePosition(position, action.percentage) : position
      );
      assumptions.push(`Reduced position ${action.positionId} size by ${round(action.percentage * 100, 2)}%.`);
    } else if (action.type === "close_position") {
      findPositionOrThrow(simulated.positions, action.positionId);
      simulated.positions = simulated.positions.filter((position) => position.positionId !== action.positionId);
      assumptions.push(`Removed position ${action.positionId} from simulated open positions.`);
    } else if (action.type === "cancel_order") {
      findOrderOrThrow(simulated.orders, action.orderId);
      simulated.orders = simulated.orders.filter((order) => order.orderId !== action.orderId);
      assumptions.push(`Removed order ${action.orderId} from simulated open orders.`);
    } else if (action.type === "add_collateral") {
      simulated.wallet = cloneWithAdjustedBalance(simulated.wallet, action.amount);
      assumptions.push("Added hypothetical collateral to simulated balance only.");
    }
  }

  const after = buildRiskSnapshot(simulated, markets, before.calculatedAt);
  const scoreDelta = before.score === null || after.score === null ? null : round(after.score - before.score, 2);
  const changedComponents = after.components.filter((component) => {
    const previous = before.components.find((candidate) => candidate.id === component.id);
    return previous?.score !== component.score || previous?.available !== component.available || previous?.applicable !== component.applicable;
  });

  return {
    beforeMetrics: before.walletMetrics,
    beforeScore: before.score,
    afterMetrics: after.walletMetrics,
    afterScore: after.score,
    scoreDelta,
    changedComponents,
    assumptions,
    warnings,
    actions: request.actions,
    before,
    after
  };
}

export function validateActions(request: PerplRiskSimulationRequest): void {
  if (!request || !Array.isArray(request.actions)) {
    throw badRequest("actions must be an array.");
  }
  for (const action of request.actions) {
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      throw badRequest("Each action must include a type.");
    }
    if (action.type === "reduce_position") {
      if (typeof action.positionId !== "string" || action.positionId.length === 0) throw badRequest("reduce_position requires positionId.");
      if (typeof action.percentage !== "number" || action.percentage <= 0 || action.percentage >= 1) {
        throw badRequest("reduce_position percentage must be greater than 0 and less than 1.");
      }
    } else if (action.type === "close_position") {
      if (typeof action.positionId !== "string" || action.positionId.length === 0) throw badRequest("close_position requires positionId.");
    } else if (action.type === "cancel_order") {
      if (typeof action.orderId !== "string" || action.orderId.length === 0) throw badRequest("cancel_order requires orderId.");
    } else if (action.type === "add_collateral") {
      const amount = decimalOrNull(action.amount);
      if (!amount || amount.lte(0)) throw badRequest("add_collateral amount must be a positive decimal string.");
    } else if (action.type !== "hold") {
      throw badRequest(`Unsupported action type: ${(action as { type?: string }).type ?? "unknown"}`);
    }
  }
}

function badRequest(message: string): PerplApiError {
  return new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 400, message });
}
