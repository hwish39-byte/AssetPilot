# AssetPilot 实施计划

本文档描述 AssetPilot 的具体实施步骤。

AssetPilot 是一个面向代币化资产的、由策略规则控制的 AI 投资组合执行系统。MVP 需要展示一个完整闭环：

```text
连接钱包
  -> 查看模拟代币化投资组合
  -> 输入自然语言目标
  -> 四个 AI Agent 生成并审核策略
  -> 用户创建/签署执行策略
  -> 智能合约强制执行白名单、黑名单、支出和滑点限制
  -> 策略被执行或被拒绝
  -> UI 展示执行前后投资组合对比和回执
```

## 1. MVP 目标

MVP 需要证明五件事：

1. 用户可以用自然语言表达投资组合目标。
2. AI Agent 可以把这些目标转换成结构化策略 JSON。
3. 用户可以创建明确的执行策略。
4. 智能合约可以在链上强制执行这些策略。
5. 应用可以清晰展示执行/拒绝结果以及投资组合变化。

MVP 使用以下模拟代币化资产：

- `mNVDA`
- `mAAPL`
- `mSPY`
- `USDC`

## 2. 项目结构

推荐的仓库结构：

```text
assetpilot/
  contracts/
  frontend/
  backend/
  docs/
```

推荐技术栈：

- 合约：Solidity + Foundry 或 Hardhat
- 前端：Next.js + React + Tailwind CSS + wagmi + viem + Recharts
- 后端：Node.js/Express 或 FastAPI
- AI：OpenAI API 或其他 LLM 服务商
- 区块链：Monad 测试网

## 3. 合约实现

合约是项目核心，因为 AssetPilot 的主要卖点是由策略规则控制的执行。

### 3.1 MockERC20

用途：

部署模拟代币化资产。

资产：

- `mNVDA`
- `mAAPL`
- `mSPY`
- `USDC`

必需函数：

- `mint`
- `transfer`
- `approve`
- `balanceOf`

使用该合约为演示用户分配初始投资组合。

### 3.2 MockPriceOracle

用途：

提供模拟价格并创建市场快照。

示例价格：

```text
mNVDA = 125 USDC
mAAPL = 210 USDC
mSPY = 550 USDC
USDC = 1 USDC
```

必需函数：

- `setPrice`
- `getPrice`
- `createSnapshot`
- `getSnapshot`

每个 AI 生成的策略都应引用一个 `marketSnapshotHash`。

### 3.3 MockAMM

用途：

模拟兑换和滑点。

必需函数：

- `quote(sellToken, buyToken, sellAmount)`
- `swap(sellToken, buyToken, sellAmount, minBuyAmount)`
- `setSlippage`

必需失败场景：

- 如果输出低于 `minBuyAmount`，则回滚。
- 支持可配置的滑点设置，用于演示失败路径。

### 3.4 PolicyVault

用途：

存储用户定义的执行策略。

策略结构：

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

资产控制：

```solidity
mapping(bytes32 policyId => mapping(address token => bool)) public allowedAsset;
mapping(bytes32 policyId => mapping(address token => bool)) public blockedAsset;
```

必需函数：

- `createPolicy`
- `revokePolicy`
- `getPolicy`
- `isAllowedAsset`
- `isBlockedAsset`
- `verifyAuthorization`

MVP 说明：

第一个版本中，用户可以通过链上交易创建策略。如果时间允许，再加入基于 EIP-712 签名的授权。

### 3.5 ReceiptRegistry

用途：

记录执行和拒绝回执。

回执类型：

```solidity
enum ReceiptType {
    Analysis,
    Simulation,
    Execution,
    Refusal
}
```

回执结构：

```solidity
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

必需函数：

- `recordExecution`
- `recordRefusal`
- `getReceiptsByUser`
- `getReceiptsByAgent`
- `getReceipt`

### 3.6 StrategyExecutor

用途：

校验、执行或拒绝策略。

动作结构：

```solidity
struct Action {
    address sellToken;
    address buyToken;
    uint256 sellAmount;
    uint256 expectedBuyAmount;
    uint256 minBuyAmount;
}
```

执行检查：

1. 策略存在。
2. 策略未过期。
3. Agent 与策略匹配。
4. 卖出代币在白名单中。
5. 买入代币在白名单中。
6. 卖出代币不在黑名单中。
7. 买入代币不在黑名单中。
8. 总支出不超过 `maxSpendUsd`。
9. 单笔操作不超过 `maxSingleTradeUsd`。
10. `minBuyAmount` 满足 `maxSlippageBps`。
11. 实际收到数量至少为 `minBuyAmount`。

白名单/黑名单检查：

```solidity
require(allowedAsset[policyId][action.sellToken], "SELL_TOKEN_NOT_ALLOWED");
require(allowedAsset[policyId][action.buyToken], "BUY_TOKEN_NOT_ALLOWED");
require(!blockedAsset[policyId][action.sellToken], "SELL_TOKEN_BLOCKED");
require(!blockedAsset[policyId][action.buyToken], "BUY_TOKEN_BLOCKED");
```

滑点检查：

```solidity
uint256 minAllowed = action.expectedBuyAmount
    * (10000 - policy.maxSlippageBps)
    / 10000;

require(action.minBuyAmount >= minAllowed, "SLIPPAGE_TOO_HIGH");
```

如果策略通过所有检查，则通过 `MockAMM` 执行。

如果策略失败，则记录拒绝回执。

## 4. 合约测试

最低测试要求：

1. 成功再平衡：
   - Agent 卖出 `mNVDA` 并买入 `mSPY`。
   - 策略通过所有策略检查。
   - 记录执行回执。

2. 买入非白名单代币：
   - Agent 尝试买入 `mTSLA`。
   - 合约以 `BUY_TOKEN_NOT_ALLOWED` 拒绝。
   - 记录拒绝回执。

3. 黑名单资产：
   - `mTSLA` 被明确加入黑名单。
   - 合约以 `BUY_TOKEN_BLOCKED` 拒绝。

4. 滑点过高：
   - `minBuyAmount` 违反策略滑点限制。
   - 合约以 `SLIPPAGE_TOO_HIGH` 拒绝。

5. 超出支出上限：
   - 策略超出 `maxSpendUsd`。
   - 合约以 `MAX_SPEND_EXCEEDED` 拒绝。

6. 策略已过期：
   - 当前时间戳晚于 `expiresAt`。
   - 合约以 `POLICY_EXPIRED` 拒绝。

## 5. 后端 AI 编排器

后端负责协调四个 AI Agent。

推荐接口：

```text
POST /api/analyze
POST /api/generate-strategy
POST /api/review-risk
POST /api/execution-summary
```

### 5.1 Analyst Agent

输入：

- 投资组合
- 市场快照
- 用户目标

输出：

```json
{
  "riskScore": 82,
  "aiExposure": "76%",
  "concentrationRisk": "High",
  "summary": "mNVDA is 52% of the portfolio and AI/tech exposure is high."
}
```

### 5.2 Strategy Agent

输入：

- 用户目标
- Analyst 结果
- 市场快照
- 草案策略约束

输出：

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

### 5.3 Risk Agent

输入：

- 策略
- 执行策略
- Analyst 结果

输出：

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

拒绝示例：

```json
{
  "status": "REJECTED",
  "reason": "Strategy tries to buy mTSLA, which is not allowed."
}
```

### 5.4 Execution Agent

职责：

- 构建执行载荷。
- 将动作列表提交给前端钱包流程。
- 解析交易结果。
- 总结执行/拒绝状态。

Execution Agent 绝不能持有或绕过用户私钥。

## 6. 前端实现

### 6.1 仪表盘

展示：

- 钱包地址
- 投资组合总价值
- 资产配置图表
- 风险评分
- 最近回执

初始演示配置：

```text
mNVDA 52%
mAAPL 18%
mSPY 22%
USDC 8%
```

### 6.2 目标输入

文本输入支持中文和英文。

示例：

```text
帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。
```

按钮：

```text
生成策略
```

### 6.3 Agent 流程

展示每一步：

```text
Analyst Agent：已分析投资组合风险
Strategy Agent：已生成再平衡计划
Risk Agent：策略已通过审核
Execution Agent：已准备链上执行
```

### 6.4 策略预览

展示：

- 用户目标
- 策略摘要
- 动作列表
- 执行前/后的风险
- 执行前/后的 AI 敞口
- 执行前/后的 USDC 缓冲
- 原始策略 JSON

### 6.5 策略设置

默认演示策略：

```text
最大支出：500 USDC
单笔最大交易：300 USDC
允许资产：mNVDA、mAAPL、mSPY、USDC
禁止资产：mTSLA
最大滑点：1%
有效期：30 分钟
```

按钮：

```text
签署并创建策略
```

### 6.6 投资组合执行前后对比

这是最重要的演示页面。

执行前：

```text
mNVDA 52%
mAAPL 18%
mSPY 22%
USDC 8%
风险评分 82
```

执行后：

```text
mNVDA 35%
mAAPL 18%
mSPY 32%
USDC 15%
风险评分 61
```

展示关键变化：

```text
AI 敞口：76% -> 58%
风险评分：82 -> 61
现金缓冲：8% -> 15%
```

使用两个饼图或两个堆叠条形图。

### 6.7 执行策略

按钮：

```text
执行策略
```

合约调用：

```text
StrategyExecutor.executeStrategy(policyId, actions, strategyHash, snapshotHash)
```

成功 UI：

```text
已执行
风险从 82 降低到 61
已记录回执
```

失败 UI：

```text
已拒绝
原因：BUY_TOKEN_NOT_ALLOWED
已记录回执
```

### 6.8 回执历史

展示表格：

| 时间 | 目标 | 状态 | 风险 | 原因 | 交易 |
| --- | --- | --- | --- | --- | --- |
| 10:30 | 降低 AI 敞口 | 已执行 | 82 -> 61 | - | tx |
| 10:45 | 买入 mTSLA | 已拒绝 | - | BUY_TOKEN_NOT_ALLOWED | tx |

回执详情应展示：

- 用户
- Agent
- 授权签名者
- 策略哈希
- 策略内容哈希
- 市场快照哈希
- 原因
- 交易哈希

## 7. 演示脚本

### 7.1 成功演示

用户输入：

```text
帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。
```

预期流程：

1. Analyst Agent 报告 `mNVDA` 集中度过高。
2. Strategy Agent 提议卖出部分 `mNVDA` 并买入 `mSPY`。
3. Risk Agent 审核通过。
4. 用户创建策略。
5. UI 展示执行前后对比。
6. 合约检查白名单、支出和滑点。
7. 策略执行。
8. 记录执行回执。

### 7.2 失败演示

策略：

```text
允许：mNVDA、mAAPL、mSPY、USDC
禁止：mTSLA
```

Agent 尝试：

```text
买入 mTSLA
```

预期结果：

```text
已拒绝：BUY_TOKEN_NOT_ALLOWED
已记录拒绝回执
```

## 8. 开发排期

### 第 1 天：合约基础

- 实现 `MockERC20`
- 实现 `MockPriceOracle`
- 实现 `MockAMM`
- 铸造初始资产

### 第 2 天：策略和回执

- 实现 `PolicyVault`
- 实现 `ReceiptRegistry`
- 添加白名单/黑名单存储
- 添加基础策略创建功能

### 第 3 天：执行器和测试

- 实现 `StrategyExecutor`
- 添加成功执行测试
- 添加非白名单资产测试
- 添加黑名单资产测试
- 添加滑点失败测试
- 添加支出上限失败测试

### 第 4 天：前端仪表盘

- 钱包连接
- 投资组合展示
- 资产配置图表
- 模拟风险评分

### 第 5 天：AI 编排器

- Analyst Agent
- Strategy Agent
- Risk Agent
- 结构化 JSON 输出

### 第 6 天：完整流程

- 目标输入
- 策略预览
- 策略设置
- 执行策略
- 回执历史

### 第 7 天：演示打磨

- 执行前后图表
- 失败路径
- README
- 路演脚本
- 演示视频

## 9. 最终交付物

必需交付物：

1. 智能合约。
2. 合约测试。
3. 前端演示。
4. 后端 AI Agent API。
5. README。
6. PRD。
7. 演示视频。
8. Pitch deck 或简短路演脚本。

## 10. 优先级清单

如果时间有限，优先保留以下功能：

1. 合约强制执行白名单/黑名单。
2. 投资组合执行前后对比。
3. 自然语言到策略 JSON。
4. 四 Agent 流程可视化。
5. 执行/拒绝回执。

其他内容都可以简化。

## 11. README 推荐定位

使用以下简洁项目描述：

```text
AssetPilot 是一个面向代币化资产的、由策略规则控制的 AI 投资组合执行系统。
用户用自然语言描述投资组合目标。四个专门的 Agent 负责分析风险、生成策略、
审核安全性，并提交执行载荷。任何交易发生之前，智能合约都会强制执行
资产白名单、黑名单、支出上限和滑点限制。
每一次执行或拒绝都会生成一份可验证的策略回执。
```
