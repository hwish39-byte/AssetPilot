import type {
  AnalyzeRequest,
  ExecutionSummaryRequest,
  GenerateStrategyRequest,
  PolicyDraft,
  ReviewRiskRequest,
  Strategy
} from "./types.js";

export const strategyJsonSchema = {
  type: "object",
  required: ["goal", "marketSnapshotHash", "actions", "expectedImpact"],
  properties: {
    goal: { type: "string" },
    marketSnapshotHash: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: [
          "actionType",
          "sellToken",
          "buyToken",
          "sellAmountUsd",
          "expectedBuyAmount",
          "minBuyAmount"
        ]
      }
    },
    expectedImpact: { type: "object" }
  }
} as const;

export class ValidationError extends Error {
  public readonly statusCode = 400;
  public readonly details: string[];

  constructor(details: string[]) {
    super("Invalid request body");
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePolicy(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must be an object`];
  if (!isNumber(value.maxSpendUsd) || value.maxSpendUsd < 0) errors.push(`${path}.maxSpendUsd must be a non-negative number`);
  if (!isNumber(value.maxSingleTradeUsd) || value.maxSingleTradeUsd < 0) errors.push(`${path}.maxSingleTradeUsd must be a non-negative number`);
  if (!isNumber(value.maxSlippageBps) || value.maxSlippageBps < 0 || value.maxSlippageBps > 10000) {
    errors.push(`${path}.maxSlippageBps must be between 0 and 10000`);
  }
  if (!Array.isArray(value.allowedAssets) || !value.allowedAssets.every(isNonEmptyString)) {
    errors.push(`${path}.allowedAssets must be an array of symbols`);
  }
  if (!Array.isArray(value.blockedAssets) || !value.blockedAssets.every(isNonEmptyString)) {
    errors.push(`${path}.blockedAssets must be an array of symbols`);
  }
  return errors;
}

export function validateStrategy(value: unknown, path = "strategy"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${path} must match strategy JSON schema`];
  if (!isNonEmptyString(value.goal)) errors.push(`${path}.goal must be a non-empty string`);
  if (!isNonEmptyString(value.marketSnapshotHash)) errors.push(`${path}.marketSnapshotHash must be a non-empty string`);
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    errors.push(`${path}.actions must be a non-empty array`);
  } else {
    value.actions.forEach((action, index) => {
      const actionPath = `${path}.actions[${index}]`;
      if (!isRecord(action)) {
        errors.push(`${actionPath} must be an object`);
        return;
      }
      if (action.actionType !== "SELL" && action.actionType !== "BUY") {
        errors.push(`${actionPath}.actionType must be SELL or BUY`);
      }
      if (!isNonEmptyString(action.sellToken)) errors.push(`${actionPath}.sellToken must be a symbol`);
      if (!isNonEmptyString(action.buyToken)) errors.push(`${actionPath}.buyToken must be a symbol`);
      if (!isNumber(action.sellAmountUsd) || action.sellAmountUsd <= 0) errors.push(`${actionPath}.sellAmountUsd must be positive`);
      if (!isNumber(action.expectedBuyAmount) || action.expectedBuyAmount <= 0) errors.push(`${actionPath}.expectedBuyAmount must be positive`);
      if (!isNumber(action.minBuyAmount) || action.minBuyAmount < 0) errors.push(`${actionPath}.minBuyAmount must be non-negative`);
    });
  }

  if (!isRecord(value.expectedImpact)) {
    errors.push(`${path}.expectedImpact must be an object`);
  } else {
    const impact = value.expectedImpact;
    if (!isNumber(impact.riskScoreBefore)) errors.push(`${path}.expectedImpact.riskScoreBefore must be a number`);
    if (!isNumber(impact.riskScoreAfter)) errors.push(`${path}.expectedImpact.riskScoreAfter must be a number`);
    if (!isNonEmptyString(impact.aiExposureBefore)) errors.push(`${path}.expectedImpact.aiExposureBefore must be a string`);
    if (!isNonEmptyString(impact.aiExposureAfter)) errors.push(`${path}.expectedImpact.aiExposureAfter must be a string`);
    if (!isNonEmptyString(impact.cashBufferBefore)) errors.push(`${path}.expectedImpact.cashBufferBefore must be a string`);
    if (!isNonEmptyString(impact.cashBufferAfter)) errors.push(`${path}.expectedImpact.cashBufferAfter must be a string`);
  }

  return errors;
}

export function assertAnalyzeRequest(value: unknown): AnalyzeRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  if (!Array.isArray(value.portfolio) || value.portfolio.length === 0) {
    errors.push("portfolio must be a non-empty array");
  } else {
    value.portfolio.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`portfolio[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(item.symbol)) errors.push(`portfolio[${index}].symbol must be a symbol`);
      if (!isNumber(item.valueUsd) || item.valueUsd < 0) errors.push(`portfolio[${index}].valueUsd must be non-negative`);
    });
  }
  if (!isRecord(value.marketSnapshot)) errors.push("marketSnapshot must be an object");
  if (!isNonEmptyString(value.userGoal)) errors.push("userGoal must be a non-empty string");
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as AnalyzeRequest;
}

export function assertGenerateStrategyRequest(value: unknown): GenerateStrategyRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  if (!isNonEmptyString(value.userGoal)) errors.push("userGoal must be a non-empty string");
  if (!isRecord(value.analystResult)) errors.push("analystResult must be an object");
  if (!isRecord(value.marketSnapshot)) errors.push("marketSnapshot must be an object");
  errors.push(...validatePolicy(value.policyDraft, "policyDraft"));
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as GenerateStrategyRequest;
}

export function assertReviewRiskRequest(value: unknown): ReviewRiskRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  errors.push(...validateStrategy(value.strategy));
  errors.push(...validatePolicy(value.policy, "policy"));
  if (!isRecord(value.analystResult)) errors.push("analystResult must be an object");
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as ReviewRiskRequest;
}

export function assertExecutionSummaryRequest(value: unknown): ExecutionSummaryRequest {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ValidationError(["body must be an object"]);
  errors.push(...validateStrategy(value.strategy));
  if (!isNonEmptyString(value.policyId)) errors.push("policyId must be a non-empty string");
  if (!isNonEmptyString(value.strategyHash)) errors.push("strategyHash must be a non-empty string");
  if (!isNonEmptyString(value.marketSnapshotHash)) errors.push("marketSnapshotHash must be a non-empty string");
  if (errors.length) throw new ValidationError(errors);
  return value as unknown as ExecutionSummaryRequest;
}

export function assertStrategy(value: unknown): Strategy {
  const errors = validateStrategy(value);
  if (errors.length) throw new ValidationError(errors);
  return value as Strategy;
}

export function assertPolicy(value: unknown): PolicyDraft {
  const errors = validatePolicy(value, "policy");
  if (errors.length) throw new ValidationError(errors);
  return value as PolicyDraft;
}
