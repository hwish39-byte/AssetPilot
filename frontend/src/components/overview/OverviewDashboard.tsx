"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpDown, Database, Radio, ShieldAlert } from "lucide-react";
import { ChartContainer } from "@/components/shared/ChartContainer";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { MetricValue, StatusPill } from "@/components/shared/MetricValue";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { RealtimeStatusBadge } from "@/components/shared/RealtimeStatusBadge";
import { StatusBadge, toneForStatus } from "@/components/shared/StatusBadge";
import { RiskRail } from "@/components/risk/RiskRail";
import { perplApi, shouldRetryApi } from "@/lib/api";
import { usePerplOverview } from "@/hooks/usePerplOverview";
import { usePerplRealtime } from "@/hooks/usePerplRealtime";
import { usePerplRisk } from "@/hooks/usePerplRisk";
import { queryKeys } from "@/lib/queryKeys";
import { formatBps, formatPercent, formatUsdValue, formatUtc, signedClass, toFiniteNumber } from "@/lib/format";
import type { AnalyticsAvailabilityResponse, AnalyticsPeriod, DataAvailabilityItem, MarketAnalytics, MarketRanking, ProtocolOverview } from "@/types/perpl";

type AnalyticsTab = "overview" | "volume" | "oiFunding" | "risk" | "dataQuality";

const tabs: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "volume", label: "Volume" },
  { key: "oiFunding", label: "OI / Funding" },
  { key: "risk", label: "Risk" },
  { key: "dataQuality", label: "Data Quality" }
];

export function OverviewDashboard() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("24h");
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [sortKey, setSortKey] = useState<keyof MarketRanking>("volume24h");
  const { overview, availability } = usePerplOverview(period);
  const risk = usePerplRisk();
  const realtime = usePerplRealtime({ markets: (overview.data?.marketRankings ?? []).slice(0, 8).map((market) => market.marketId), channels: ["ticker", "funding", "heartbeat"] });
  const marketDetails = useQueries({
    queries: (overview.data?.marketRankings ?? []).map((market) => ({
      queryKey: queryKeys.perpl.market(market.marketId, period),
      queryFn: ({ signal }: { signal?: AbortSignal }) => perplApi.market(market.marketId, period, signal),
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: shouldRetryApi
    }))
  });
  const detailsById = new Map(
    marketDetails.map((query) => query.data).filter((market): market is MarketAnalytics => Boolean(market)).map((market) => [market.marketId, market])
  );

  const rows = useMemo(() => [...(overview.data?.marketRankings ?? [])].sort((a, b) => compareNullable(b[sortKey], a[sortKey])), [overview.data?.marketRankings, sortKey]);
  const volumeSortKey = period === "24h" ? "volume24h" : period === "7d" ? "volume7d" : "volume30d";
  const volumeRows = useMemo(() => [...(overview.data?.marketRankings ?? [])].sort((a, b) => compareNullable(b[volumeSortKey], a[volumeSortKey])), [overview.data?.marketRankings, volumeSortKey]);
  const oiFundingRows = useMemo(() => [...(overview.data?.marketRankings ?? [])].sort((a, b) => compareNullable(b.openInterestUsdEstimate, a.openInterestUsdEstimate) || compareNullable(b.absoluteFundingRate, a.absoluteFundingRate)), [overview.data?.marketRankings]);
  const volumeMetric = selectedVolumeMetric(overview.data, period);
  const availabilityItems = availability.data?.dataAvailability ?? overview.data?.dataAvailability ?? [];

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Perpl Analytics Overview</h1>
            <p className="mt-1 text-sm text-terminal-muted">Protocol activity, market risk signals, and monitored wallet context for AssetPilot.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeStatusBadge status={realtime.status} />
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>
        <AnalyticsTabs active={activeTab} onChange={setActiveTab} />
      </section>

      {overview.isLoading ? <LoadingSkeleton rows={4} /> : null}
      {overview.error ? <ErrorState error={overview.error} onRetry={() => overview.refetch()} title="Overview request failed" /> : null}

      {overview.data ? (
        <>
          {activeTab === "overview" ? (
            <OverviewTab
              overview={overview.data}
              period={period}
              volumeMetric={volumeMetric}
              risk={risk}
              rows={rows}
              sortKey={sortKey}
              setSortKey={setSortKey}
              detailsById={detailsById}
              realtime={realtime}
              availabilityItems={availabilityItems}
            />
          ) : null}

          {activeTab === "volume" ? (
            <VolumeTab overview={overview.data} period={period} volumeMetric={volumeMetric} rows={volumeRows} setSortKey={setSortKey} detailsById={detailsById} realtime={realtime} />
          ) : null}

          {activeTab === "oiFunding" ? (
            <OiFundingTab overview={overview.data} period={period} rows={oiFundingRows} setSortKey={setSortKey} detailsById={detailsById} realtime={realtime} />
          ) : null}

          {activeTab === "risk" ? (
            <RiskTab risk={risk} rows={rows} setSortKey={setSortKey} period={period} detailsById={detailsById} realtime={realtime} />
          ) : null}

          {activeTab === "dataQuality" ? (
            <DataQualityTab overview={overview.data} availabilityData={availability.data ?? null} availabilityItems={availabilityItems} realtimeMode={realtime.status?.mode ?? "unavailable"} realtimeError={realtime.error} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function OverviewTab({
  overview,
  period,
  volumeMetric,
  risk,
  rows,
  sortKey,
  setSortKey,
  detailsById,
  realtime,
  availabilityItems
}: {
  overview: ProtocolOverview;
  period: AnalyticsPeriod;
  volumeMetric: ReturnType<typeof selectedVolumeMetric>;
  risk: ReturnType<typeof usePerplRisk>;
  rows: MarketRanking[];
  sortKey: keyof MarketRanking;
  setSortKey: (key: keyof MarketRanking) => void;
  detailsById: Map<number, MarketAnalytics>;
  realtime: ReturnType<typeof usePerplRealtime>;
  availabilityItems: DataAvailabilityItem[];
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <ProtocolMetricGrid overview={overview} period={period} volumeMetric={volumeMetric} realtimeMode={realtime.status?.mode ?? "unavailable"} />
        <RiskRail risk={risk.data} error={risk.error} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <AggregateVolumeChart overview={overview} period={period} volumeMetric={volumeMetric} realtimeMode={realtime.status?.mode ?? "unavailable"} />
        <DataQualityPanel overview={overview} availabilityItems={availabilityItems} realtimeMode={realtime.status?.mode ?? "unavailable"} compact />
      </section>

      <FailedMarketsPanel failedMarkets={overview.failedMarkets} />

      <MarketActivityPanel rows={rows} sortKey={sortKey} setSortKey={setSortKey} period={period} detailsById={detailsById} realtime={realtime} title="Market activity" description="Preview of current market activity sorted by selected metric." />
    </div>
  );
}

function VolumeTab({
  overview,
  period,
  volumeMetric,
  rows,
  setSortKey,
  detailsById,
  realtime
}: {
  overview: ProtocolOverview;
  period: AnalyticsPeriod;
  volumeMetric: ReturnType<typeof selectedVolumeMetric>;
  rows: MarketRanking[];
  setSortKey: (key: keyof MarketRanking) => void;
  detailsById: Map<number, MarketAnalytics>;
  realtime: ReturnType<typeof usePerplRealtime>;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AggregateVolumeChart overview={overview} period={period} volumeMetric={volumeMetric} realtimeMode={realtime.status?.mode ?? "unavailable"} className="xl:min-h-[380px]" />
        <TopMarketsList title="Top volume markets" rows={rows.slice(0, 6)} period={period} metric="volume" />
      </section>
      <MarketActivityPanel rows={rows} sortKey={period === "24h" ? "volume24h" : period === "7d" ? "volume7d" : "volume30d"} setSortKey={setSortKey} period={period} detailsById={detailsById} realtime={realtime} title={`${period} volume ranking`} description="Markets ranked by selected period volume." />
    </div>
  );
}

function OiFundingTab({
  overview,
  period,
  rows,
  setSortKey,
  detailsById,
  realtime
}: {
  overview: ProtocolOverview;
  period: AnalyticsPeriod;
  rows: MarketRanking[];
  setSortKey: (key: keyof MarketRanking) => void;
  detailsById: Map<number, MarketAnalytics>;
  realtime: ReturnType<typeof usePerplRealtime>;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="OI USD estimate" value={<MetricValue metric={overview.metrics.totalOpenInterestUsdEstimate} format={(value) => formatUsdValue(value, { compact: true })} />} source={<StatusBadge tone={overview.metrics.totalOpenInterestUsdEstimate.estimated ? "warning" : "neutral"}>{overview.metrics.totalOpenInterestUsdEstimate.estimated ? "Estimated" : "REST"}</StatusBadge>} />
        <MetricTile label="Average funding" value={<MetricValue metric={overview.fundingOverview.averageFundingRateRaw} format={(value) => formatBps(value / 100)} />} source={<StatusBadge tone={toneForStatus(overview.fundingOverview.averageFundingRateRaw.status)}>{overview.fundingOverview.averageFundingRateRaw.status}</StatusBadge>} />
        <MetricTile label="Min funding" value={<MetricValue metric={overview.fundingOverview.minFundingRateRaw} format={(value) => formatBps(value / 100)} />} />
        <MetricTile label="Max funding" value={<MetricValue metric={overview.fundingOverview.maxFundingRateRaw} format={(value) => formatBps(value / 100)} />} />
      </section>
      <Panel title="Open Interest / Funding context" description="Current protocol-level OI and funding availability. No additional chart is rendered unless the API returns a usable series.">
        <div className="grid gap-3 md:grid-cols-3">
          <ContextMetric label="Top OI market" value={overview.metrics.topMarketByOpenInterest.value ?? "Unavailable"} status={overview.metrics.topMarketByOpenInterest.status} />
          <ContextMetric label="Historical OI" value={overview.series.historicalOpenInterest.value?.length ? `${overview.series.historicalOpenInterest.value.length} points` : "Unavailable"} status={overview.series.historicalOpenInterest.status} />
          <ContextMetric label="Funding series" value={`${overview.series.aggregateFundingSeries.length} points`} status={overview.series.aggregateFundingSeries.length > 0 ? "available" : "unavailable"} />
        </div>
      </Panel>
      <MarketActivityPanel rows={rows} sortKey="openInterestUsdEstimate" setSortKey={setSortKey} period={period} detailsById={detailsById} realtime={realtime} title="OI / Funding market table" description="Focus columns remain OI, funding, spread, and current market state." />
    </div>
  );
}

function RiskTab({
  risk,
  rows,
  setSortKey,
  period,
  detailsById,
  realtime
}: {
  risk: ReturnType<typeof usePerplRisk>;
  rows: MarketRanking[];
  setSortKey: (key: keyof MarketRanking) => void;
  period: AnalyticsPeriod;
  detailsById: Map<number, MarketAnalytics>;
  realtime: ReturnType<typeof usePerplRealtime>;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <RiskRail risk={risk.data} error={risk.error} />
        <Panel title="Risk context" description="Private risk context is optional and does not block public protocol analytics.">
          {risk.data ? (
            <div className="grid gap-3 md:grid-cols-3">
              <MetricTile label="Risk score" value={risk.data.score ?? "Unavailable"} source={<StatusBadge tone={risk.data.riskLevel === "low" ? "success" : risk.data.riskLevel === "medium" ? "warning" : "danger"}>{risk.data.riskLevel}</StatusBadge>} />
              <MetricTile label="Coverage" value={formatPercent(risk.data.scoreCoveragePercent, { alreadyPercent: true })} />
              <MetricTile label="Components" value={risk.data.components.length} helper={`${risk.data.issues.length} active issues`} />
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-sm text-signal-warn">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <p>Private risk data is unavailable. Public analytics and market activity remain usable.</p>
            </div>
          )}
        </Panel>
      </section>
      <MarketActivityPanel rows={rows} sortKey="spreadBps" setSortKey={setSortKey} period={period} detailsById={detailsById} realtime={realtime} title="Market risk signals" description="A lighter market table focused on spread, funding, and activity while reviewing wallet risk." />
    </div>
  );
}

function DataQualityTab({
  overview,
  availabilityData,
  availabilityItems,
  realtimeMode,
  realtimeError
}: {
  overview: ProtocolOverview;
  availabilityData: AnalyticsAvailabilityResponse | null;
  availabilityItems: DataAvailabilityItem[];
  realtimeMode: string;
  realtimeError: string | null;
}) {
  return (
    <div className="space-y-5">
      <DataQualityPanel overview={overview} availabilityItems={availabilityItems} realtimeMode={realtimeMode} availabilityCalculatedAt={availabilityData?.calculatedAt} realtimeError={realtimeError} />
      <FailedMarketsPanel failedMarkets={overview.failedMarkets} expanded />
    </div>
  );
}

function AnalyticsTabs({ active, onChange }: { active: AnalyticsTab; onChange: (tab: AnalyticsTab) => void }) {
  return (
    <div className="overflow-x-auto border-b border-terminal-line" role="tablist" aria-label="Overview analytics tabs">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => onChange(tab.key)}
            className={`min-h-10 rounded-t-md border border-b-0 px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-signal-live ${
              active === tab.key ? "border-terminal-line bg-terminal-panel text-terminal-text shadow-[inset_0_2px_0_#22d3ee]" : "border-transparent text-terminal-muted hover:bg-terminal-raised hover:text-terminal-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProtocolMetricGrid({ overview, period, volumeMetric, realtimeMode }: { overview: ProtocolOverview; period: AnalyticsPeriod; volumeMetric: ReturnType<typeof selectedVolumeMetric>; realtimeMode: string }) {
  return (
    <Panel title="Core metrics" description="Protocol activity, liquidity context, and data coverage for the selected timeframe." actions={<StatusBadge tone={realtimeMode === "websocket" ? "live" : "neutral"}>{realtimeMode === "websocket" ? "Live WS" : "REST"}</StatusBadge>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricTile label={`${period} volume`} value={<MetricValue metric={volumeMetric} format={(value) => formatUsdValue(value, { compact: true })} />} source={<StatusBadge tone={toneForStatus(volumeMetric?.status ?? "unavailable")}>{volumeMetric?.status ?? "unavailable"}</StatusBadge>} />
        <MetricTile label="OI USD estimate" value={<MetricValue metric={overview.metrics.totalOpenInterestUsdEstimate} format={(value) => formatUsdValue(value, { compact: true })} />} source={<StatusBadge tone={overview.metrics.totalOpenInterestUsdEstimate.estimated ? "warning" : "neutral"}>{overview.metrics.totalOpenInterestUsdEstimate.estimated ? "Estimated" : "REST"}</StatusBadge>} />
        <MetricTile label="TVL" value={<MetricValue metric={overview.metrics.totalTvl} format={(value) => formatUsdValue(value, { compact: true })} />} source={<StatusBadge tone={toneForStatus(overview.metrics.totalTvl.status)}>{overview.metrics.totalTvl.status}</StatusBadge>} />
        <MetricTile label="Open markets" value={<MetricValue metric={overview.metrics.openMarkets} format={(value) => `${value}/${overview.metrics.totalMarkets.value ?? "-"}`} />} source={<StatusBadge tone="success">REST</StatusBadge>} />
        <MetricTile label="Avg funding" value={<MetricValue metric={overview.fundingOverview.averageFundingRateRaw} format={(value) => formatBps(value / 100)} />} source={<StatusBadge tone={toneForStatus(overview.fundingOverview.averageFundingRateRaw.status)}>{overview.fundingOverview.averageFundingRateRaw.status}</StatusBadge>} />
        <MetricTile label="Failed markets" value={overview.failedMarkets.length} tone={overview.failedMarkets.length > 0 ? "warning" : "success"} source={<StatusBadge tone={overview.failedMarkets.length > 0 ? "warning" : "success"}>{overview.failedMarkets.length > 0 ? "Partial" : "Clean"}</StatusBadge>} />
      </div>
    </Panel>
  );
}

function AggregateVolumeChart({ overview, period, volumeMetric, realtimeMode, className = "" }: { overview: ProtocolOverview; period: AnalyticsPeriod; volumeMetric: ReturnType<typeof selectedVolumeMetric>; realtimeMode: string; className?: string }) {
  return (
    <ChartContainer
      title={`${period} aggregate volume`}
      description="Daily and cumulative volume for the selected Perpl market set."
      value={<MetricValue metric={volumeMetric} format={(value) => formatUsdValue(value, { compact: true })} />}
      series={overview.series.aggregateVolumeSeries}
      status={<StatusBadge tone={toneForStatus(volumeMetric?.status ?? "unavailable")}>{volumeMetric?.status ?? "unavailable"}</StatusBadge>}
      footer={<div className="flex flex-wrap items-center gap-2"><Database className="h-3.5 w-3.5" aria-hidden="true" /> Source: Perpl REST analytics <span className="text-terminal-subtle">/</span> Realtime mode: {realtimeMode}</div>}
      className={className}
    />
  );
}

function DataQualityPanel({
  overview,
  availabilityItems,
  realtimeMode,
  availabilityCalculatedAt,
  realtimeError,
  compact = false
}: {
  overview: ProtocolOverview;
  availabilityItems: DataAvailabilityItem[];
  realtimeMode: string;
  availabilityCalculatedAt?: string;
  realtimeError?: string | null;
  compact?: boolean;
}) {
  const items = compact ? availabilityItems.slice(0, 5) : availabilityItems;
  return (
    <Panel title="Data quality" description={`Calculated ${formatUtc(availabilityCalculatedAt ?? overview.calculatedAt)}`} actions={<StatusBadge tone={realtimeMode === "websocket" ? "live" : realtimeMode === "unavailable" ? "danger" : "neutral"}>{realtimeMode}</StatusBadge>}>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={`${item.scope}-${item.metric}`} className="flex items-start justify-between gap-3 border-b border-terminal-line pb-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-terminal-text">{item.metric}</p>
              <p className="text-xs leading-5 text-terminal-muted">{item.reason}</p>
            </div>
            <StatusPill status={item.status} />
          </div>
        ))}
      </div>
      {compact && availabilityItems.length > items.length ? <p className="mt-3 text-xs text-terminal-subtle">{availabilityItems.length - items.length} more checks in Data Quality tab.</p> : null}
      {realtimeError ? <p className="mt-3 text-xs text-signal-warn">Realtime note: {realtimeError}</p> : null}
    </Panel>
  );
}

function FailedMarketsPanel({ failedMarkets, expanded = false }: { failedMarkets: ProtocolOverview["failedMarkets"]; expanded?: boolean }) {
  if (failedMarkets.length === 0) {
    return expanded ? (
      <Panel tone="success" title="Failed markets">
        <p className="text-sm text-terminal-muted">No failed markets in the current overview response.</p>
      </Panel>
    ) : null;
  }

  return (
    <Panel tone="warning" title="Failed / partial markets" description={`${failedMarkets.length} market${failedMarkets.length === 1 ? "" : "s"} returned partial analytics.`}>
      <div className="grid gap-2 md:grid-cols-2">
        {failedMarkets.map((market) => (
          <div key={market.marketId} className="rounded-md border border-signal-warn/25 bg-terminal-panel/40 p-3 text-sm">
            <p className="font-semibold text-terminal-text">{market.symbol}</p>
            <p className="mt-1 text-xs leading-5 text-signal-warn">{market.reason}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MarketActivityPanel({
  rows,
  sortKey,
  setSortKey,
  period,
  detailsById,
  realtime,
  title,
  description
}: {
  rows: MarketRanking[];
  sortKey: keyof MarketRanking;
  setSortKey: (key: keyof MarketRanking) => void;
  period: AnalyticsPeriod;
  detailsById: Map<number, MarketAnalytics>;
  realtime: ReturnType<typeof usePerplRealtime>;
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-terminal-text">{title}</h2>
          <p className="mt-1 text-xs text-terminal-muted">{description}</p>
        </div>
        <p className="text-xs text-terminal-subtle">{rows.length} markets / click headers to sort</p>
      </div>
      <DataTable columns={columns(sortKey, setSortKey, period, detailsById, realtime.tickers)} rows={rows} getRowKey={(row) => String(row.marketId)} dense stickyHeader />
    </section>
  );
}

function TopMarketsList({ title, rows, period, metric }: { title: string; rows: MarketRanking[]; period: AnalyticsPeriod; metric: "volume" }) {
  return (
    <Panel title={title} description="Highest activity markets for the selected timeframe.">
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.marketId} className="flex items-center justify-between gap-3 rounded-md border border-terminal-line bg-terminal-raised/45 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-terminal-text">{index + 1}. {row.symbol}</p>
              <Link className="text-xs text-signal-live hover:underline" href={`/markets/${row.marketId}`}>Open market</Link>
            </div>
            <p className="font-mono text-sm font-semibold tabular-nums text-terminal-text">{metric === "volume" ? formatUsdValue(row[period === "24h" ? "volume24h" : period === "7d" ? "volume7d" : "volume30d"], { compact: true }) : "Unavailable"}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ContextMetric({ label, value, status }: { label: string; value: string; status: string }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/45 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-terminal-muted">{label}</p>
        <StatusPill status={status} />
      </div>
      <p className="mt-2 break-words font-mono text-sm font-semibold text-terminal-text">{value}</p>
    </div>
  );
}

function selectedVolumeMetric(overview: ProtocolOverview | undefined, period: AnalyticsPeriod) {
  if (!overview) return undefined;
  if (period === "24h") return overview.metrics.totalVolume24h;
  if (period === "7d") return overview.metrics.totalVolume7d;
  return overview.metrics.totalVolume30d;
}

function columns(
  sortKey: keyof MarketRanking,
  setSortKey: (key: keyof MarketRanking) => void,
  period: AnalyticsPeriod,
  detailsById: Map<number, MarketAnalytics>,
  liveTickers: ReturnType<typeof usePerplRealtime>["tickers"]
): Column<MarketRanking>[] {
  const volumeKey = period === "24h" ? "volume24h" : period === "7d" ? "volume7d" : "volume30d";
  const sortable = (key: keyof MarketRanking, label: string) => (
    <button type="button" onClick={() => setSortKey(key)} className="inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-signal-live" aria-label={`Sort by ${label}`}>
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === key ? "text-signal-live" : "text-terminal-subtle"}`} aria-hidden="true" />
    </button>
  );
  return [
    { key: "market", header: "Market", render: (row) => <Link className="font-semibold text-signal-live hover:underline" href={`/markets/${row.marketId}`}>{row.symbol}</Link> },
    { key: "mark", header: "Mark", align: "right", render: (row) => <LiveValue value={formatUsdValue(liveTickers[row.marketId]?.values.markPrice ?? detailsById.get(row.marketId)?.current.markPrice)} live={Boolean(liveTickers[row.marketId])} /> },
    { key: "price", header: sortable("priceChangePercent", "Price change"), align: "right", render: (row) => <span className={signedClass(row.priceChangePercent)}>{formatPercent(row.priceChangePercent, { signed: true })}</span> },
    { key: "volume", header: sortable(volumeKey, "Volume"), align: "right", render: (row) => formatUsdValue(row[volumeKey], { compact: true }) },
    { key: "oi", header: sortable("openInterestUsdEstimate", "OI estimate"), align: "right", render: (row) => `Est. ${formatUsdValue(row.openInterestUsdEstimate, { compact: true })}` },
    { key: "funding", header: sortable("absoluteFundingRate", "Funding"), align: "right", render: (row) => row.absoluteFundingRate === null ? <span className="text-terminal-subtle">Unavailable</span> : formatBps(row.absoluteFundingRate / 100) },
    { key: "spread", header: sortable("spreadBps", "Spread"), align: "right", render: (row) => formatBps(row.spreadBps) },
    { key: "status", header: "Status", align: "center", render: () => <StatusPill status="available" /> }
  ];
}

function LiveValue({ value, live }: { value: string; live: boolean }) {
  return <span className={live ? "rounded bg-signal-live/10 px-1.5 py-0.5 text-signal-live transition-colors motion-reduce:transition-none" : value === "Unavailable" ? "text-terminal-subtle" : ""}>{value}</span>;
}

function compareNullable(a: string | number | null, b: string | number | null) {
  const na = toFiniteNumber(a);
  const nb = toFiniteNumber(b);
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return na - nb;
}
