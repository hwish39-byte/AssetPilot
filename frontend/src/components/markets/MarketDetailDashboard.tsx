"use client";

import { useState } from "react";
import { ChartContainer } from "@/components/shared/ChartContainer";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { MetricValue, StatusPill } from "@/components/shared/MetricValue";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { RealtimeStatusBadge } from "@/components/shared/RealtimeStatusBadge";
import { usePerplMarket, usePerplMarketHistory } from "@/hooks/usePerplMarkets";
import { usePerplMarketStream } from "@/hooks/usePerplRealtime";
import { formatBps, formatPercent, formatToken, formatUsdValue, formatUtc, signedClass } from "@/lib/format";
import type { AnalyticsHistoryMetric, AnalyticsPeriod } from "@/types/perpl";

export function MarketDetailDashboard({ marketId }: { marketId: number }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("24h");
  const [metric, setMetric] = useState<AnalyticsHistoryMetric>("price");
  const market = usePerplMarket(marketId, period);
  const history = usePerplMarketHistory(marketId, period, metric);
  const realtime = usePerplMarketStream(marketId);
  const liveTicker = realtime.tickers[marketId];
  const liveBook = realtime.orderbooks[marketId];

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{market.data?.symbol ?? `Market ${marketId}`}</h1>
          <p className="mt-1 text-sm text-slate-600">{market.data?.name ?? "Perpl market detail"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeStatusBadge status={realtime.status} />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </section>

      {market.isLoading ? <LoadingSkeleton rows={4} /> : null}
      {market.error ? <ErrorState error={market.error} onRetry={() => market.refetch()} title="Market request failed" /> : null}

      {market.data ? (
        <>
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{market.data.symbol}</h2>
                  <StatusPill status={market.data.isOpen ? "available" : "stale"} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Updated {formatUtc(liveTicker?.updatedAt ?? market.data.current.absoluteSpread.asOf)}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-5">
                <HeaderMetric label="Mark" value={formatUsdValue(liveTicker?.values.markPrice ?? market.data.current.markPrice)} className={liveTicker ? "text-emerald-800" : ""} />
                <HeaderMetric label="Oracle" value={formatUsdValue(liveTicker?.values.oraclePrice ?? market.data.current.oraclePrice)} />
                <HeaderMetric label="Spread" value={formatBps(market.data.current.spreadBps.value)} />
                <HeaderMetric label="Funding" value={market.data.funding.fundingRateRaw.value === null ? "Unavailable" : formatBps(market.data.funding.fundingRateRaw.value / 100)} />
                <HeaderMetric label="OI Est." value={formatUsdValue(market.data.openInterest.openInterestUsdEstimate.value, { compact: true, estimated: true })} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
              {(["price", "volume", "funding"] as AnalyticsHistoryMetric[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMetric(item)}
                  className={`rounded px-3 py-1.5 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-cyan-600 ${metric === item ? "bg-slate-900 text-white" : "text-slate-600"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            {history.isLoading ? <LoadingSkeleton rows={3} /> : null}
            {history.error ? <ErrorState error={history.error} onRetry={() => history.refetch()} title="History request failed" /> : null}
            {history.data ? <ChartContainer title={`${market.data.symbol} ${metric}`} series={history.data.series} color={metric === "funding" ? "#d97706" : "#0891b2"} /> : null}
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[1fr_0.8fr]">
            <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Order book</h2>
              {liveBook || market.data.orderBook ? (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                  <HeaderMetric label="Best bid" value={formatUsdValue(liveBook?.bids[0]?.price ?? market.data.orderBook?.bestBid)} className={liveBook ? "text-emerald-800" : ""} />
                  <HeaderMetric label="Best ask" value={formatUsdValue(liveBook?.asks[0]?.price ?? market.data.orderBook?.bestAsk)} className={liveBook ? "text-emerald-800" : ""} />
                  <HeaderMetric label="Spread bps" value={market.data.orderBook ? formatBps(market.data.orderBook.spreadBps.value) : "Live"} />
                  <HeaderMetric label="Bid depth" value={market.data.orderBook ? formatToken(market.data.orderBook.bidDepth.value, market.data.sizeUnits) : formatToken(liveBook?.bids[0]?.size, market.data.sizeUnits)} />
                  <HeaderMetric label="Ask depth" value={market.data.orderBook ? formatToken(market.data.orderBook.askDepth.value, market.data.sizeUnits) : formatToken(liveBook?.asks[0]?.size, market.data.sizeUnits)} />
                  <HeaderMetric label="Imbalance" value={market.data.orderBook ? formatPercent(market.data.orderBook.orderBookImbalance.value, { signed: true }) : "REST fallback"} className={signedClass(market.data.orderBook?.orderBookImbalance.value)} />
                  <HeaderMetric label="10 bps depth" value={formatDepth(market.data.orderBook?.depthWithin10Bps.value ?? null)} />
                  <HeaderMetric label="50 bps depth" value={formatDepth(market.data.orderBook?.depthWithin50Bps.value ?? null)} />
                  <HeaderMetric label="100 bps depth" value={formatDepth(market.data.orderBook?.depthWithin100Bps.value ?? null)} />
                </dl>
              ) : (
                <p className="mt-3 text-sm text-slate-600">Order book unavailable for this market.</p>
              )}
            </div>

            <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Metric methodology</h2>
              <DataTable
                rows={[
                  market.data.openInterest.openInterestUsdEstimate,
                  market.data.tvl.marketTvl,
                  market.data.current.spreadBps,
                  market.data.funding.fundingRateNormalized,
                  market.data.volume.selectedPeriodVolume
                ]}
                getRowKey={(row) => row.methodology}
                columns={[
                  { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
                  { key: "source", header: "Source", render: (row) => row.source ?? "Unavailable" },
                  { key: "method", header: "Method", render: (row) => <span title={row.reason}>{row.estimated ? "Estimated: " : ""}{row.methodology}</span> }
                ]}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function HeaderMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-mono text-sm font-semibold text-slate-950 ${className}`}>{value}</dd>
    </div>
  );
}

function formatDepth(value: { bid: string; ask: string } | null) {
  if (!value) return "Unavailable";
  return `Bid ${formatToken(value.bid)} / Ask ${formatToken(value.ask)}`;
}
