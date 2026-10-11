# Perpl Risk Methodology

The Perpl risk engine consumes signed read-only wallet data and public market context. It does not use mock data to fill missing Perpl fields.

## Components

Risk considers:

- wallet balance and locked balance ratio
- gross, long, short, and net notional exposure
- effective leverage estimate
- largest position concentration
- open position and order counts
- liquidation distance when available
- funding exposure
- realized performance, drawdown, fees, win rate, and streaks from history

## Data Quality

Missing fields are reported in `dataQuality.missingFields` or warnings. Missing values are not converted to fake zeroes for scoring. Low coverage can produce `riskLevel: "unknown"`.

## Simulation

Simulation compares before/after risk from proposed actions. It is deterministic and does not submit Perpl orders. Unsupported or exposure-increasing actions can be blocked before execution.

## Agent Review

The Risk Agent can approve, revise, or reject. The execution service accepts only deterministic, approved, guarded reduce-only or cancel flows within configured policy limits.
