import { PerplApiError } from "../../perpl/errors.js";
import { decimalOrNull } from "../../risk/decimal.js";
import type { PerplAgentAction, PerplAgentPolicy, PerplAgentWorkflowRequest, PerplStrategyOutput } from "./types.js";

const actionTypes = ["reduce_position", "close_position", "cancel_order", "add_collateral", "place_order", "hold"] as const;
const forbiddenRequestFields = [
  "apiKey",
  "apiSecret",
  "secret",
  "signature",
  "headers",
  "positions",
  "orders",
  "prices",
  "simulation",
  "riskSnapshot",
  "wallet",
  "credentials"
] as const;

export function assertPerplAgentWorkflowRequest(value: unknown): PerplAgentWorkflowRequest {
  const errors = validatePerplAgentWorkflowRequest(value);
  if (errors.length > 0) throw badRequest(errors.join("; "));
  const record = value as Record<string, unknown>;
  return {
    userGoal: String(record.userGoal),
    mode: "dry_run",
    preferredLanguage: record.preferredLanguage === "en" ? "en" : record.preferredLanguage === "zh-CN" ? "zh-CN" : undefined,
    currentState: typeof record.currentState === "string" ? record.currentState : undefined,
    policy: normalizePolicy(record.policy as Record<string, unknown>)
  };
}

export function validatePerplAgentWorkflowRequest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["request body must be an object"];
  if (!nonEmpty(value.userGoal)) errors.push("userGoal must be a non-empty string");
  if (value.mode !== "dry_run") errors.push("mode must be dry_run");
  if (value.preferredLanguage !== undefined && value.preferredLanguage !== "zh-CN" && value.preferredLanguage !== "en") {
    errors.push("preferredLanguage must be zh-CN or en");
  }
  for (const field of forbiddenRequestFields) {
    if (field in value) errors.push(`${field} is not accepted on Perpl agent requests`);
  }
  errors.push(...validatePolicy(value.policy, "policy"));
  return errors;
}

export function validatePolicy(value: unknown, path = "policy"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!numberArray(value.allowedAccountIds)) errors.push(`${path}.allowedAccountIds must be an array of numbers`);
  if (!numberArray(value.allowedMarketIds)) errors.push(`${path}.allowedMarketIds must be an array of numbers`);
  if (!Array.isArray(value.allowedActions) || !value.allowedActions.every((item) => actionTypes.includes(item))) {
    errors.push(`${path}.allowedActions must contain supported Perpl actions`);
  }
  if (!integerIn(value.maxActionsPerStrategy, 1, 5)) errors.push(`${path}.maxActionsPerStrategy must be an integer from 1 to 5`);
  if (!positiveNumber(value.maxLeverage)) errors.push(`${path}.maxLeverage must be positive`);
  if (!positiveDecimal(value.maxOrderNotionalUsd)) errors.push(`${path}.maxOrderNotionalUsd must be a positive decimal string`);
  if (!positiveDecimal(value.maxTotalNotionalUsd)) errors.push(`${path}.maxTotalNotionalUsd must be a positive decimal string`);
  if (!numberIn(value.maxSlippageBps, 0, 10_000)) errors.push(`${path}.maxSlippageBps must be 0..10000`);
  if (!numberIn(value.maxReductionPercentage, 0, 1)) errors.push(`${path}.maxReductionPercentage must be 0..1`);
  if (typeof value.allowIncreaseExposure !== "boolean") errors.push(`${path}.allowIncreaseExposure must be boolean`);
  if (typeof value.requireSimulation !== "boolean") errors.push(`${path}.requireSimulation must be boolean`);
  if (typeof value.requireRiskImprovement !== "boolean") errors.push(`${path}.requireRiskImprovement must be boolean`);
  if (!numberIn(value.minimumRiskScoreImprovement, 0, 100)) errors.push(`${path}.minimumRiskScoreImprovement must be 0..100`);
  if (!nonEmpty(value.expiresAt) || Number.isNaN(Date.parse(value.expiresAt))) errors.push(`${path}.expiresAt must be an ISO timestamp`);
  return errors;
}

export function validateStrategyOutput(strategy: PerplStrategyOutput): string[] {
  const errors: string[] = [];
  if (strategy.status === "clarification_required") return errors;
  if (strategy.status !== "generated") errors.push("strategy.status must be generated or clarification_required");
  if (!strategy.objective) errors.push("strategy.objective is required");
  if (!Array.isArray(strategy.actions) || strategy.actions.length === 0) {
    errors.push("strategy.actions must be non-empty");
    return errors;
  }
  const ids = new Set<string>();
  for (const [index, action] of strategy.actions.entries()) {
    const path = `strategy.actions[${index}]`;
    errors.push(...validateAction(action, path));
    if (ids.has(action.actionId)) errors.push(`${path}.actionId must be unique`);
    ids.add(action.actionId);
  }
  return errors;
}

export function validateAction(action: PerplAgentAction, path = "action"): string[] {
  const errors: string[] = [];
  if (!isRecord(action)) return [`${path} must be an object`];
  if (!nonEmpty(action.actionId)) errors.push(`${path}.actionId is required`);
  if (!actionTypes.includes(action.type)) errors.push(`${path}.type is unsupported`);
  if (!nonEmpty(action.rationale)) errors.push(`${path}.rationale is required`);
  if (!Array.isArray(action.expectedEffects) || !action.expectedEffects.every(nonEmpty)) errors.push(`${path}.expectedEffects must be strings`);
  if (!Number.isInteger(action.targetAccountId)) errors.push(`${path}.targetAccountId must be an integer`);
  if (!numberIn(action.confidence, 0, 1)) errors.push(`${path}.confidence must be 0..1`);
  if (!Array.isArray(action.assumptions) || !action.assumptions.every(nonEmpty)) errors.push(`${path}.assumptions must be strings`);
  if (action.type === "reduce_position") {
    if (!nonEmpty(action.positionId)) errors.push(`${path}.positionId is required`);
    if (!numberIn(action.percentage, 0, 1) || action.percentage <= 0 || action.percentage >= 1) errors.push(`${path}.percentage must be >0 and <1`);
    if (!numberIn(action.maxSlippageBps, 0, 10_000)) errors.push(`${path}.maxSlippageBps must be 0..10000`);
  } else if (action.type === "close_position") {
    if (!nonEmpty(action.positionId)) errors.push(`${path}.positionId is required`);
    if (!numberIn(action.maxSlippageBps, 0, 10_000)) errors.push(`${path}.maxSlippageBps must be 0..10000`);
  } else if (action.type === "cancel_order") {
    if (!nonEmpty(action.orderId)) errors.push(`${path}.orderId is required`);
  } else if (action.type === "add_collateral") {
    if (!Number.isInteger(action.accountId)) errors.push(`${path}.accountId must be an integer`);
    if (!positiveDecimal(action.amount)) errors.push(`${path}.amount must be a positive decimal string`);
  } else if (action.type === "place_order") {
    if (!Number.isInteger(action.marketId)) errors.push(`${path}.marketId must be an integer`);
    if (action.side !== "long" && action.side !== "short") errors.push(`${path}.side must be long or short`);
    if (action.orderType !== "market" && action.orderType !== "limit") errors.push(`${path}.orderType must be market or limit`);
    if (!positiveDecimal(action.size)) errors.push(`${path}.size must be a positive decimal string`);
    if (action.orderType === "limit" && !positiveDecimal(action.limitPrice)) errors.push(`${path}.limitPrice is required for limit orders`);
    if (action.orderType === "market" && action.limitPrice !== null) errors.push(`${path}.limitPrice must be null for market orders`);
    if (!positiveDecimal(action.leverage)) errors.push(`${path}.leverage must be a positive decimal string`);
    if (typeof action.reduceOnly !== "boolean") errors.push(`${path}.reduceOnly must be boolean`);
    if (!numberIn(action.maxSlippageBps, 0, 10_000)) errors.push(`${path}.maxSlippageBps must be 0..10000`);
    if (!nonEmpty(action.timeInForce)) errors.push(`${path}.timeInForce is required`);
  } else if (action.type === "hold") {
    if (!nonEmpty(action.reason)) errors.push(`${path}.reason is required`);
    for (const forbidden of ["positionId", "orderId", "size", "marketId", "limitPrice"]) {
      if (forbidden in action) errors.push(`${path}.${forbidden} is not allowed on hold`);
    }
  }
  return errors;
}

export function normalizePolicy(value: Record<string, unknown>): PerplAgentPolicy {
  return {
    allowedAccountIds: value.allowedAccountIds as number[],
    allowedMarketIds: value.allowedMarketIds as number[],
    allowedActions: value.allowedActions as PerplAgentPolicy["allowedActions"],
    maxActionsPerStrategy: Number(value.maxActionsPerStrategy),
    maxLeverage: Number(value.maxLeverage),
    maxOrderNotionalUsd: String(value.maxOrderNotionalUsd),
    maxTotalNotionalUsd: String(value.maxTotalNotionalUsd),
    maxSlippageBps: Number(value.maxSlippageBps),
    maxReductionPercentage: Number(value.maxReductionPercentage),
    allowIncreaseExposure: Boolean(value.allowIncreaseExposure),
    requireSimulation: Boolean(value.requireSimulation),
    requireRiskImprovement: Boolean(value.requireRiskImprovement),
    minimumRiskScoreImprovement: Number(value.minimumRiskScoreImprovement),
    expiresAt: String(value.expiresAt)
  };
}

function badRequest(message: string): PerplApiError {
  return new PerplApiError({ code: "PERPL_CONFIG_ERROR", statusCode: 400, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function numberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function integerIn(value: unknown, min: number, max: number): boolean {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function numberIn(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function positiveDecimal(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const decimal = decimalOrNull(String(value));
  return !!decimal && decimal.gt(0);
}

export function throwBadPerplAgentRequest(message: string): never {
  throw badRequest(message);
}
