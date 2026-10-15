# Risk Methodology

AssetPilot calculates application-level estimates from Perpl read-only account data and public market context. The score is a deterministic heuristic, not Perpl's official margin model, a liquidation forecast, or a measured probability of loss.

## Inputs and history coverage

The risk service requests wallet accounts, open positions, orders, fills, account/order/position history, and portfolio equity and PnL. Read credentials are required. The current bundle uses `Promise.all`: a failed request can fail the entire snapshot rather than produce a partially populated bundle.

History defaults to 50 records per request, capped at 100. The bundle fetches one page each of account, order, and position history; remaining page tokens mark history incomplete. `pagesFetched: 3` describes those three history requests, not a complete traversal. Fill pagination is not included in that completeness flag. Portfolio history defaults to `week`.

## Wallet and position estimates

| Metric | Current calculation |
| --- | --- |
| Position notional | Absolute position size multiplied by current mark price |
| Gross exposure | Long notional plus short notional |
| Net directional exposure | Long notional minus short notional |
| Estimated unrealized PnL | Mark-to-entry price difference multiplied by absolute size, adjusted for direction |
| Effective leverage estimate | Gross exposure divided by balance plus estimated unrealized PnL; balance is used if that estimate is unavailable |
| Largest position share | Largest position notional divided by gross exposure |
| Locked balance ratio | Total locked balance divided by total balance |
| Long/short skew | Net directional exposure divided by gross exposure |

The implementation uses decimal.js with 50-digit precision for derived arithmetic. Monetary values are generally returned as decimal strings. Risk values and ratios are estimates derived from the available snapshot, not exact exchange accounting.

`liquidationPrice` and `liquidationDistancePercent` are currently always `null` in position risk output. The engine retains a liquidation-distance component for future data integration, but it is unavailable today.

## Score and coverage

Component scores range from 0 to 100. The configured weights are:

| Component | Weight | Current basis |
| --- | --- | --- |
| Liquidation distance | 30 | Unavailable with the current position mapping |
| Leverage | 20 | Highest open-position leverage, not the effective leverage estimate |
| Concentration | 15 | Largest position share |
| Margin usage proxy | 15 | Locked balance ratio; not official margin utilization |
| Maximum drawdown | 10 | Returned portfolio equity series |
| Funding exposure | 5 | Largest absolute raw funding rate among positions |
| Open-order exposure | 5 | Count-based proxy, capped at `min(1, openOrderCount * 0.1)` when the balance estimate is positive |

Thresholds are piecewise linear; see [riskScore.ts](../backend/src/risk/riskScore.ts) for the interpolation points. Funding is evaluated in the raw micros representation, not annualized yield. The open-order component does not calculate exact outstanding order notional.

Only applicable, available components contribute to the weighted mean:

```text
coverage = available applicable weight / total applicable weight * 100
score = sum(component score * available component weight) / available weight
```

A critical issue raises a non-null score to at least 75. Coverage below 60% makes `riskLevel` equal to `unknown`, even if a numeric score is present. Otherwise, score thresholds are:

| Score | Level |
| --- | --- |
| Below 25 | `low` |
| 25 to below 50 | `medium` |
| 50 to below 75 | `high` |
| 75 and above | `critical` |

No positions and no orders sets `noExposure: true`; it does not guarantee a zero score because locked-balance and drawdown components can still apply. Frozen accounts produce an issue and are separately blocked by trading capability checks.

## Performance and data quality

Performance output includes realized PnL, funding PnL, fees, win rate, profit factor, drawdown, holding time, streaks, and per-market results over the fetched history. Profit factor is `null` when there are no losing closed positions. Closed-position PnL and fee totals currently aggregate raw history fields without the collateral scaling used by normalized wallet and fill values; do not treat those totals as audited USD figures without validating their units.

Missing position size, entry price, mark price, and side are surfaced through position warnings and `dataQuality.missingFields`. Unavailable score components are excluded from the mean. However, several balance, exposure, and performance aggregates use zero fallbacks for missing numeric fields; the implementation does not guarantee that every missing value propagates as `null`.

`dataQuality.stale` is currently initialized to `false`; the risk engine does not independently enforce a timestamp-age threshold. Realtime connection staleness is a separate mechanism. Coverage measures component availability, not accuracy, completeness, or freshness.

## Simulation

`POST /api/perpl/risk/simulate` clones the input bundle and recomputes the snapshot without submitting orders.

| Action | Simulated effect |
| --- | --- |
| `hold` | No portfolio change |
| `reduce_position` | Multiply size by `1 - percentage`; percentage is a fraction strictly between 0 and 1 |
| `close_position` | Remove the selected position |
| `cancel_order` | Remove the selected open order |
| `add_collateral` | Increase the first wallet account's balance by the hypothetical amount |

Simulation preserves current prices and historical performance. It does not model execution, margin release, realized PnL settlement, future fees, slippage, funding changes, or new equity history. Reducing position size also leaves its reported leverage field unchanged, so some score components may not improve. The manual simulator does not create confirmation or execution receipts.

**Known reduction-unit mismatch:** Agent actions and simulation use `0.25` for 25%, while the current trading order builder divides the received value by 100. A value of `0.25` therefore builds a 0.25% reduction, subject to rounding. Dry-run reduction results must not be presented as matching the submitted quantity until this is fixed and tested end to end. `close_position` uses a separate 100% construction path.

## Agent review and submission scope

The Analyst derives facts deterministically and may use an LLM for its summary. Strategy generation uses a validated LLM candidate where accepted, otherwise deterministic logic. With no exposure it can choose `hold`; low coverage or data-quality concerns can require clarification.

The deterministic Risk Reviewer checks action schema and IDs, policy expiry, allowed accounts/actions/markets, action count, reduction and slippage limits, relevant notional/leverage rules, simulation requirements, and required score improvement. Its outcomes are `approve`, `revise`, or `reject`; revisions require another run. Checks differ by action type, and the policy's total-notional comparison is per action rather than a cumulative strategy budget.

A policy with `minimumRiskScoreImprovement: 0` permits equal before/after scores. Approval is not evidence of a strictly improved score or a successful trade. `place_order` is not supported by the simulator or testnet execution builder, and adding collateral is hypothetical only. Actual intent preparation accepts exactly one approved reduction, closure, or cancellation. See [security notes](SECURITY.md) for execution limitations.

## Implementation references

[Risk snapshot](../backend/src/risk/perplRiskService.ts) · [wallet metrics](../backend/src/risk/walletMetrics.ts) · [performance metrics](../backend/src/risk/performanceMetrics.ts) · [simulation](../backend/src/risk/simulator.ts) · [deterministic review](../backend/src/agents/perpl/riskReviewer.ts)
