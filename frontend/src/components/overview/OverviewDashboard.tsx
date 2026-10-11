"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import { ChartContainer } from "@/components/shared/ChartContainer";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { MetricValue, StatusPill } from "@/components/shared/MetricValue";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { RealtimeStatusBadge } from "@/components/shared/RealtimeStatusBadge";
import { RiskRail } from "@/components/risk/RiskRail";
import { perplApi, shouldRetryApi } from "@/lib/api";
import { usePerplOverview } from "@/hooks/usePerplOverview";
import { usePerplRealtime } from "@/hooks/usePerplRealtime";
import { usePerplRisk } from "@/hooks/usePerplRisk";
import { queryKeys } from "@/lib/queryKeys";
import { formatBps, formatPercent, formatUsdValue, formatUtc, signedClass, toFiniteNumber } from "@/lib/format";
import type { AnalyticsPeriod, MarketAnalytics, MarketRanking } from "@/types/perpl";

export function OverviewDashboard() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("24h");
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

  const rows = [...(overview.data?.marketRankings ?? [])].sort((a, b) => compareNullable(b[sortKey], a[sortKey]));
  const volumeMetric = period === "24h" ? overview.data?.metrics.totalVolume24h : period === "7d" ? overview.data?.metrics.totalVolume7d : overview.data?.metrics.totalVolume30d;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perpl Overview</h1>
          <p className="mt-1 text-sm text-slate-600">Protocol status, market activity, and monitored wallet risk.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeStatusBadge status={realtime.status} />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </section>

      {overview.isLoading ? <LoadingSkeleton rows={4} /> : null}
      {overview.error ? <ErrorState error={overview.error} onRetry={() => overview.refetch()} title="Overview request failed" /> : null}

      {overview.data ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Protocol strip</h2>
                <span className="text-xs text-slate-500">Updated {formatUtc(overview.data.calculatedAt)} · {realtime.status?.mode === "websocket" ? "Live public stream" : "REST polling"}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <ProtocolMetric label={`${period} volume`}>
                  <MetricValue metric={volumeMetric} format={(value) => formatUsdValue(value, { compact: true })} />
                </ProtocolMetric>
                <ProtocolMetric label="OI USD estimate">
                  <MetricValue metric={overview.data.metrics.totalOpenInterestUsdEstimate} format={(value) => formatUsdValue(value, { compact: true })} />
                </ProtocolMetric>
                <ProtocolMetric label="TVL">
                  <MetricValue metric={overview.data.metrics.totalTvl} format={(value) => formatUsdValue(value, { compact: true })} />
                </ProtocolMetric>
                <ProtocolMetric label="Open markets">
                  <MetricValue metric={overview.data.metrics.openMarkets} format={(value) => `${value}/${overview.data?.metrics.totalMarkets.value ?? "—"}`} />
                </ProtocolMetric>
                <ProtocolMetric label="Avg funding">
                  <MetricValue metric={overview.data.fundingOverview.averageFundingRateRaw} format={(value) => formatBps(value / 100)} />
                </ProtocolMetric>
              </div>
            </div>
            <RiskRail risk={risk.data} error={risk.error} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
            <ChartContainer title={`${period} aggregate volume`} series={overview.data.series.aggregateVolumeSeries} />
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Data coverage</h2>
              <div className="mt-3 space-y-2">
                {(availability.data?.dataAvailability ?? overview.data.dataAvailability).map((item) => (
                  <div key={item.metric} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{item.metric}</p>
                      <p className="text-xs text-slate-500">{item.reason}</p>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {overview.data.failedMarkets.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Partial markets: {overview.data.failedMarkets.map((market) => `${market.symbol} (${market.reason})`).join(", ")}
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Market activity</h2>
              <p className="text-xs text-slate-500">{rows.length} markets</p>
            </div>
            <DataTable columns={columns(sortKey, setSortKey, period, detailsById, realtime.tickers)} rows={rows} getRowKey={(row) => String(row.marketId)} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function ProtocolMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{children}</p>
    </div>
  );
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
    <button type="button" onClick={() => setSortKey(key)} className="inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-600" aria-label={`Sort by ${label}`}>
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === key ? "text-slate-900" : "text-slate-400"}`} aria-hidden="true" />
    </button>
  );
  return [
    { key: "market", header: "Market", render: (row) => <Link className="font-semibold text-cyan-800 hover:underline" href={`/markets/${row.marketId}`}>{row.symbol}</Link> },
    { key: "mark", header: "Mark", align: "right", render: (row) => <LiveValue value={formatUsdValue(liveTickers[row.marketId]?.values.markPrice ?? detailsById.get(row.marketId)?.current.markPrice)} live={Boolean(liveTickers[row.marketId])} /> },
    { key: "price", header: sortable("priceChangePercent", "Price change"), align: "right", render: (row) => <span className={signedClass(row.priceChangePercent)}>{formatPercent(row.priceChangePercent, { signed: true })}</span> },
    { key: "volume", header: sortable(volumeKey, "Volume"), align: "right", render: (row) => formatUsdValue(row[volumeKey], { compact: true }) },
    { key: "oi", header: sortable("openInterestUsdEstimate", "OI estimate"), align: "right", render: (row) => `Est. ${formatUsdValue(row.openInterestUsdEstimate, { compact: true })}` },
    { key: "funding", header: sortable("absoluteFundingRate", "Funding"), align: "right", render: (row) => row.absoluteFundingRate === null ? "Unavailable" : formatBps(row.absoluteFundingRate / 100) },
    { key: "spread", header: sortable("spreadBps", "Spread"), align: "right", render: (row) => formatBps(row.spreadBps) },
    { key: "status", header: "Status", align: "center", render: () => <StatusPill status="available" /> }
  ];
}

function LiveValue({ value, live }: { value: string; live: boolean }) {
  return <span className={live ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 transition-colors motion-reduce:transition-none" : ""}>{value}</span>;
}

function compareNullable(a: string | number | null, b: string | number | null) {
  const na = toFiniteNumber(a);
  const nb = toFiniteNumber(b);
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return na - nb;
}
