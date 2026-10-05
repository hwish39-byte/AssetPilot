# AssetPilot PRD

## 1. Product Name

**AssetPilot**

**Subtitle:** Policy-controlled AI portfolio execution for tokenized assets.

AssetPilot is a policy-controlled AI portfolio execution system for tokenized assets. Users describe portfolio goals in natural language, specialized AI agents analyze risk and generate strategies, and smart contracts enforce user-signed policies before any execution can happen.

## 2. Product Summary

AssetPilot helps users manage tokenized asset portfolios safely with AI.

In the MVP, the portfolio contains mock tokenized equities and stablecoins:

- `mNVDA`
- `mAAPL`
- `mSPY`
- `USDC`

A user can say:

> Help me reduce AI stock concentration risk. Use at most 500 USDC, only trade mNVDA, mAAPL, mSPY, and USDC, do not buy mTSLA, and keep slippage below 1%.

AssetPilot then:

1. Analyzes the user's portfolio.
2. Generates a structured strategy JSON.
3. Reviews the strategy with a Risk Agent.
4. Lets the user sign an onchain policy.
5. Enforces whitelist, blacklist, amount, expiry, and slippage constraints in smart contracts.
6. Executes allowed strategies or refuses invalid ones.
7. Shows a clear before/after portfolio comparison.
8. Records execution or refusal receipts.

## 3. Problem

AI finance assistants can analyze markets and suggest trades, but users cannot safely delegate asset actions to them.

Current problems:

- AI trading agents can behave like black boxes.
- Users cannot easily define hard execution boundaries.
- Whitelist, blacklist, and slippage limits are often frontend-only warnings.
- AI-generated strategies are not always structured or auditable.
- Execution history lacks clear proof of user authorization.
- Strategy results are difficult to compare before and after execution.

AssetPilot solves this by turning natural language portfolio goals into structured strategies that are checked and enforced by smart contracts.

## 4. Product Positioning

AssetPilot is **not** an AI trading bot.

It does not focus on predicting stock prices or maximizing speculative returns. Its core value is controlled execution:

> AI can help manage a tokenized portfolio, but only inside user-defined onchain guardrails.

## 5. Target Users

Primary users:

- Users holding tokenized equities, ETFs, stablecoins, or RWA-style assets.
- Users who want AI-assisted portfolio management without giving AI full custody.
- DeFi users who want structured portfolio risk control.

Secondary users:

- Tokenized asset protocols.
- RWA asset issuers.
- AI agent builders.
- Onchain portfolio management tools.

## 6. Core Value

### 6.1 Natural Language Portfolio Goals

Users can express goals in Chinese or English:

- "帮我降低 AI 股票集中风险，最多交易 500 USDC。"
- "Reduce my AI stock exposure. Max spend is 500 USDC."
- "Do not buy mTSLA."
- "Keep at least 15% of the portfolio in USDC."

### 6.2 Multi-Agent Decision Flow

AssetPilot uses four AI agents:

- **Analyst Agent:** analyzes the current portfolio.
- **Strategy Agent:** converts user goals into structured strategy JSON.
- **Risk Agent:** reviews strategy safety and policy alignment.
- **Execution Agent:** submits approved strategy payloads to contracts.

### 6.3 Contract-Enforced Policies

User policies are enforced onchain, not just displayed in the UI.

Policies include:

- Allowed assets.
- Blocked assets.
- Maximum total spend.
- Maximum single trade size.
- Maximum slippage.
- Expiration time.
- Required simulation flag.
- User authorization signer.

### 6.4 Before/After Portfolio Comparison

The UI must show a clear visual comparison:

| Metric | Before | After |
| --- | --- | --- |
| Risk Score | 82 | 61 |
| AI Exposure | 76% | 58% |
| mNVDA Weight | 52% | 35% |
| USDC Buffer | 8% | 15% |

### 6.5 Strategy Receipts

Every execution or refusal generates a receipt containing:

- User.
- Agent.
- Authorized signer.
- Policy hash.
- Strategy hash.
- Market snapshot hash.
- Execution status.
- Refusal reason, if any.
- Transaction hash.

## 7. User Journey

### 7.1 Successful Execution Path

1. User connects wallet.
2. Dashboard shows current portfolio:
   - mNVDA: 52%
   - mAAPL: 18%
   - mSPY: 22%
   - USDC: 8%
3. User enters: "帮我降低 AI 股票集中风险，最多交易 500 USDC。"
4. Analyst Agent identifies high concentration in mNVDA and AI/tech exposure.
5. Strategy Agent creates a structured rebalance strategy.
6. Risk Agent approves the strategy.
7. User signs a policy allowing only mNVDA, mAAPL, mSPY, and USDC.
8. Smart contract checks whitelist, blacklist, max spend, expiry, and slippage.
9. Strategy executes through MockAMM.
10. UI shows portfolio before/after.
11. ReceiptRegistry records an execution receipt.

### 7.2 Refusal Path

1. User policy allows only mNVDA, mAAPL, mSPY, and USDC.
2. Agent attempts to buy mTSLA.
3. StrategyExecutor checks policy.
4. Contract refuses execution with `BUY_TOKEN_NOT_ALLOWED`.
5. ReceiptRegistry records a refusal receipt.
6. UI displays the refusal reason.

## 8. Functional Requirements

### 8.1 Wallet Connection

Requirements:

- Connect EVM wallet.
- Display user address.
- Display token balances.
- Display portfolio value.

### 8.2 Portfolio Dashboard

Requirements:

- Show total portfolio value.
- Show asset allocation chart.
- Show risk score.
- Show asset categories.
- Show recent receipts.

### 8.3 Market Snapshot

MVP uses mock tokens and mock oracle data, but every strategy must bind to a verifiable market snapshot.

Snapshot fields:

```solidity
struct MarketSnapshot {
    bytes32 snapshotHash;
    string source;
    uint256 createdAt;
    uint256 validUntil;
    address signedBy;
}
```

### 8.4 Analyst Agent

Input:

- Portfolio.
- Market snapshot.
- User goal.

Output:

- Risk score.
- Concentration risk.
- Sector exposure.
- Cash buffer.
- Risk summary.

### 8.5 Strategy Agent

Input:

- User goal.
- Analyst output.
- Market snapshot.
- Draft policy constraints.

Output:

```json
{
  "goal": "Reduce AI sector concentration",
  "marketSnapshotHash": "0xabc",
  "actions": [
    {
      "actionType": "SELL",
      "sellToken": "mNVDA",
      "buyToken": "USDC",
      "sellAmountUsd": 300,
      "expectedBuyAmount": 300,
      "minBuyAmount": 297
    },
    {
      "actionType": "BUY",
      "sellToken": "USDC",
      "buyToken": "mSPY",
      "sellAmountUsd": 200,
      "expectedBuyAmount": 0.36,
      "minBuyAmount": 0.3564
    }
  ],
  "expectedImpact": {
    "riskScoreBefore": 82,
    "riskScoreAfter": 61,
    "aiExposureBefore": "76%",
    "aiExposureAfter": "58%",
    "cashBufferBefore": "8%",
    "cashBufferAfter": "15%"
  }
}
```

### 8.6 Risk Agent

Input:

- Strategy JSON.
- Policy.
- Analyst output.

Output:

```json
{
  "status": "APPROVED",
  "riskScoreBefore": 82,
  "riskScoreAfter": 61,
  "notes": [
    "mNVDA concentration reduced",
    "AI exposure reduced",
    "USDC buffer increased"
  ],
  "warnings": []
}
```

### 8.7 Execution Agent

Responsibilities:

- Prepare structured actions for contract submission.
- Trigger simulation.
- Submit approved actions to StrategyExecutor.
- Read execution/refusal results.
- Format receipts for UI display.

The Execution Agent never bypasses wallet signatures or smart contract checks.

## 9. Smart Contract Requirements

### 9.1 MockERC20

Purpose:

- Deploy mock tokenized assets: mNVDA, mAAPL, mSPY, USDC.

Functions:

- `mint`
- `transfer`
- `approve`
- `balanceOf`

### 9.2 MockPriceOracle

Purpose:

- Provide mock prices and market snapshots.

Functions:

- `setPrice`
- `getPrice`
- `createSnapshot`
- `getSnapshot`

### 9.3 MockAMM

Purpose:

- Simulate asset swaps and slippage.

Functions:

- `quote`
- `swap`
- `setSlippage`

Must enforce `minBuyAmount`.

### 9.4 PolicyVault

Purpose:

- Store user policies.
- Enforce allowed and blocked assets.
- Track spend limits and expiry.

Policy:

```solidity
struct Policy {
    address user;
    address agent;
    uint256 maxSpendUsd;
    uint256 maxSingleTradeUsd;
    uint256 maxSlippageBps;
    uint256 expiresAt;
    bool requireSimulation;
    uint256 nonce;
}
```

Asset constraints:

```solidity
mapping(bytes32 policyId => mapping(address token => bool)) public allowedAsset;
mapping(bytes32 policyId => mapping(address token => bool)) public blockedAsset;
```

### 9.5 StrategyExecutor

Purpose:

- Validate and execute or refuse strategies.

Action:

```solidity
struct Action {
    address sellToken;
    address buyToken;
    uint256 sellAmount;
    uint256 expectedBuyAmount;
    uint256 minBuyAmount;
}
```

Checks:

- Policy exists.
- Policy not expired.
- Agent matches policy.
- Sell token is allowed.
- Buy token is allowed.
- Sell token is not blocked.
- Buy token is not blocked.
- Total spend within max spend.
- Single action within max single trade size.
- `minBuyAmount` satisfies max slippage.
- Actual received amount is at least `minBuyAmount`.

Whitelist/blacklist checks:

```solidity
require(allowedAsset[policyId][action.sellToken], "SELL_TOKEN_NOT_ALLOWED");
require(allowedAsset[policyId][action.buyToken], "BUY_TOKEN_NOT_ALLOWED");
require(!blockedAsset[policyId][action.sellToken], "SELL_TOKEN_BLOCKED");
require(!blockedAsset[policyId][action.buyToken], "BUY_TOKEN_BLOCKED");
```

Slippage check:

```solidity
uint256 minAllowed = action.expectedBuyAmount
    * (10000 - policy.maxSlippageBps)
    / 10000;

require(action.minBuyAmount >= minAllowed, "SLIPPAGE_TOO_HIGH");
```

### 9.6 ReceiptRegistry

Purpose:

- Record executions and refusals.

Receipt:

```solidity
enum ReceiptType {
    Analysis,
    Simulation,
    Execution,
    Refusal
}

struct StrategyReceipt {
    uint256 id;
    address user;
    address agent;
    address authorizedBy;
    bytes32 policyId;
    bytes32 policyHash;
    bytes32 authorizationHash;
    bytes32 strategyHash;
    bytes32 marketSnapshotHash;
    ReceiptType receiptType;
    string summary;
    string reason;
    uint256 timestamp;
    bytes32 executionTxHash;
}
```

## 10. Frontend Pages

### 10.1 Dashboard

Shows:

- Wallet connection.
- Portfolio allocation.
- Risk score.
- Recent receipts.

### 10.2 Goal Input

Natural language input for Chinese or English portfolio goals.

### 10.3 Agent Pipeline

Shows four-step agent flow:

1. Analyst Agent.
2. Strategy Agent.
3. Risk Agent.
4. Execution Agent.

### 10.4 Strategy Preview

Shows:

- Strategy summary.
- Structured action list.
- Risk before/after.
- Strategy JSON.

### 10.5 Policy Setup

Shows:

- Max spend.
- Max single trade.
- Allowed assets.
- Blocked assets.
- Slippage.
- Expiry.

### 10.6 Portfolio Comparison

The most important demo screen.

Must show before/after clearly:

| Asset | Before | After |
| --- | --- | --- |
| mNVDA | 52% | 35% |
| mAAPL | 18% | 18% |
| mSPY | 22% | 32% |
| USDC | 8% | 15% |

### 10.7 Execution Result

Shows:

- Executed or refused.
- Reason.
- Risk score change.
- Receipt link.

### 10.8 Receipt History

Shows:

- Time.
- Goal.
- Status.
- Risk change.
- Reason.
- Transaction hash.

## 11. Backend API

Recommended endpoints:

```text
POST /api/analyze
POST /api/generate-strategy
POST /api/review-risk
POST /api/execution-summary
```

## 12. MVP Success Criteria

The MVP is complete when:

1. User can connect wallet.
2. User can see mock portfolio.
3. User can enter natural language portfolio goal.
4. Analyst Agent produces risk analysis.
5. Strategy Agent produces structured strategy JSON.
6. Risk Agent approves or rejects the strategy.
7. User can create a policy.
8. Contract enforces whitelist and blacklist.
9. Contract enforces max spend and slippage.
10. Valid strategy executes.
11. Invalid mTSLA strategy is refused.
12. UI shows before/after portfolio comparison.
13. UI shows receipt history.

## 13. Out of Scope for MVP

- Real securities trading.
- Real tokenized stock issuance.
- Production oracle integration.
- Real brokerage integration.
- Profit guarantees.
- High-frequency trading.
- Strategy marketplace.
- ERC-8004 reputation.
- Passkey authorization.

## 14. Compliance Language

AssetPilot should not claim:

- Guaranteed returns.
- Investment advice.
- Automated profit generation.
- Real securities trading.

Preferred language:

- Portfolio risk analysis.
- User-defined policy.
- Non-custodial automation.
- Tokenized asset execution sandbox.
- Strategy simulation.
- Verifiable execution receipt.

## 15. Final Narrative

**English**

AssetPilot is a policy-controlled AI portfolio execution system for tokenized assets. Users describe goals in natural language, four specialized AI agents analyze risk, generate strategies, review safety, and submit execution payloads. Smart contracts enforce asset whitelists, blacklists, spend limits, and slippage before any trade can happen. Every execution or refusal produces a verifiable strategy receipt.

**Chinese**

AssetPilot 是一个面向代币化资产的权限化 AI 组合执行系统。用户用自然语言描述组合目标，四个专门的 AI agent 分析风险、生成策略、审查安全并提交执行。智能合约在交易发生前强制检查资产白名单、黑名单、金额和滑点。每一次执行或拒绝都会生成可验证策略回执。
