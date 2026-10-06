"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, Clock, CopyCheck, Loader2, Play, ShieldCheck, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { parseUnits, type Address, type Hex } from "viem";
import { useAccount, useConnect, useDisconnect, useWriteContract } from "wagmi";
import { analyze, executionSummary, generateStrategy, reviewRisk } from "@/lib/api";
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
import type { AgentStep, AgentStatus, AnalystResult, PortfolioAsset, RiskReview, Strategy, StrategyReceipt } from "@/types/assetpilot";

const totalValue = portfolioBefore.reduce((sum, asset) => sum + asset.valueUsd, 0);

export function AssetPilotDemo() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const [goal, setGoal] = useState(defaultGoal);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>(initialAgentSteps);
  const [analystResult, setAnalystResult] = useState<AnalystResult | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [riskReviewResult, setRiskReviewResult] = useState<RiskReview | null>(null);
  const [policyId, setPolicyId] = useState<Hex | "">("");
  const [executionStatus, setExecutionStatus] = useState<"idle" | "pending" | "executed" | "refused" | "failed">("idle");
  const [policyStatus, setPolicyStatus] = useState<"idle" | "pending" | "created" | "failed">("idle");
  const [receipts, setReceipts] = useState<StrategyReceipt[]>(mockReceipts);
  const [selectedReceipt, setSelectedReceipt] = useState<StrategyReceipt | null>(mockReceipts[0]);
  const [error, setError] = useState("");
  const [apiFallbackNotice, setApiFallbackNotice] = useState("");

  const approved = riskReviewResult?.status === "APPROVED";
  const rejected = riskReviewResult?.status === "REJECTED";
  const canCreatePolicy = isConnected && strategy && approved && policyStatus !== "pending";
  const canExecute = isConnected && strategy && approved && policyId && executionStatus !== "pending";
  const afterPortfolio = executionStatus === "executed" ? portfolioAfter : portfolioAfter;

  const updateStep = (id: AgentStep["id"], status: AgentStatus, output: string) => {
    setAgentSteps((steps) => steps.map((step) => (step.id === id ? { ...step, status, output } : step)));
  };

  const resetFlow = () => {
    setAgentSteps(initialAgentSteps);
    setAnalystResult(null);
    setStrategy(null);
    setRiskReviewResult(null);
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
      updateStep("analyst", "running", "正在读取 portfolio 与市场快照");
      await sleep(450);
      const analyst = await analyze(goal);
      if (analyst.usedFallback) notices.push("后端不可用，Analyst 使用本地 mock fallback。");
      setAnalystResult(analyst.data);
      updateStep("analyst", "completed", `risk score ${analyst.data.riskScore}，AI 敞口 ${analyst.data.aiExposure}`);

      updateStep("strategy", "running", "正在生成结构化策略 JSON");
      await sleep(450);
      const generated = await generateStrategy(goal, analyst.data, policyDraft);
      if (generated.usedFallback) notices.push("Strategy 使用本地 mock fallback。");
      const normalizedStrategy = withRejectedDemoIfRequested(goal, generated.data);
      setStrategy(normalizedStrategy);
      updateStep("strategy", "completed", `${normalizedStrategy.actions.length} 个动作，总额 ${normalizedStrategy.actions.reduce((sum, action) => sum + action.sellAmountUsd, 0)} USDC`);

      updateStep("risk", "running", "正在检查白名单、黑名单、支出与滑点");
      await sleep(450);
      const reviewed = await reviewRisk(normalizedStrategy, policyDraft, analyst.data);
      if (reviewed.usedFallback) notices.push("Risk Review 使用本地 mock fallback。");
      setRiskReviewResult(reviewed.data);

      if (reviewed.data.status === "REJECTED") {
        updateStep("risk", "rejected", `${reviewed.data.reason}：${reviewed.data.details}`);
        updateStep("execution", "rejected", "Risk Agent 已拒绝，链上执行被锁定");
        const receipt = buildReceipt({
          status: "REFUSED",
          goal,
          reason: reviewed.data.reason,
          address,
          policyId: "0xrisk-rejected",
          strategy: normalizedStrategy
        });
        setReceipts((current) => [receipt, ...current]);
        setSelectedReceipt(receipt);
      } else {
        updateStep("risk", "completed", `APPROVED，风险 ${reviewed.data.riskScoreBefore} -> ${reviewed.data.riskScoreAfter}`);
        updateStep("execution", "completed", "已准备合约参数，等待用户创建 Policy");
      }

      setApiFallbackNotice(notices.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "策略生成失败");
      updateStep("analyst", "failed", "流程失败，请重试");
    }
  };

  const handleCreatePolicy = async () => {
    if (!isConnected || !address) {
      setError("创建 Policy 前必须连接钱包。");
      return;
    }
    if (!strategy || !approved) {
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
        setPolicyId(hashObject({ txHash: hash, address, strategy }) as Hex);
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
    if (!strategy) {
      setError("执行前必须先生成策略。");
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

    setExecutionStatus("pending");
    setError("");

    const strategyHash = hashObject(strategy);
    const authorizationHash = hashObject({ policyId, address, strategyHash });

    try {
      const summary = await executionSummary({
        strategy,
        policyId,
        strategyHash,
        marketSnapshotHash: strategy.marketSnapshotHash,
        riskReview: riskReviewResult
      });

      let txHash = "0xmock-executed";
      const hasTokenAddresses = Object.values(addresses.tokens).every(Boolean);
      if (hasExecutorContract && hasTokenAddresses && addresses.strategyExecutor) {
        const contractActions = strategy.actions.map((action) => ({
          sellToken: addresses.tokens[action.sellToken as keyof typeof addresses.tokens] ?? zeroAddress,
          buyToken: addresses.tokens[action.buyToken as keyof typeof addresses.tokens] ?? zeroAddress,
          sellAmount: parseUnits(String(action.sellAmountUsd), 18),
          expectedBuyAmount: parseUnits(String(action.expectedBuyAmount), 18),
          minBuyAmount: parseUnits(String(action.minBuyAmount), 18)
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
              marketSnapshotHash: strategy.marketSnapshotHash,
              summary: strategy.goal
            }
          ]
        });
      } else {
        await sleep(900);
      }

      const executed = (summary.data as { status?: string }).status !== "REFUSED";
      setExecutionStatus(executed ? "executed" : "refused");
      const receipt = buildReceipt({
        status: executed ? "EXECUTED" : "REFUSED",
        goal,
        reason: executed ? "-" : "BUY_TOKEN_NOT_ALLOWED",
        address,
        policyId,
        strategy,
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
        <StrategyPreview goal={goal} strategy={strategy} analystResult={analystResult ?? fallbackAnalyst} riskReview={riskReviewResult} />
      </section>

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
          rejectionReason={riskReviewResult?.status === "REJECTED" ? riskReviewResult.reason : ""}
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
      <p className="mt-3 text-sm leading-6 text-slate-600">Demo 会依次调用 analyze、generate-strategy、review-risk；后端不可用时自动使用本地 mock。</p>
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

function StrategyPreview({ goal, strategy, analystResult, riskReview }: { goal: string; strategy: Strategy | null; analystResult: AnalystResult; riskReview: RiskReview | null }) {
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
    </Panel>
  );
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

function withRejectedDemoIfRequested(goal: string, strategy: Strategy): Strategy {
  const lowerGoal = goal.toLowerCase();
  const asksToBuyTesla = lowerGoal.includes("mtsla") && (lowerGoal.includes("买入") || lowerGoal.includes("buy"));
  if (!asksToBuyTesla) return strategy;

  return {
    ...strategy,
    goal: "尝试买入 mTSLA",
    actions: [
      {
        actionType: "BUY",
        sellToken: "USDC",
        buyToken: "mTSLA",
        sellAmountUsd: 300,
        expectedBuyAmount: 1,
        minBuyAmount: 0.99
      }
    ]
  };
}

function buildReceipt({
  status,
  goal,
  reason,
  address,
  policyId,
  strategy,
  txHash
}: {
  status: "EXECUTED" | "REFUSED";
  goal: string;
  reason: string;
  address?: Address;
  policyId: string;
  strategy: Strategy;
  txHash?: string;
}): StrategyReceipt {
  const user = address ?? "0xA11CE00000000000000000000000000000000000";
  const strategyHash = hashObject(strategy);
  return {
    id: `rcpt-${Date.now()}`,
    time: nowTime(),
    goal: goal.includes("mTSLA") ? "买入 mTSLA" : "降低 AI 敞口",
    status,
    riskDelta: status === "EXECUTED" ? "82 -> 61" : "-",
    reason,
    txHash: txHash ? shortAddress(txHash) : status === "EXECUTED" ? "0xmock...ok" : "0xmock...no",
    user,
    agent: addresses.agent,
    authorizedBy: user,
    policyId,
    policyHash: hashObject({ policyId, user }),
    authorizationHash: hashObject({ policyId, user, agent: addresses.agent }),
    strategyHash,
    strategyContentHash: hashObject(strategy.actions),
    marketSnapshotHash: strategy.marketSnapshotHash ?? marketSnapshot.hash
  };
}
