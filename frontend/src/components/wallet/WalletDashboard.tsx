"use client";

import { ErrorState, LoadingSkeleton, EmptyState } from "@/components/shared/State";
import { DataTable } from "@/components/shared/DataTable";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { RiskRail } from "@/components/risk/RiskRail";
import { usePerplRisk } from "@/hooks/usePerplRisk";
import { usePerplWallet } from "@/hooks/usePerplWallet";
import { formatDuration, formatLeverage, formatPercent, formatToken, formatUsdValue, shortAddress, signedClass } from "@/lib/format";

export function WalletDashboard() {
  const wallet = usePerplWallet();
  const risk = usePerplRisk();
  const account = wallet.wallet.data?.accounts[0];

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet Risk</h1>
        <p className="mt-1 text-sm text-terminal-muted">Private data comes from the backend Perpl read API key configured for this environment. Browser clients do not receive Perpl API secrets.</p>
      </section>

      {wallet.wallet.isLoading || risk.isLoading ? <LoadingSkeleton rows={4} /> : null}
      {wallet.wallet.error ? <ErrorState error={wallet.wallet.error} onRetry={() => wallet.wallet.refetch()} title="Perpl monitored account unavailable" /> : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel title="Perpl monitored account">
          {wallet.wallet.data ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Address" value={shortAddress(wallet.wallet.data.address ?? undefined)} />
              <Summary label="Account ID" value={account ? String(account.accountId) : "Unavailable"} />
              <Summary label="Balance" value={formatUsdValue(account?.balance)} />
              <Summary label="Locked balance" value={formatUsdValue(account?.lockedBalance)} />
              <Summary label="Locked ratio" value={formatPercent(risk.data?.walletMetrics.lockedBalanceRatio)} />
              <Summary label="Forwarding" value={account?.allowsForwarding ? "Enabled" : "Disabled"} />
              <Summary label="Frozen" value={account?.isFrozen ? "Frozen" : "Active"} />
              <Summary label="Gross exposure" value={formatUsdValue(risk.data?.walletMetrics.grossPositionNotional, { compact: true })} />
              <Summary label="Estimated PnL" value={formatUsdValue(risk.data?.walletMetrics.estimatedUnrealizedPnl, { estimated: true })} />
              <Summary label="Effective leverage" value={formatLeverage(risk.data?.walletMetrics.effectiveLeverageEstimate)} />
            </div>
          ) : (
            <EmptyState title="Private Perpl data is not configured" description="Configure a backend read API key to unlock monitored wallet data." />
          )}
        </Panel>
        <RiskRail risk={risk.data} error={risk.error} />
      </section>

      {risk.data ? (
        <>
          <Section title="Risk components">
            <DataTable
              rows={risk.data.components}
              getRowKey={(row) => row.id}
              columns={[
                { key: "component", header: "Component", render: (row) => row.label },
                { key: "raw", header: "Raw value", align: "right", render: (row) => row.rawValue ?? "Unavailable" },
                { key: "weight", header: "Weight", align: "right", render: (row) => formatPercent(row.weight) },
                { key: "score", header: "Score", align: "right", render: (row) => row.score ?? "Unavailable" },
                { key: "contribution", header: "Contribution", align: "right", render: (row) => row.weightedContribution ?? "Unavailable" },
                { key: "availability", header: "Availability", render: (row) => row.available ? "Available" : row.reason ?? "Unavailable" },
                { key: "evidence", header: "Evidence", render: (row) => row.evidence.join("; ") || row.methodology }
              ]}
            />
          </Section>

          <Section title="Positions">
            {risk.data.positions.length === 0 ? <EmptyState title="No open positions" description="The monitored Perpl account currently has no open positions." /> : (
              <DataTable
                rows={risk.data.positions}
                getRowKey={(row) => row.positionId}
                columns={[
                  { key: "market", header: "Market", render: (row) => row.marketSymbol ?? row.marketId },
                  { key: "side", header: "Side", render: (row) => row.side ?? "Unavailable" },
                  { key: "size", header: "Size", align: "right", render: (row) => formatToken(row.size) },
                  { key: "entry", header: "Entry", align: "right", render: (row) => formatUsdValue(row.entryPrice) },
                  { key: "mark", header: "Mark", align: "right", render: (row) => formatUsdValue(row.markPrice) },
                  { key: "notional", header: "Notional", align: "right", render: (row) => formatUsdValue(row.notional, { estimated: true }) },
                  { key: "lev", header: "Leverage", align: "right", render: (row) => formatLeverage(row.leverage) },
                  { key: "pnl", header: "Estimated PnL", align: "right", render: (row) => <span className={signedClass(row.estimatedUnrealizedPnl)}>{formatUsdValue(row.estimatedUnrealizedPnl, { estimated: true })}</span> },
                  { key: "conc", header: "Concentration", align: "right", render: (row) => formatPercent(row.concentrationShare) },
                  { key: "liq", header: "Liq. distance", align: "right", render: (row) => row.liquidationDistancePercent === null ? "Unavailable" : formatPercent(row.liquidationDistancePercent) }
                ]}
              />
            )}
          </Section>

          <Section title="Performance">
            <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Realized PnL" value={formatUsdValue(risk.data.performance.realizedPnl)} />
              <Summary label="Win rate" value={formatPercent(risk.data.performance.winRate)} />
              <Summary label="Profit factor" value={risk.data.performance.profitFactor?.toFixed(2) ?? risk.data.performance.profitFactorUnavailableReason ?? "Unavailable"} />
              <Summary label="Max drawdown" value={formatUsdValue(risk.data.performance.maxDrawdown)} />
              <Summary label="Win/loss streak" value={`${risk.data.performance.currentWinStreak}/${risk.data.performance.currentLossStreak}`} />
              <Summary label="Average holding" value={formatDuration(risk.data.performance.averageHoldingTimeSeconds)} />
              <Summary label="Best market" value={risk.data.performance.bestMarket?.marketSymbol ?? "Unavailable"} />
              <Summary label="Fees" value={formatUsdValue(risk.data.performance.totalFees)} />
            </div>
            </Panel>
          </Section>

          <Section title="Risk issues">
            {risk.data.issues.length === 0 ? <EmptyState title="No active risk issues" description="Risk engine did not identify active issues for the monitored account." /> : (
              <div className="space-y-2">
                {risk.data.issues.map((issue) => (
                  <Panel key={issue.code} tone={issue.severity === "critical" || issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "default"}>
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge level={issue.severity} />
                      <p className="font-semibold text-terminal-text">{issue.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-terminal-muted">{issue.description}</p>
                    <p className="mt-2 text-xs text-terminal-subtle">Evidence: {issue.evidence.join("; ") || "Unavailable"}</p>
                    <p className="mt-1 text-xs text-terminal-subtle">Suggested action: {issue.suggestedAction}</p>
                  </Panel>
                ))}
              </div>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <MetricTile label={label} value={value} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-terminal-text">{title}</h2>
      {children}
    </section>
  );
}
