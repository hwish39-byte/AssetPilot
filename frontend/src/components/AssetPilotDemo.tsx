"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, Clock, CopyCheck, Loader2, Play, ShieldCheck, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { parseUnits, type Address, type Hex } from "viem";
import { useAccount, useConnect, useDisconnect, useWriteContract } from "wagmi";
import { runWorkflow } from "@/lib/api";
import { addresses, hasExecutorContract, hasPolicyContract, policyVaultAbi, strategyExecutorAbi, zeroAddress } from "@/lib/contracts";
import { hashObject, nowTime, shortAddress, sleep, usd } from "@/lib/format";
import {
  defaultGoal,
  fallbackAnalyst,
  fallbackStrategy,
  initialAgentSteps,
  marketSnapshot,
  mockReceipts,
  policyDraft,
  portfolioAfter,
  portfolioBefore
} from "@/lib/mockData";
import type {
  AgentStep,
  AgentStatus,
  AmountSpec,
  AnalystResult,
  ContractActionPayloadV2,
  OrchestratorResponse,
  PortfolioAsset,
  RiskDecision,
  RiskReview,
  Strategy,
  StrategyReceipt
} from "@/types/assetpilot";

const totalValue = portfolioBefore.reduce((sum, asset) => sum + asset.valueUsd, 0);

export function AssetPilotDemo() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const [goal, setGoal] = useState(defaultGoal);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>(initialAgentSteps);
  const [workflowResult, setWorkflowResult] = useState<OrchestratorResponse | null>(null);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [policyId, setPolicyId] = useState<Hex | "">("");
  const [executionStatus, setExecutionStatus] = useState<"idle" | "pending" | "executed" | "refused" | "failed">("idle");
  const [policyStatus, setPolicyStatus] = useState<"idle" | "pending" | "created" | "failed">("idle");
  const [receipts, setReceipts] = useState<StrategyReceipt[]>(mockReceipts);
  const [selectedReceipt, setSelectedReceipt] = useState<StrategyReceipt | null>(mockReceipts[0]);
  const [error, setError] = useState("");
  const [apiFallbackNotice, setApiFallbackNotice] = useState("");

  const approved = workflowResult?.risk_agent?.decision === "approve";
  const rejected = workflowResult?.risk_agent?.decision === "reject" || workflowResult?.risk_agent?.decision === "revise";
  const executionPlan = workflowResult?.execution_agent?.execution_plan ?? null;
  const v2Approved = workflowResult?.risk_agent?.decision === "approve";
  const dryRunReady = workflowResult?.execution_agent?.status === "dry_run_prepared";
  const hasUnsafeExecutionBlock =
    !v2Approved ||
    !dryRunReady ||
    !executionPlan ||
    executionPlan.status === "blocked" ||
    executionPlan.steps.some((step) => step.calldata !== null);
  const canSafetyConfirm = Boolean(v2Approved && dryRunReady && executionPlan && !hasUnsafeExecutionBlock);
  const canCreatePolicy = isConnected && approved && safetyConfirmed && canSafetyConfirm && policyStatus !== "pending";
  const canExecute = isConnected && approved && safetyConfirmed && canSafetyConfirm && policyId && executionStatus !== "pending";
  const afterPortfolio = executionStatus === "executed" ? portfolioAfter : portfolioAfter;

  const updateStep = (id: AgentStep["id"], status: AgentStatus, output: string) => {
    setAgentSteps((steps) => steps.map((step) => (step.id === id ? { ...step, status, output } : step)));
  };

  const resetFlow = () => {
    setAgentSteps(initialAgentSteps);
    setWorkflowResult(null);
    setSafetyConfirmed(false);
    setPolicyId("");
    setExecutionStatus("idle");
    setPolicyStatus("idle");
    setError("");
    setApiFallbackNotice("");
  };

  const handleGenerate = async () => {
    resetFlow();
    setError("");
    const notices: string[] = [];

    try {
      updateStep("analyst", "running", "Orchestrator 正在读取 portfolio 与市场快照");
      await sleep(450);
      const workflow = await runWorkflow(goal, policyDraft, address);
      if (workflow.usedFallback) notices.push("Workflow 使用本地 mock fallback。");
      setSafetyConfirmed(false);
      setWorkflowResult(workflow.data);

      if (workflow.data.analyse_agent) {
        updateStep(
          "analyst",
          "completed",
          `${workflow.data.analyse_agent.risk_context.risk_level} risk，total ${usd(workflow.data.analyse_agent.portfolio_snapshot.total_value_usd)}。${workflow.data.analyse_agent.summary}`
        );
      } else {
        updateStep("analyst", "failed", "Analyse V2 未返回结果");
      }

      const strategyOutput = workflow.data.strategy_agent;
      if (strategyOutput?.status === "generated" && strategyOutput.strategy) {
        updateStep("strategy", "completed", `${strategyOutput.strategy.actions.length} 个 V2 动作，StrategyJson 已生成`);
      } else if (strategyOutput?.status === "need_clarification") {
        updateStep("strategy", "rejected", strategyOutput.clarification_questions?.join(" ") ?? "需要补充目标");
      } else {
        updateStep("strategy", "failed", strategyOutput?.validation_errors?.join("; ") || "Strategy V2 生成失败");
      }

      const risk = workflow.data.risk_agent;
      if (risk?.decision === "approve") {
        updateStep("risk", "completed", risk.human_readable_summary);
      } else if (risk?.decision === "revise") {
        updateStep("risk", "rejected", `需要修订：${risk.human_readable_summary}`);
      } else if (risk?.decision === "reject") {
        updateStep("risk", "rejected", risk.human_readable_summary);
      } else {
        updateStep("risk", "failed", "Risk V2 未返回结果");
      }

      const execution = workflow.data.execution_agent;
      if (execution?.status === "dry_run_prepared") {
        updateStep("execution", "completed", "Dry-run execution plan 已准备，等待用户创建 Policy");
      } else if (execution?.status === "blocked") {
        updateStep("execution", "rejected", execution.reason);
      } else {
        updateStep("execution", "pending", "等待 Risk approve 后准备 dry-run");
      }

      if (workflow.data.risk_agent?.decision === "reject" || workflow.data.risk_agent?.decision === "revise") {
        const receipt = buildReceipt({
          status: "REFUSED",
          goal,
          reason: workflow.data.risk_agent.blocking_issues[0]?.code ?? workflow.data.risk_agent.decision,
          address,
          policyId: "0xrisk-rejected",
          workflowResult: workflow.data
        });
        setReceipts((current) => [receipt, ...current]);
        setSelectedReceipt(receipt);
      }

      setApiFallbackNotice(notices.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "策略生成失败");
      updateStep("analyst", "failed", "流程失败，请重试");
    }
  };

  const handleCreatePolicy = async () => {
    if (!safetyConfirmed || !canSafetyConfirm) {
      setError("请先完成 V2 安全确认清单。");
      return;
    }
    if (!isConnected || !address) {
      setError("创建 Policy 前必须连接钱包。");
      return;
    }
    if (!approved) {
      setError("请先生成并通过 Risk Agent 审核的策略。");
      return;
    }

    setPolicyStatus("pending");
    setError("");

    try {
      const hasTokenAddresses = Object.values(addresses.tokens).every(Boolean);
      if (hasPolicyContract && hasTokenAddresses && addresses.policyVault) {
        const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
        const hash = await writeContractAsync({
          address: addresses.policyVault,
          abi: policyVaultAbi,
          functionName: "createPolicy",
          args: [
            addresses.agent,
            parseUnits(String(policyDraft.maxSpendUsd), 18),
            parseUnits(String(policyDraft.maxSingleTradeUsd), 18),
            BigInt(policyDraft.maxSlippageBps),
            expiresAt,
            true,
            policyDraft.allowedAssets.map((asset) => addresses.tokens[asset as keyof typeof addresses.tokens] ?? zeroAddress),
            policyDraft.blockedAssets.map((asset) => addresses.tokens[asset as keyof typeof addresses.tokens] ?? zeroAddress)
          ]
        });
        setPolicyId(hashObject({ txHash: hash, address, workflow: workflowResult }) as Hex);
      } else {
        await sleep(850);
        setPolicyId(hashObject({ address, goal, createdAt: Date.now(), policyDraft }) as Hex);
      }
      setPolicyStatus("created");
      updateStep("execution", "completed", "Policy 已创建，Execution Agent 可提交执行");
    } catch (err) {
      setPolicyStatus("failed");
      setError(err instanceof Error ? err.message : "Policy 创建失败");
    }
  };

  const handleExecute = async () => {
    if (!safetyConfirmed || !canSafetyConfirm) {
      setError("请先完成 V2 安全确认清单。");
      return;
    }
    if (!workflowResult || !executionPlan) {
      setError("执行前必须先生成 V2 workflow 和 ExecutionPlan。");
      return;
    }
    if (!approved) {
      setError("Risk Agent 未通过审核，不能执行。");
      return;
    }
    if (!policyId) {
      setError("执行前必须先创建 Policy。");
      return;
    }
    if (executionPlan.steps.some((step) => step.calldata !== null)) {
      setError("ExecutionPlan 含 calldata，当前版本未启用 decode/simulation gate。");
      return;
    }

    const payloads = executionPlan.steps
      .map((step) => step.contract_payload)
      .filter((payload): payload is ContractActionPayloadV2 => !!payload);
    if (payloads.length === 0) {
      setError("ExecutionPlan 缺少 V2 contract_payload descriptor。");
      return;
    }

    setExecutionStatus("pending");
    setError("");

    const strategyJson = workflowResult.strategy_agent?.strategy ?? null;
    const strategyHash = hashObject(strategyJson ?? { goal, executionPlan });
    const authorizationHash = hashObject({ policyId, address, strategyHash });

    try {
      let txHash = "0xmock-executed";
      const hasTokenAddresses = Object.values(addresses.tokens).every(Boolean);
      if (hasExecutorContract && hasTokenAddresses && addresses.strategyExecutor) {
        const contractActions = payloads.map((payload) => ({
          sellToken: addresses.tokens[payload.sell_token_symbol as keyof typeof addresses.tokens] ?? zeroAddress,
          buyToken: addresses.tokens[payload.buy_token_symbol as keyof typeof addresses.tokens] ?? zeroAddress,
          sellAmount: parseUnits(String(payload.sell_amount_usd), 18),
          expectedBuyAmount: parseUnits(String(payload.expected_buy_amount), 18),
          minBuyAmount: parseUnits(String(payload.min_buy_amount), 18)
        }));
        txHash = await writeContractAsync({
          address: addresses.strategyExecutor,
          abi: strategyExecutorAbi,
          functionName: "executeStrategy",
          args: [
            policyId,
            contractActions,
            {
              authorizationHash,
              strategyHash,
              marketSnapshotHash: marketSnapshot.hash as Hex,
              summary: strategyJson?.objective.description ?? goal
            }
          ]
        });
      } else {
        await sleep(900);
      }

      setExecutionStatus("executed");
      const receipt = buildReceipt({
        status: "EXECUTED",
        goal,
        reason: "-",
        address,
        policyId,
        workflowResult,
        txHash
      });
      setReceipts((current) => [receipt, ...current]);
      setSelectedReceipt(receipt);
    } catch (err) {
      setExecutionStatus("failed");
      setError(err instanceof Error ? err.message : "策略执行失败");
    }
  };

  const connector = connectors[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border border-line bg-white/90 p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-mint">AssetPilot Demo</div>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Policy 控制的 AI 投资组合执行</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            AI 生成策略，用户授权 Policy，合约强制执行白名单、黑名单、支出和滑点边界。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`rounded-md border px-3 py-2 text-sm ${isConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-slate-50 text-slate-600"}`}>
            {isConnected ? `已连接 ${shortAddress(address)}` : "未连接钱包，可浏览 mock dashboard"}
          </div>
          {isConnected ? (
            <button className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-slate-50" onClick={() => disconnect()}>
              <Wallet size={16} /> 断开
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!connector || isConnecting}
              onClick={() => connector && connect({ connector })}
            >
              {isConnecting ? <Loader2 className="animate-spin" size={16} /> : <Wallet size={16} />} 连接钱包
            </button>
          )}
        </div>
      </header>

      {error ? <Notice tone="danger" text={error} /> : null}
      {apiFallbackNotice ? <Notice tone="warning" text={apiFallbackNotice} /> : null}

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Dashboard address={address} isConnected={isConnected} receipts={receipts} />
        <GoalInput goal={goal} setGoal={setGoal} onGenerate={handleGenerate} isLoading={agentSteps.some((step) => step.status === "running")} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <AgentPipeline steps={agentSteps} />
        <StrategyPreview goal={goal} strategy={null} analystResult={fallbackAnalyst} riskReview={null} workflowResult={workflowResult} />
      </section>

      <SafetyConfirmationPanel
        workflowResult={workflowResult}
        isConfirmed={safetyConfirmed}
        canConfirm={canSafetyConfirm}
        onConfirmChange={setSafetyConfirmed}
      />

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <PolicySetup
          isConnected={isConnected}
          policyId={policyId}
          status={policyStatus}
          canCreate={Boolean(canCreatePolicy)}
          onCreate={handleCreatePolicy}
        />
        <PortfolioComparison afterPortfolio={afterPortfolio} executed={executionStatus === "executed"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <ExecuteStrategy
          canExecute={Boolean(canExecute)}
          status={executionStatus}
          rejected={rejected}
          rejectionReason={workflowResult?.risk_agent?.blocking_issues[0]?.code ?? workflowResult?.risk_agent?.decision ?? ""}
          onExecute={handleExecute}
        />
        <ReceiptHistory receipts={receipts} selectedReceipt={selectedReceipt} onSelect={setSelectedReceipt} />
      </section>
    </main>
  );
}

function Dashboard({ address, isConnected, receipts }: { address?: Address; isConnected: boolean; receipts: StrategyReceipt[] }) {
  return (
    <Panel title="Dashboard" action={<StatusPill status={isConnected ? "completed" : "pending"} label={isConnected ? "Wallet live" : "Mock view"} />}>
      <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <Metric label="钱包地址" value={isConnected ? shortAddress(address) : "未连接"} helper={isConnected ? "可创建 Policy 和执行策略" : "仍可查看演示组合"} />
          <Metric label="投资组合总价值" value={usd(totalValue)} helper="模拟代币化资产组合" />
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">风险评分</div>
                <div className="mt-1 text-3xl font-semibold text-ink">82</div>
              </div>
              <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">High</span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-gold" style={{ width: "82%" }} />
            </div>
          </div>
        </div>
        <div className="min-h-[260px]">
          <AllocationChart data={portfolioBefore} />
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 text-sm font-semibold text-ink">最近回执</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {receipts.slice(0, 2).map((receipt) => (
            <div key={receipt.id} className="rounded-md border border-line bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{receipt.goal}</span>
                <span className={receipt.status === "EXECUTED" ? "text-emerald-700" : "text-danger"}>{receipt.status === "EXECUTED" ? "已执行" : "已拒绝"}</span>
              </div>
              <div className="mt-1 text-slate-500">{receipt.time} · {receipt.riskDelta}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function GoalInput({ goal, setGoal, onGenerate, isLoading }: { goal: string; setGoal: (goal: string) => void; onGenerate: () => void; isLoading: boolean }) {
  return (
    <Panel title="Goal Input" action={<span className="text-xs font-medium text-slate-500">中文 / English</span>}>
      <label className="text-sm font-medium text-ink" htmlFor="goal">自然语言目标</label>
      <textarea
        id="goal"
        className="mt-2 min-h-[132px] w-full resize-none rounded-lg border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-mint focus:ring-2 focus:ring-mint/20"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-mint px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!goal.trim() || isLoading}
          onClick={onGenerate}
        >
          {isLoading ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />} 生成策略
        </button>
        <button
          className="rounded-md border border-line bg-white px-4 py-3 text-sm font-medium text-ink hover:bg-slate-50"
          onClick={() => setGoal("我想买入 mTSLA，最多交易 500 USDC。")}
        >
          填入拒绝示例
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">Demo 调用 V2 workflow；后端不可用时自动使用本地 mock。</p>
    </Panel>
  );
}

function AgentPipeline({ steps }: { steps: AgentStep[] }) {
  return (
    <Panel title="Agent Pipeline">
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id} className="flex gap-3 rounded-lg border border-line bg-white p-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${statusClass(step.status)}`}>
              {step.status === "running" ? <Loader2 className="animate-spin" size={17} /> : step.status === "completed" ? <Check size={17} /> : step.status === "rejected" || step.status === "failed" ? <AlertCircle size={17} /> : index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold text-ink">{step.name}</div>
                <StatusPill status={step.status} />
              </div>
              <div className="mt-1 text-sm text-slate-600">{step.description}</div>
              <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{step.output}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function StrategyPreview({
  goal,
  strategy,
  analystResult,
  riskReview,
  workflowResult
}: {
  goal: string;
  strategy: Strategy | null;
  analystResult: AnalystResult;
  riskReview: RiskReview | null;
  workflowResult?: OrchestratorResponse | null;
}) {
  const [open, setOpen] = useState(false);
  const blocked = riskReview?.status === "REJECTED";
  const preview = strategy ?? fallbackStrategy;

  return (
    <Panel title="Strategy Preview" action={blocked ? <StatusPill status="rejected" label="REJECTED" /> : strategy ? <StatusPill status="completed" label="READY" /> : <StatusPill status="pending" label="WAITING" />}>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <Metric label="用户目标" value={goal || "-"} helper="最终执行仍需用户授权和 Policy 约束" />
          <Metric label="策略摘要" value={preview.goal} helper={analystResult.summary} />
          <div className="grid grid-cols-3 gap-2">
            <Delta label="风险" before={preview.expectedImpact.riskScoreBefore} after={preview.expectedImpact.riskScoreAfter} />
            <Delta label="AI 敞口" before={preview.expectedImpact.aiExposureBefore} after={preview.expectedImpact.aiExposureAfter} />
            <Delta label="USDC 缓冲" before={preview.expectedImpact.cashBufferBefore} after={preview.expectedImpact.cashBufferAfter} />
          </div>
          {blocked ? <Notice tone="danger" text={`Risk Agent 已拒绝：${riskReview.reason}。不能创建 Policy 或继续执行。`} /> : null}
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">动作</th>
                <th className="px-3 py-2 font-medium">路径</th>
                <th className="px-3 py-2 font-medium">金额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {preview.actions.map((action, index) => (
                <tr key={`${action.sellToken}-${action.buyToken}-${index}`}>
                  <td className="px-3 py-3 font-semibold text-ink">{action.actionType}</td>
                  <td className="px-3 py-3 text-slate-700">{action.sellToken} {"->"} {action.buyToken}</td>
                  <td className="px-3 py-3 text-slate-700">{action.sellAmountUsd} USDC</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} 原始 strategy JSON
      </button>
      {open ? <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(preview, null, 2)}</pre> : null}
      {workflowResult ? (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <WorkflowV2Preview workflowResult={workflowResult} />
          <ExecutionPlanPreview workflowResult={workflowResult} />
        </div>
      ) : null}
    </Panel>
  );
}

function WorkflowV2Preview({ workflowResult }: { workflowResult: OrchestratorResponse }) {
  const analyse = workflowResult.analyse_agent;
  const strategy = workflowResult.strategy_agent?.strategy;
  const risk = workflowResult.risk_agent;

  return (
    <div className="space-y-4">
      <V2Section title="Workflow State">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue label="current_state" value={workflowResult.current_state} />
          <KeyValue label="next_agent" value={workflowResult.next_agent} />
          <KeyValue label="next_user_action" value={workflowResult.next_user_action} />
          <KeyValue label="reason" value={workflowResult.reason} />
        </div>
      </V2Section>

      {analyse ? (
        <V2Section title="Analyst V2">
          <div className="grid gap-3 md:grid-cols-4">
            <KeyValue label="total_value_usd" value={usd(analyse.portfolio_snapshot.total_value_usd)} />
            <KeyValue label="stablecoin_ratio" value={formatRatio(analyse.portfolio_snapshot.stablecoin_ratio)} />
            <KeyValue
              label="largest_position"
              value={
                analyse.portfolio_snapshot.largest_position
                  ? `${analyse.portfolio_snapshot.largest_position.symbol} / ${formatRatio(analyse.portfolio_snapshot.largest_position.weight)}`
                  : "-"
              }
            />
            <KeyValue label="risk_level" value={analyse.risk_context.risk_level} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <ListBlock title="risk_factors">
              {analyse.risk_context.risk_factors.length > 0 ? (
                analyse.risk_context.risk_factors.map((factor) => (
                  <li key={factor.factor_id} className="rounded-md border border-line bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{factor.factor_id}</span>
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-800">{factor.severity}</span>
                    </div>
                    <div className="mt-1 break-words text-slate-600">{factor.description}</div>
                  </li>
                ))
              ) : (
                <EmptyLine />
              )}
            </ListBlock>
            <ListBlock title="constraints_for_strategy">
              {analyse.risk_context.constraints_for_strategy.length > 0 ? (
                analyse.risk_context.constraints_for_strategy.map((constraint, index) => (
                  <li key={`${constraint.constraint}-${index}`} className="rounded-md border border-line bg-white p-3">
                    <div className="break-words font-semibold text-ink">{constraint.constraint}</div>
                    <div className="mt-1 text-slate-600">{constraint.reason}</div>
                    <div className="mt-1 text-xs text-slate-500">hard: {String(constraint.hard)}</div>
                  </li>
                ))
              ) : (
                <EmptyLine />
              )}
            </ListBlock>
          </div>
        </V2Section>
      ) : null}

      {strategy ? (
        <V2Section title="StrategyJson V2">
          <div className="grid gap-3 md:grid-cols-3">
            <KeyValue label="strategy_id" value={strategy.strategy_id} />
            <KeyValue label="objective.type" value={strategy.objective.type} />
            <KeyValue label="objective.description" value={strategy.objective.description} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <KeyValue label="max_slippage_bps" value={strategy.constraints.max_slippage_bps ?? "-"} />
            <KeyValue label="min_stablecoin_ratio" value={formatRatio(strategy.constraints.min_stablecoin_ratio)} />
            <KeyValue label="max_single_asset_ratio" value={formatRatio(strategy.constraints.max_single_asset_ratio)} />
            <KeyValue label="allowed_chains" value={formatUnknown(strategy.constraints.allowed_chains)} />
            <KeyValue label="allowed_protocols" value={formatUnknown(strategy.constraints.allowed_protocols)} />
            <KeyValue label="denied_assets" value={formatUnknown(strategy.constraints.denied_assets ?? strategy.constraints.blocked_assets)} />
          </div>
          <ListBlock title="actions" className="mt-3">
            {strategy.actions.length > 0 ? (
              strategy.actions.map((action) => (
                <li key={action.action_id} className="rounded-md border border-line bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{action.action_id}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">{action.type}</span>
                  </div>
                  <div className="mt-1 text-slate-700">{formatActionRoute(action.from_asset, action.to_asset, action.asset)}</div>
                  <div className="mt-1 text-slate-600">amount: {formatAmountSpec(action.amount)}</div>
                  <div className="mt-1 break-words text-slate-600">{action.rationale}</div>
                </li>
              ))
            ) : (
              <EmptyLine />
            )}
          </ListBlock>
          <ListBlock title="assumptions" className="mt-3">
            {strategy.assumptions.length > 0 ? strategy.assumptions.map((assumption) => <li key={assumption} className="break-words rounded-md bg-white px-3 py-2 text-slate-600">{assumption}</li>) : <EmptyLine />}
          </ListBlock>
        </V2Section>
      ) : null}

      {risk ? (
        <V2Section title="RiskReview V2" action={<DecisionPill decision={risk.decision} />}>
          <div className="grid gap-3 md:grid-cols-3">
            <KeyValue label="decision" value={risk.decision} />
            <KeyValue label="risk_score" value={risk.risk_score} />
            <KeyValue label="summary" value={risk.human_readable_summary} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <IssueList title="blocking_issues" issues={risk.blocking_issues} />
            <IssueList title="warnings" issues={risk.warnings} />
          </div>
          <ListBlock title="revised_strategy_patch" className="mt-3">
            {risk.revised_strategy_patch.length > 0 ? (
              risk.revised_strategy_patch.map((patch, index) => (
                <li key={`${patch.op}-${patch.path}-${index}`} className="rounded-md border border-line bg-white p-3">
                  <div className="font-semibold text-ink">{patch.op} {patch.path}</div>
                  <div className="mt-1 break-words text-slate-600">value: {formatUnknown(patch.value)}</div>
                </li>
              ))
            ) : (
              <EmptyLine />
            )}
          </ListBlock>
        </V2Section>
      ) : null}
    </div>
  );
}

function ExecutionPlanPreview({ workflowResult }: { workflowResult: OrchestratorResponse | null }) {
  const plan = workflowResult?.execution_agent?.execution_plan;
  if (!plan) return null;

  const summary = plan.user_confirmation_summary;

  return (
    <V2Section title="ExecutionPlan">
      <div className="grid gap-3 md:grid-cols-4">
        <KeyValue label="execution_plan_id" value={plan.execution_plan_id} />
        <KeyValue label="status" value={plan.status} />
        <KeyValue label="simulation.required" value={String(plan.simulation.required)} />
        <KeyValue label="simulation.status" value={plan.simulation.status} />
      </div>
      <div className="mt-3">
        <KeyValue label="simulation.summary" value={plan.simulation.summary ?? "-"} />
      </div>
      {plan.blocked_reason ? <Notice tone="danger" text={plan.blocked_reason} /> : null}
      <ListBlock title="dry-run steps" className="mt-3">
        {plan.steps.length > 0 ? (
          plan.steps.map((step) => (
            <li key={step.step_id} className="rounded-md border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{step.step_id}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">{step.type}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label="chain" value={step.chain} />
                <KeyValue label="protocol" value={step.protocol ?? "-"} />
                <KeyValue label="asset route" value={`${step.asset_in ?? "-"} -> ${step.asset_out ?? "-"}`} />
                <KeyValue label="amount_in" value={step.amount_in ?? "-"} />
                <KeyValue label="min_amount_out" value={step.min_amount_out ?? "-"} />
                <KeyValue label="requires_user_signature" value={String(step.requires_user_signature)} />
              </div>
              <div className="mt-2 break-words text-xs text-slate-600">{step.human_readable}</div>
              <div className="mt-2 break-words font-mono text-xs text-slate-500">
                {step.calldata ? "calldata: generated for execution" : "calldata: not generated in dry-run"}
              </div>
            </li>
          ))
        ) : (
          <EmptyLine />
        )}
      </ListBlock>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <KeyValue label="chains" value={formatUnknown(summary.chains)} />
        <KeyValue label="protocols" value={formatUnknown(summary.protocols)} />
        <KeyValue label="assets_spent" value={formatUnknown(summary.assets_spent)} />
        <KeyValue label="assets_received_expected" value={formatUnknown(summary.assets_received_expected)} />
        <KeyValue label="max_slippage_bps" value={summary.max_slippage_bps ?? "-"} />
        <KeyValue label="estimated_gas_usd" value={summary.estimated_gas_usd == null ? "-" : usd(summary.estimated_gas_usd)} />
      </div>
      <div className="mt-3">
        <KeyValue label="worst_case_summary" value={summary.worst_case_summary} />
      </div>
    </V2Section>
  );
}

function SafetyConfirmationPanel({
  workflowResult,
  isConfirmed,
  canConfirm,
  onConfirmChange
}: {
  workflowResult: OrchestratorResponse | null;
  isConfirmed: boolean;
  canConfirm: boolean;
  onConfirmChange: (confirmed: boolean) => void;
}) {
  const risk = workflowResult?.risk_agent ?? null;
  const executionAgent = workflowResult?.execution_agent ?? null;
  const plan = executionAgent?.execution_plan ?? null;
  const hasCalldata = Boolean(plan?.steps.some((step) => step.calldata !== null));
  const descriptors = plan?.steps.map((step) => step.contract_payload).filter((payload): payload is NonNullable<typeof payload> => !!payload) ?? [];
  const disabledReason = safetyDisabledReason(workflowResult);
  const checked = isConfirmed && canConfirm;

  if (!workflowResult) {
    return (
      <Panel title="Safety Confirmation" action={<StatusPill status="pending" label="PENDING" />}>
        <Notice tone="warning" text="生成 V2 workflow 后会出现安全确认清单。" />
      </Panel>
    );
  }

  return (
    <Panel title="Safety Confirmation" action={<StatusPill status={checked ? "completed" : canConfirm ? "pending" : "rejected"} label={checked ? "CONFIRMED" : canConfirm ? "READY" : "BLOCKED"} />}>
      <div className="grid gap-3 lg:grid-cols-3">
        <SafetyCheckRow
          label="Risk Agent"
          state={risk?.decision === "approve" ? "passed" : "blocked"}
          detail={risk ? `${risk.decision} / score ${risk.risk_score}. ${risk.human_readable_summary}` : "RiskReviewV2 尚未返回。"}
        />
        <SafetyCheckRow
          label="Execution Plan"
          state={executionAgent?.status === "dry_run_prepared" && plan && plan.status !== "blocked" ? "passed" : "blocked"}
          detail={plan ? `${executionAgent?.status ?? "-"} / ${plan.status}` : "ExecutionPlan 未 ready。"}
        />
        <SafetyCheckRow
          label="Payload / Calldata"
          state={hasCalldata ? "blocked" : plan ? "passed" : "blocked"}
          detail={hasCalldata ? "calldata exists but decode/simulation gate is not implemented yet." : plan ? "All step calldata is null." : "ExecutionPlan 尚未生成。"}
        />
      </div>

      {plan ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <V2Section title="RiskReviewV2">
              <div className="grid gap-3 sm:grid-cols-2">
                <KeyValue label="decision" value={risk?.decision ?? "-"} />
                <KeyValue label="risk_score" value={risk?.risk_score ?? "-"} />
              </div>
              <div className="mt-3">
                <KeyValue label="summary" value={risk?.human_readable_summary ?? "-"} />
              </div>
            </V2Section>

            <V2Section title="ExecutionPlan Dry-run">
              <div className="grid gap-3 sm:grid-cols-2">
                <KeyValue label="execution_agent.status" value={executionAgent?.status ?? "-"} />
                <KeyValue label="execution_plan.status" value={plan.status} />
                <KeyValue label="simulation.required" value={String(plan.simulation.required)} />
                <KeyValue label="simulation.status" value={plan.simulation.status} />
              </div>
              {plan.simulation.status !== "passed" ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  当前为 dry-run 阶段，真实执行前仍需模拟通过。
                </div>
              ) : null}
            </V2Section>
          </div>

          <div className="space-y-3">
            <V2Section title="Contract Payload Descriptor">
              {descriptors.length > 0 ? (
                <ul className="space-y-2 text-xs">
                  {descriptors.map((payload) => (
                    <li key={payload.action_id} className="rounded-md border border-line bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{payload.action_id}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">{payload.contract_method}</span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <KeyValue label="sell_token_symbol" value={payload.sell_token_symbol} />
                        <KeyValue label="buy_token_symbol" value={payload.buy_token_symbol} />
                        <KeyValue label="sell_amount_usd" value={payload.sell_amount_usd} />
                        <KeyValue label="min_buy_amount" value={payload.min_buy_amount} />
                        <KeyValue label="max_slippage_bps" value={payload.max_slippage_bps} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">No contract payload descriptor prepared.</div>
              )}
            </V2Section>

            <V2Section title="User Confirmation Summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <KeyValue label="chains" value={formatUnknown(plan.user_confirmation_summary.chains)} />
                <KeyValue label="protocols" value={formatUnknown(plan.user_confirmation_summary.protocols)} />
                <KeyValue label="assets_spent" value={formatUnknown(plan.user_confirmation_summary.assets_spent)} />
                <KeyValue label="assets_received_expected" value={formatUnknown(plan.user_confirmation_summary.assets_received_expected)} />
                <KeyValue label="max_slippage_bps" value={plan.user_confirmation_summary.max_slippage_bps ?? "-"} />
                <KeyValue label="estimated_gas_usd" value={plan.user_confirmation_summary.estimated_gas_usd == null ? "-" : usd(plan.user_confirmation_summary.estimated_gas_usd)} />
                <KeyValue label="approval_requests" value={formatUnknown(plan.user_confirmation_summary.approval_requests)} />
                <KeyValue label="worst_case_summary" value={plan.user_confirmation_summary.worst_case_summary} />
              </div>
            </V2Section>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-line bg-slate-50 p-3">
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-line text-mint"
            checked={checked}
            disabled={!canConfirm}
            onChange={(event) => onConfirmChange(event.target.checked)}
          />
          <span>我已检查 V2 Risk Review、dry-run Execution Plan、资产花费、滑点和授权请求。</span>
        </label>
        {!canConfirm ? <div className="mt-2 text-sm text-danger">{disabledReason}</div> : null}
        {!checked ? <div className="mt-2 text-sm text-amber-800">需要先完成 V2 安全确认，才能创建 Policy 或执行。</div> : null}
      </div>
    </Panel>
  );
}

function SafetyCheckRow({ label, state, detail }: { label: string; state: "passed" | "blocked" | "caution"; detail: string }) {
  const pill = state === "passed"
    ? <StatusPill status="completed" label="PASS" />
    : state === "blocked"
      ? <StatusPill status="rejected" label="BLOCKED" />
      : <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold uppercase text-amber-800">CAUTION</span>;

  return (
    <div className="rounded-md border border-line bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-ink">{label}</div>
        {pill}
      </div>
      <div className="mt-2 break-words text-sm text-slate-600">{detail}</div>
    </div>
  );
}

function safetyDisabledReason(workflowResult: OrchestratorResponse | null): string {
  if (!workflowResult) return "workflow 尚未生成";
  if (workflowResult.risk_agent?.decision !== "approve") return "Risk Agent 未 approve";
  const plan = workflowResult.execution_agent?.execution_plan;
  if (workflowResult.execution_agent?.status !== "dry_run_prepared" || !plan || plan.status === "blocked") {
    return "ExecutionPlan 未 ready";
  }
  if (plan.steps.some((step) => step.calldata !== null)) return "calldata 非 null";
  return "安全确认条件未满足";
}

function V2Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-white px-3 py-2 text-xs">
      <div className="font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-words text-slate-800">{value}</div>
    </div>
  );
}

function ListBlock({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</div>
      <ul className="space-y-2 text-xs">{children}</ul>
    </div>
  );
}

function IssueList({ title, issues }: { title: string; issues: NonNullable<OrchestratorResponse["risk_agent"]>["blocking_issues"] }) {
  return (
    <ListBlock title={title}>
      {issues.length > 0 ? (
        issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className="rounded-md border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{issue.code}</span>
              <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-700">{issue.severity}</span>
            </div>
            <div className="mt-1 break-words text-slate-600">{issue.description ?? issue.message}</div>
            {issue.suggested_fix ? <div className="mt-1 break-words text-slate-500">fix: {issue.suggested_fix}</div> : null}
          </li>
        ))
      ) : (
        <EmptyLine />
      )}
    </ListBlock>
  );
}

function EmptyLine() {
  return <li className="rounded-md bg-white px-3 py-2 text-xs text-slate-500">-</li>;
}

function DecisionPill({ decision }: { decision: RiskDecision }) {
  const status: AgentStatus = decision === "approve" ? "completed" : decision === "revise" ? "pending" : "rejected";
  return <StatusPill status={status} label={decision.toUpperCase()} />;
}

function formatRatio(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatUnknown(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatAmountSpec(amount: AmountSpec | null | undefined): string {
  if (!amount || amount.mode === "none") return "-";
  if (amount.value == null) return amount.unit ?? "-";
  return amount.unit ? `${amount.value} ${amount.unit}` : String(amount.value);
}

function formatActionRoute(fromAsset: string | null, toAsset: string | null, asset: string | null): string {
  if (fromAsset || toAsset) return `${fromAsset ?? "-"} -> ${toAsset ?? "-"}`;
  return asset ?? "-";
}

function PolicySetup({ isConnected, policyId, status, canCreate, onCreate }: { isConnected: boolean; policyId: string; status: string; canCreate: boolean; onCreate: () => void }) {
  return (
    <Panel title="Policy Setup" action={<StatusPill status={status === "created" ? "completed" : status === "failed" ? "failed" : status === "pending" ? "running" : "pending"} />}>
      <div className="grid gap-2 text-sm">
        <PolicyRow label="最大支出" value="500 USDC" />
        <PolicyRow label="单笔最大交易" value="300 USDC" />
        <PolicyRow label="允许资产" value="mNVDA、mAAPL、mSPY、USDC" />
        <PolicyRow label="禁止资产" value="mTSLA" />
        <PolicyRow label="最大滑点" value="1%" />
        <PolicyRow label="有效期" value="30 分钟" />
      </div>
      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canCreate}
        onClick={onCreate}
      >
        {status === "pending" ? <Loader2 className="animate-spin" size={16} /> : <CopyCheck size={16} />} 签署并创建策略
      </button>
      <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
        {isConnected ? "已连接钱包，可创建链上或 mock Policy。" : "未连接钱包时不能创建 Policy。"}
        {policyId ? <div className="mt-2 break-all font-mono text-xs text-ink">policyId: {policyId}</div> : null}
      </div>
    </Panel>
  );
}

function PortfolioComparison({ afterPortfolio, executed }: { afterPortfolio: PortfolioAsset[]; executed: boolean }) {
  return (
    <Panel title="Portfolio Before / After" action={<StatusPill status={executed ? "completed" : "pending"} label={executed ? "actual after" : "expected after"} />}>
      <div className="grid gap-4 lg:grid-cols-2">
        <ComparisonChart title="执行前" risk={82} data={portfolioBefore} />
        <ComparisonChart title={executed ? "执行后" : "预期执行后"} risk={61} data={afterPortfolio} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Delta label="AI 敞口" before="76%" after="58%" highlight />
        <Delta label="风险评分" before="82" after="61" highlight />
        <Delta label="现金缓冲" before="8%" after="15%" highlight />
      </div>
    </Panel>
  );
}

function ExecuteStrategy({ canExecute, status, rejected, rejectionReason, onExecute }: { canExecute: boolean; status: string; rejected: boolean; rejectionReason: string; onExecute: () => void }) {
  return (
    <Panel title="Execute Strategy" action={<StatusPill status={status === "executed" ? "completed" : status === "refused" || rejected ? "rejected" : status === "pending" ? "running" : "pending"} />}>
      <div className="rounded-lg border border-line bg-slate-50 p-4">
        {status === "executed" ? (
          <div className="text-emerald-800"><div className="text-lg font-semibold">已执行</div><div className="mt-1 text-sm">风险从 82 降低到 61，已记录回执。</div></div>
        ) : rejected ? (
          <div className="text-danger"><div className="text-lg font-semibold">已拒绝</div><div className="mt-1 text-sm">原因：{rejectionReason}，已记录回执。</div></div>
        ) : (
          <div className="text-slate-700"><div className="text-lg font-semibold">等待执行</div><div className="mt-1 text-sm">必须先生成策略、通过 Risk Agent、创建 policyId。</div></div>
        )}
      </div>
      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-mint px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canExecute}
        onClick={onExecute}
      >
        {status === "pending" ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} 执行策略
      </button>
    </Panel>
  );
}

function ReceiptHistory({ receipts, selectedReceipt, onSelect }: { receipts: StrategyReceipt[]; selectedReceipt: StrategyReceipt | null; onSelect: (receipt: StrategyReceipt) => void }) {
  return (
    <Panel title="Receipt History">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">时间</th>
              <th className="px-3 py-2 font-medium">目标</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">风险</th>
              <th className="px-3 py-2 font-medium">原因</th>
              <th className="px-3 py-2 font-medium">交易</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {receipts.map((receipt) => (
              <tr key={receipt.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onSelect(receipt)}>
                <td className="px-3 py-3">{receipt.time}</td>
                <td className="px-3 py-3 font-medium text-ink">{receipt.goal}</td>
                <td className={`px-3 py-3 ${receipt.status === "EXECUTED" ? "text-emerald-700" : "text-danger"}`}>{receipt.status === "EXECUTED" ? "已执行" : "已拒绝"}</td>
                <td className="px-3 py-3">{receipt.riskDelta}</td>
                <td className="px-3 py-3">{receipt.reason}</td>
                <td className="px-3 py-3 font-mono text-xs">{receipt.txHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedReceipt ? (
        <div className="mt-4 grid gap-2 rounded-lg border border-line bg-slate-50 p-4 text-sm md:grid-cols-2">
          {[
            ["用户", selectedReceipt.user],
            ["Agent", selectedReceipt.agent],
            ["授权签名者", selectedReceipt.authorizedBy],
            ["策略哈希", selectedReceipt.strategyHash],
            ["策略内容哈希", selectedReceipt.strategyContentHash],
            ["市场快照哈希", selectedReceipt.marketSnapshotHash],
            ["原因", selectedReceipt.reason],
            ["交易哈希", selectedReceipt.txHash]
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="break-all font-mono text-xs text-ink">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function AllocationChart({ data }: { data: PortfolioAsset[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="weight" nameKey="symbol" innerRadius={58} outerRadius={92} paddingAngle={2} label={({ symbol, weight }) => `${symbol} ${weight}%`}>
            {data.map((entry) => <Cell key={entry.symbol} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(value) => `${value}%`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonChart({ title, risk, data }: { title: string; risk: number; data: PortfolioAsset[] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-ink">{title}</div>
        <div className="text-sm text-slate-500">风险 {risk}</div>
      </div>
      <AllocationChart data={data} />
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white/95 p-4 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, helper }: { label: string; value?: React.ReactNode; helper?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold text-ink">{value}</div>
      {helper ? <div className="mt-1 text-sm text-slate-500">{helper}</div> : null}
    </div>
  );
}

function Delta({ label, before, after, highlight = false }: { label: string; before: React.ReactNode; after: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-line bg-slate-50"}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{before} <span className="text-slate-400">{"->"}</span> <span className={highlight ? "text-emerald-700" : "text-ink"}>{after}</span></div>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function Notice({ tone, text }: { tone: "warning" | "danger"; text: string }) {
  const classes = tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{text}</div>;
}

function StatusPill({ status, label }: { status: AgentStatus; label?: string }) {
  const text = label ?? status;
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold uppercase ${statusClass(status)}`}>{text}</span>;
}

function statusClass(status: AgentStatus) {
  switch (status) {
    case "running":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-emerald-100 text-emerald-700";
    case "failed":
      return "bg-red-100 text-red-700";
    case "rejected":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function buildReceipt({
  status,
  goal,
  reason,
  address,
  policyId,
  workflowResult,
  txHash
}: {
  status: "EXECUTED" | "REFUSED";
  goal: string;
  reason: string;
  address?: Address;
  policyId: string;
  workflowResult: OrchestratorResponse | null;
  txHash?: string;
}): StrategyReceipt {
  const user = address ?? "0xA11CE00000000000000000000000000000000000";
  const strategyJson = workflowResult?.strategy_agent?.strategy ?? null;
  const strategyHash = hashObject(strategyJson ?? { goal });
  const riskAfter = workflowResult?.risk_agent?.risk_score;
  return {
    id: `rcpt-${Date.now()}`,
    time: nowTime(),
    goal: strategyJson?.objective.description ?? (goal.includes("mTSLA") ? "买入 mTSLA" : "降低 AI 敞口"),
    status,
    riskDelta: status === "EXECUTED" && riskAfter !== undefined ? `82 -> ${riskAfter}` : status === "EXECUTED" ? "82 -> ?" : "-",
    reason,
    txHash: txHash ? shortAddress(txHash) : status === "EXECUTED" ? "0xmock...ok" : "0xmock...no",
    user,
    agent: addresses.agent,
    authorizedBy: user,
    policyId,
    policyHash: hashObject({ policyId, user }),
    authorizationHash: hashObject({ policyId, user, agent: addresses.agent }),
    strategyHash,
    strategyContentHash: hashObject(strategyJson?.actions ?? []),
    marketSnapshotHash: marketSnapshot.hash
  };
}
