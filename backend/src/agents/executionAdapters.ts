import type {
  ExecutionAdapterResult,
  MarketSnapshotInput,
  StrategyActionV2,
  StrategyJson
} from "../types.js";

export function buildMockAmmContractPayload(
  action: StrategyActionV2,
  strategy: StrategyJson,
  marketSnapshot: MarketSnapshotInput | Record<string, unknown>
): ExecutionAdapterResult {
  if (action.type !== "swap") {
    return unsupported(`mock_amm adapter only supports swap actions, received ${action.type}.`);
  }
  if (action.protocol !== "mock_amm") {
    return unsupported(`mock_amm adapter does not support protocol ${action.protocol ?? "null"}.`);
  }
  if (!action.from_asset || !action.to_asset) {
    return unsupported("mock_amm swap requires from_asset and to_asset.");
  }
  if (action.amount.mode !== "usd_value") {
    return unsupported(`mock_amm swap requires usd_value amount, received ${action.amount.mode}.`);
  }
  if (typeof action.amount.value !== "number" || !Number.isFinite(action.amount.value) || action.amount.value <= 0) {
    return unsupported("mock_amm swap requires a positive amount.value.");
  }

  const buyPrice = priceFor(action.to_asset, marketSnapshot);
  if (buyPrice === null || buyPrice <= 0) {
    return unsupported(`Missing or invalid price for ${action.to_asset}.`);
  }

  const sellAmountUsd = round(action.amount.value);
  const expectedBuyAmount = round(action.to_asset === "USDC" ? sellAmountUsd : sellAmountUsd / buyPrice);
  const actionSlippage = action.constraints.max_slippage_bps;
  const maxSlippageBps = typeof actionSlippage === "number" ? actionSlippage : strategy.constraints.max_slippage_bps;
  if (typeof maxSlippageBps !== "number" || !Number.isFinite(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 10000) {
    return unsupported("Missing or invalid max_slippage_bps for mock_amm payload.");
  }
  const minBuyAmount = round(expectedBuyAmount * (1 - maxSlippageBps / 10000));

  return {
    supported: true,
    payload: {
      action_id: action.action_id,
      adapter: "mock_amm",
      contract_method: "executeStrategy",
      sell_token_symbol: action.from_asset,
      buy_token_symbol: action.to_asset,
      sell_amount_usd: sellAmountUsd,
      expected_buy_amount: expectedBuyAmount,
      min_buy_amount: minBuyAmount,
      max_slippage_bps: maxSlippageBps,
      human_readable: `Contract payload: executeStrategy swap ${sellAmountUsd} USD of ${action.from_asset} to at least ${minBuyAmount} ${action.to_asset} via mock_amm.`
    },
    reason: null
  };
}

function unsupported(reason: string): ExecutionAdapterResult {
  return {
    supported: false,
    payload: null,
    reason
  };
}

function priceFor(symbol: string, marketSnapshot: MarketSnapshotInput | Record<string, unknown>): number | null {
  const nestedPrices = marketSnapshot.prices;
  if (isPriceRecord(nestedPrices) && typeof nestedPrices[symbol] === "number") {
    return nestedPrices[symbol];
  }

  const directPrice = marketSnapshot[symbol];
  return typeof directPrice === "number" && Number.isFinite(directPrice) ? directPrice : null;
}

function isPriceRecord(value: unknown): value is Record<string, number> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
