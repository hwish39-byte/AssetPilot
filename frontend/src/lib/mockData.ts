import type {
  AgentStep,
  AnalystResult,
  OrchestratorResponse,
  PolicyDraft,
  PortfolioAsset,
  RiskReview,
  Strategy,
  StrategyReceipt
} from "@/types/assetpilot";

export const ASSET_COLORS: Record<string, string> = {
  mNVDA: "#14b8a6",
  mAAPL: "#5b8def",
  mSPY: "#d99b2b",
  USDC: "#64748b"
};

export const portfolioBefore: PortfolioAsset[] = [
  { symbol: "mNVDA", valueUsd: 5200, weight: 52, color: ASSET_COLORS.mNVDA },
  { symbol: "mAAPL", valueUsd: 1800, weight: 18, color: ASSET_COLORS.mAAPL },
  { symbol: "mSPY", valueUsd: 2200, weight: 22, color: ASSET_COLORS.mSPY },
  { symbol: "USDC", valueUsd: 800, weight: 8, color: ASSET_COLORS.USDC }
];

export const portfolioAfter: PortfolioAsset[] = [
  { symbol: "mNVDA", valueUsd: 3500, weight: 35, color: ASSET_COLORS.mNVDA },
  { symbol: "mAAPL", valueUsd: 1800, weight: 18, color: ASSET_COLORS.mAAPL },
  { symbol: "mSPY", valueUsd: 3200, weight: 32, color: ASSET_COLORS.mSPY },
  { symbol: "USDC", valueUsd: 1500, weight: 15, color: ASSET_COLORS.USDC }
];

export const marketSnapshot = {
  hash: "0x8bbd4f4ab44d426b1fd6bf9a884b1ec40a784261472a7d7aee114ee335e9ff21",
  prices: {
    mNVDA: 125,
    mAAPL: 210,
    mSPY: 550,
    USDC: 1,
    mTSLA: 300
  }
};

export const policyDraft: PolicyDraft = {
  maxSpendUsd: 500,
  maxSingleTradeUsd: 300,
  maxSlippageBps: 100,
  allowedAssets: ["mNVDA", "mAAPL", "mSPY", "USDC"],
  blockedAssets: ["mTSLA"]
};

export const defaultGoal = "帮我降低 AI 股票集中风险，最多交易 500 USDC，不能买 mTSLA。";

export const initialAgentSteps: AgentStep[] = [
  { id: "analyst", name: "Analyst Agent", description: "已分析投资组合风险", status: "pending", output: "等待用户目标" },
  { id: "strategy", name: "Strategy Agent", description: "已生成再平衡计划", status: "pending", output: "等待 Analyst 输出" },
  { id: "risk", name: "Risk Agent", description: "策略已通过审核", status: "pending", output: "等待策略生成" },
  { id: "execution", name: "Execution Agent", description: "已准备链上执行", status: "pending", output: "等待 Risk 审核" }
];

export const fallbackAnalyst: AnalystResult = {
  riskScore: 82,
  aiExposure: "76%",
  concentrationRisk: "High",
  summary: "mNVDA 占投资组合 52%，AI/科技敞口约 76%，集中风险为 High。"
};

export const fallbackStrategy: Strategy = {
  goal: "降低 AI 股票集中风险",
  marketSnapshotHash: marketSnapshot.hash as `0x${string}`,
  actions: [
    { actionType: "SELL", sellToken: "mNVDA", buyToken: "USDC", sellAmountUsd: 300, expectedBuyAmount: 300, minBuyAmount: 297 },
    { actionType: "BUY", sellToken: "USDC", buyToken: "mSPY", sellAmountUsd: 200, expectedBuyAmount: 0.36, minBuyAmount: 0.3564 }
  ],
  expectedImpact: {
    riskScoreBefore: 82,
    riskScoreAfter: 61,
    aiExposureBefore: "76%",
    aiExposureAfter: "58%",
    cashBufferBefore: "8%",
    cashBufferAfter: "15%"
  }
};

export const fallbackRiskReview: RiskReview = {
  status: "APPROVED",
  riskScoreBefore: 82,
  riskScoreAfter: 61,
  notes: ["mNVDA 集中度降低", "AI 敞口降低", "USDC 缓冲提高"],
  warnings: []
};

export const fallbackWorkflowResponse: OrchestratorResponse = {
  current_state: "payload_prepared",
  next_agent: "user",
  next_user_action: "review_execution_plan",
  reason: "Dry-run execution plan prepared.",
  analyse_agent: {
    portfolio_snapshot: {
      total_value_usd: 10000,
      asset_allocation: { mNVDA: 0.52, mAAPL: 0.18, mSPY: 0.22, USDC: 0.08 },
      chain_exposure: { "monad-testnet": 1 },
      protocol_exposure: { wallet: 1 },
      stablecoin_ratio: 0.08,
      leverage_ratio: null,
      largest_position: { symbol: "mNVDA", value_usd: 5200, weight: 0.52 }
    },
    risk_context: {
      risk_level: "high",
      risk_factors: [
        {
          factor_id: "concentration_risk",
          category: "portfolio_concentration",
          severity: "high",
          description: "Largest position concentration is elevated.",
          evidence: ["mNVDA weight is 52%"],
          affected_assets: ["mNVDA"]
        },
        {
          factor_id: "ai_exposure_risk",
          category: "sector_exposure",
          severity: "high",
          description: "AI exposure is elevated.",
          evidence: ["AI exposure is 76%"]
        },
        {
          factor_id: "low_stablecoin_buffer",
          category: "liquidity_buffer",
          severity: "medium",
          description: "Stablecoin buffer is below target.",
          evidence: ["Stablecoin ratio is 8%"],
          affected_assets: ["USDC"]
        }
      ],
      constraints_for_strategy: [
        {
          constraint: "max_single_asset_ratio <= 0.40",
          reason: "Largest position concentration is high",
          hard: false
        },
        {
          constraint: "stablecoin_ratio_after >= 0.15",
          reason: "Current stablecoin buffer is low",
          hard: false
        },
        {
          constraint: "do_not_buy mTSLA",
          reason: "User explicitly blocked mTSLA",
          hard: true
        }
      ]
    },
    summary: fallbackAnalyst.summary
  },
  strategy_agent: {
    status: "generated",
    validation_errors: [],
    strategy: {
      strategy_id: "strategy_rebalance_ai_concentration_mock",
      objective: {
        type: "rebalance",
        description: "Reduce AI concentration while keeping broad market exposure"
      },
      constraints: {
        max_slippage_bps: 100,
        max_gas_usd: null,
        min_stablecoin_ratio: 0.15,
        max_single_asset_ratio: 0.4,
        allowed_chains: ["monad-testnet"],
        allowed_protocols: ["mock_amm"],
        denied_assets: ["mTSLA"]
      },
      actions: [
        {
          action_id: "act_1_reduce_mnvda",
          type: "swap",
          chain: "monad-testnet",
          protocol: "mock_amm",
          from_asset: "mNVDA",
          to_asset: "USDC",
          asset: null,
          amount: { mode: "usd_value", value: 300, unit: "USD" },
          constraints: { max_slippage_bps: 100 },
          preconditions: ["mNVDA is allowed by policy", "USDC is allowed by policy"],
          expected_effects: ["Reduce mNVDA concentration", "Increase stablecoin buffer"],
          rationale: "mNVDA is the largest AI-linked position"
        },
        {
          action_id: "act_2_rebalance_to_mspy",
          type: "swap",
          chain: "monad-testnet",
          protocol: "mock_amm",
          from_asset: "USDC",
          to_asset: "mSPY",
          asset: null,
          amount: { mode: "usd_value", value: 200, unit: "USD" },
          constraints: { max_slippage_bps: 100 },
          preconditions: ["USDC is allowed by policy", "mSPY is allowed by policy"],
          expected_effects: ["Keep broad market exposure", "Reduce single asset concentration"],
          rationale: "mSPY keeps broad market exposure after reducing AI-linked concentration"
        }
      ],
      success_criteria: {
        risk_score_after: "<= current risk score",
        stablecoin_ratio_after: ">= current stablecoin ratio"
      },
      assumptions: [
        "MVP uses mock tokenized assets",
        "Execution will be reviewed by Risk Agent before any payload is prepared"
      ]
    }
  },
  risk_agent: {
    decision: "approve",
    risk_score: 70,
    blocking_issues: [],
    warnings: [],
    approved_action_ids: ["act_1_reduce_mnvda", "act_2_rebalance_to_mspy"],
    revised_strategy_patch: [],
    human_readable_summary: "策略通过规则风控审核，可进入 Execution Agent 准备 dry-run。"
  },
  execution_agent: {
    status: "dry_run_prepared",
    reason: "Dry-run execution plan prepared.",
    execution_plan: {
      execution_plan_id: "execution_plan_mock",
      status: "simulation_required",
      steps: [
        {
          step_id: "step_1_act_1_reduce_mnvda",
          action_id: "act_1_reduce_mnvda",
          type: "swap",
          chain: "monad-testnet",
          protocol: "mock_amm",
          contract: null,
          asset_in: "mNVDA",
          asset_out: "USDC",
          amount_in: "300 USD",
          min_amount_out: "297",
          calldata: null,
          value: "0",
          human_readable: "Swap 300 USD worth of mNVDA to USDC on monad-testnet via mock_amm. Prepared mock_amm contract payload descriptor; calldata is not generated in dry-run.",
          requires_user_signature: true,
          contract_payload: {
            action_id: "act_1_reduce_mnvda",
            adapter: "mock_amm",
            contract_method: "executeStrategy",
            sell_token_symbol: "mNVDA",
            buy_token_symbol: "USDC",
            sell_amount_usd: 300,
            expected_buy_amount: 300,
            min_buy_amount: 297,
            max_slippage_bps: 100,
            human_readable: "Contract payload: executeStrategy swap 300 USD of mNVDA to at least 297 USDC via mock_amm."
          }
        },
        {
          step_id: "step_2_act_2_rebalance_to_mspy",
          action_id: "act_2_rebalance_to_mspy",
          type: "swap",
          chain: "monad-testnet",
          protocol: "mock_amm",
          contract: null,
          asset_in: "USDC",
          asset_out: "mSPY",
          amount_in: "200 USD",
          min_amount_out: "0.3564",
          calldata: null,
          value: "0",
          human_readable: "Swap 200 USD worth of USDC to mSPY on monad-testnet via mock_amm. Prepared mock_amm contract payload descriptor; calldata is not generated in dry-run.",
          requires_user_signature: true,
          contract_payload: {
            action_id: "act_2_rebalance_to_mspy",
            adapter: "mock_amm",
            contract_method: "executeStrategy",
            sell_token_symbol: "USDC",
            buy_token_symbol: "mSPY",
            sell_amount_usd: 200,
            expected_buy_amount: 0.363636,
            min_buy_amount: 0.36,
            max_slippage_bps: 100,
            human_readable: "Contract payload: executeStrategy swap 200 USD of USDC to at least 0.36 mSPY via mock_amm."
          }
        }
      ],
      simulation: {
        required: true,
        status: "not_run",
        summary: "Simulation is required before user confirmation."
      },
      user_confirmation_summary: {
        chains: ["monad-testnet"],
        protocols: ["mock_amm"],
        assets_spent: { mNVDA: "300 USD", USDC: "200 USD" },
        assets_received_expected: {
          USDC: ">= 297",
          mSPY: ">= 0.36"
        },
        max_slippage_bps: 100,
        estimated_gas_usd: null,
        approval_requests: [
          {
            asset: "mNVDA",
            spender: "StrategyExecutor",
            amount: "exact",
            reason: "Required for executeStrategy swap action"
          },
          {
            asset: "USDC",
            spender: "StrategyExecutor",
            amount: "exact",
            reason: "Required for executeStrategy swap action"
          }
        ],
        worst_case_summary: "Worst case before revert is approximately 1% slippage, subject to adapter quote."
      },
      blocked_reason: null
    }
  }
};

export const mockReceipts: StrategyReceipt[] = [
  {
    id: "rcpt-001",
    time: "10:30",
    goal: "降低 AI 敞口",
    status: "EXECUTED",
    riskDelta: "82 -> 61",
    reason: "-",
    txHash: "0x7be...91c",
    user: "0xA11CE00000000000000000000000000000000000",
    agent: "0xA6e7100000000000000000000000000000000000",
    authorizedBy: "0xA11CE00000000000000000000000000000000000",
    policyId: "0xpolicy-demo-success",
    policyHash: "0xpolicyhash-demo-success",
    authorizationHash: "0xauth-demo-success",
    strategyHash: "0xstrategy-demo-success",
    strategyContentHash: "0xcontent-demo-success",
    marketSnapshotHash: marketSnapshot.hash
  },
  {
    id: "rcpt-002",
    time: "10:45",
    goal: "买入 mTSLA",
    status: "REFUSED",
    riskDelta: "-",
    reason: "BUY_TOKEN_NOT_ALLOWED",
    txHash: "0x2fd...b18",
    user: "0xA11CE00000000000000000000000000000000000",
    agent: "0xA6e7100000000000000000000000000000000000",
    authorizedBy: "0xA11CE00000000000000000000000000000000000",
    policyId: "0xpolicy-demo-refused",
    policyHash: "0xpolicyhash-demo-refused",
    authorizationHash: "0xauth-demo-refused",
    strategyHash: "0xstrategy-demo-refused",
    strategyContentHash: "0xcontent-demo-refused",
    marketSnapshotHash: marketSnapshot.hash
  }
];
