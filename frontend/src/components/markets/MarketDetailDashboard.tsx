"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BarChart3, BookOpen, CircleDollarSign, Database, Radio } from "lucide-react";
import { ChartContainer } from "@/components/shared/ChartContainer";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { RealtimeStatusBadge } from "@/components/shared/RealtimeStatusBadge";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { usePerplMarket, usePerplMarketHistory } from "@/hooks/usePerplMarkets";
import { usePerplMarketStream } from "@/hooks/usePerplRealtime";
import { formatBps, formatPercent, formatToken, formatUsdValue, formatUtc, toFiniteNumber } from "@/lib/format";
import type { AnalyticsHistoryMetric, AnalyticsMetric, AnalyticsPeriod, MarketAnalytics, OrderBookAnalytics, PerplOrderBookState, PerplTickerState, TimeSeriesPoint } from "@/types/perpl";

const metricTabs: AnalyticsHistoryMetric[] = ["price", "volume", "funding"];

export function MarketDetailDashboard({ marketId }: { marketId: number }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("24h");
  const [metric, setMetric] = useState<AnalyticsHistoryMetric>("price");
  const validMarketId = Number.isInteger(marketId) && marketId > 0;
  const market = usePerplMarket(marketId, period);
  const history = usePerplMarketHistory(marketId, period, metric);
  const realtime = usePerplMarketStream(marketId);
  const liveTicker = realtime.tickers[marketId];
  const liveBook = realtime.orderbooks[marketId];

  if (!validMarketId) {
    return (
      <div className="space-y-5">
        <MarketHeaderBar marketId={marketId} period={period} onPeriodChange={setPeriod} realtimeStatus={realtime.status} />
        <EmptyState title="Market request failed" description="This market route does not include a valid Perpl market id." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MarketHeaderBar marketId={marketId} market={market.data} period={period} onPeriodChange={setPeriod} realtimeStatus={realtime.status} liveTicker={liveTicker} />

      {market.isLoading ? <LoadingSkeleton rows={4} /> : null}
      {market.error ? <ErrorState error={market.error} onRetry={() => market.refetch()} title="Market request failed" /> : null}

      {market.data ? (
        <>
          <MarketMetricGrid market={market.data} period={period} liveTicker={liveTicker} liveBook={liveBook} lastEventAt={realtime.lastEventAt} />

          <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
            <MarketChartPanel market={market.data} metric={metric} setMetric={setMetric} history={history.data?.series ?? []} loading={history.isLoading} error={history.error} onRetry={() => history.refetch()} />
            <OrderBookPanel market={market.data} liveBook={liveBook} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <DataSourcePanel market={market.data} liveTicker={liveTicker} liveBook={liveBook} realtimeError={realtime.error} />
            <MethodologyCards market={market.data} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function MarketHeaderBar({
  marketId,
  market,
  period,
  onPeriodChange,
  realtimeStatus,
  liveTicker
}: {
  marketId: number;
  market?: MarketAnalytics;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  realtimeStatus: ReturnType<typeof usePerplMarketStream>["status"];
  liveTicker?: PerplTickerState;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/markets" className="inline-flex min-h-8 items-center gap-2 rounded-md border border-terminal-line bg-terminal-raised/45 px-2.5 py-1.5 text-xs font-semibold text-terminal-muted transition hover:border-signal-live/40 hover:text-signal-live focus:outline-none focus:ring-2 focus:ring-signal-live">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Markets
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-terminal-text">{market?.symbol ?? `Market ${marketId}`}</h1>
            <StatusBadge tone={market?.isOpen ? "success" : market ? "warning" : "neutral"}>{market?.isOpen ? "open" : market ? "closed" : "loading"}</StatusBadge>
            <StatusBadge tone={liveTicker ? "live" : "neutral"}>{liveTicker ? "Live ticker" : "REST detail"}</StatusBadge>
          </div>
          <p className="mt-1 text-sm text-terminal-muted">{market?.name ?? "Perpl market detail"}</p>
          <p className="mt-2 font-mono text-xs text-terminal-subtle">marketId={marketId}</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <RealtimeStatusBadge status={realtimeStatus} />
          <PeriodSelector value={period} onChange={onPeriodChange} />
        </div>
      </div>
    </Panel>
  );
}

function MarketMetricGrid({ market, period, liveTicker, liveBook, lastEventAt }: { market: MarketAnalytics; period: AnalyticsPeriod; liveTicker?: PerplTickerState; liveBook?: PerplOrderBookState; lastEventAt: string | null }) {
  const liveSpread = spreadBpsFromBook(liveBook);
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Mark price" value={formatUsdValue(liveTicker?.values.markPrice ?? market.current.markPrice)} tone={liveTicker ? "live" : "default"} source={liveTicker ? <LiveSource /> : "REST"} />
      <MetricTile label="Oracle price" value={formatUsdValue(liveTicker?.values.oraclePrice ?? market.current.oraclePrice)} tone={liveTicker ? "live" : "default"} source={liveTicker ? <LiveSource /> : "REST"} />
      <MetricTile label="Spread" value={liveSpread !== null ? formatBps(liveSpread) : formatBps(market.current.spreadBps.value)} tone={liveBook ? "live" : metricTone(market.current.spreadBps.status, market.current.spreadBps.estimated)} source={liveBook ? <LiveSource /> : sourceLabel(market.current.spreadBps)} />
      <MetricTile label="Funding" value={market.funding.fundingRateRaw.value === null ? "Unavailable" : formatBps(market.funding.fundingRateRaw.value / 100)} tone="warning" source={sourceLabel(market.funding.fundingRateRaw)} />
      <MetricTile label="OI estimate" value={formatUsdValue(market.openInterest.openInterestUsdEstimate.value, { compact: true, estimated: true })} tone={market.openInterest.openInterestUsdEstimate.estimated ? "warning" : metricTone(market.openInterest.openInterestUsdEstimate.status)} source={sourceLabel(market.openInterest.openInterestUsdEstimate)} />
      <MetricTile label="TVL" value={formatUsdValue(market.tvl.marketTvl.value, { compact: true, estimated: market.tvl.marketTvl.estimated })} tone={metricTone(market.tvl.marketTvl.status, market.tvl.marketTvl.estimated)} source={sourceLabel(market.tvl.marketTvl)} />
      <MetricTile label={`${period} volume`} value={formatUsdValue(selectedVolume(market, period), { compact: true })} tone={metricTone(market.volume.selectedPeriodVolume.status, market.volume.selectedPeriodVolume.estimated)} source={sourceLabel(market.volume.selectedPeriodVolume)} />
      <MetricTile label="Data freshness" value={formatUtc(liveTicker?.updatedAt ?? lastEventAt ?? market.current.absoluteSpread.asOf ?? market.volume.selectedPeriodVolume.asOf)} helper={liveTicker ? "Live ticker priority" : "REST market detail"} tone={liveTicker ? "live" : "default"} />
    </section>
  );
}

function MarketChartPanel({
  market,
  metric,
  setMetric,
  history,
  loading,
  error,
  onRetry
}: {
  market: MarketAnalytics;
  metric: AnalyticsHistoryMetric;
  setMetric: (metric: AnalyticsHistoryMetric) => void;
  history: TimeSeriesPoint[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const title = `${market.symbol} ${metric}`;
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Market chart
        </span>
      }
      description="Switch price, volume, and funding history for the selected period."
      actions={<MetricSegment value={metric} onChange={setMetric} />}
      className="min-w-0"
    >
      {loading ? <LoadingSkeleton rows={6} /> : null}
      {error ? <ErrorState error={error} onRetry={onRetry} title="History request failed" /> : null}
      {!loading && !error ? (
        <ChartContainer
          title={title}
          description={chartDescription(metric)}
          series={history}
          color={chartColor(metric)}
          status={<StatusBadge tone={metric === "funding" ? "warning" : "live"}>{metric}</StatusBadge>}
          value={chartValue(market, metric)}
          footer={`History uses Perpl ${metric} points returned by the analytics API; unavailable points are not fabricated.`}
        />
      ) : null}
    </Panel>
  );
}

function MetricSegment({ value, onChange }: { value: AnalyticsHistoryMetric; onChange: (metric: AnalyticsHistoryMetric) => void }) {
  return (
    <div className="inline-flex rounded-md border border-terminal-line bg-terminal-panel p-0.5">
      {metricTabs.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded px-3 py-1.5 text-sm capitalize transition focus:outline-none focus:ring-2 focus:ring-signal-live ${value === item ? "bg-signal-live/15 text-signal-live" : "text-terminal-muted hover:bg-terminal-raised hover:text-terminal-text"}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function OrderBookPanel({ market, liveBook }: { market: MarketAnalytics; liveBook?: PerplOrderBookState }) {
  const book = market.orderBook;
  const hasBook = Boolean(liveBook || book);
  const liveSpread = spreadBpsFromBook(liveBook);

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Order book / liquidity
        </span>
      }
      description="Top-of-book and depth metrics. Live stream is used when available."
      actions={<StatusBadge tone={liveBook ? "live" : book ? "neutral" : "warning"}>{liveBook ? "Live WS" : book ? "REST snapshot" : "Unavailable"}</StatusBadge>}
      className="min-w-0"
    >
      {!hasBook ? <EmptyState title="Order book unavailable" description="This market has no usable live book or REST order book snapshot." /> : null}
      {hasBook ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <LiquidityMetric label="Best bid" value={formatUsdValue(liveBook?.bids[0]?.price ?? book?.bestBid)} tone="bid" source={liveBook ? "Live WS" : "REST"} />
            <LiquidityMetric label="Best ask" value={formatUsdValue(liveBook?.asks[0]?.price ?? book?.bestAsk)} tone="ask" source={liveBook ? "Live WS" : "REST"} />
            <LiquidityMetric label="Spread bps" value={liveSpread !== null ? formatBps(liveSpread) : formatBps(book?.spreadBps.value)} source={liveSpread !== null ? "Computed live" : book ? "REST" : "Unavailable"} />
          </div>

          <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Depth</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DepthDatum label="Bid depth" value={book ? formatToken(book.bidDepth.value, market.sizeUnits) : formatToken(liveBook?.bids[0]?.size, market.sizeUnits)} tone="bid" />
              <DepthDatum label="Ask depth" value={book ? formatToken(book.askDepth.value, market.sizeUnits) : formatToken(liveBook?.asks[0]?.size, market.sizeUnits)} tone="ask" />
              <DepthDatum label="10 bps depth" value={formatDepth(book?.depthWithin10Bps.value ?? null, market.sizeUnits)} />
              <DepthDatum label="50 bps depth" value={formatDepth(book?.depthWithin50Bps.value ?? null, market.sizeUnits)} />
              <DepthDatum label="100 bps depth" value={formatDepth(book?.depthWithin100Bps.value ?? null, market.sizeUnits)} />
              <DepthDatum label="Sampled levels" value={book ? `${book.sampledLevels.bid} bid / ${book.sampledLevels.ask} ask` : liveBook ? `${liveBook.bids.length} bid / ${liveBook.asks.length} ask` : "Unavailable"} />
            </div>
          </div>

          <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Imbalance</p>
              <StatusBadge tone={imbalanceTone(book?.orderBookImbalance.value)}>{imbalanceLabel(book?.orderBookImbalance.value)}</StatusBadge>
            </div>
            <p className={`mt-2 font-mono text-lg font-semibold tabular-nums ${imbalanceClass(book?.orderBookImbalance.value)}`}>
              {formatPercent(book?.orderBookImbalance.value, { signed: true })}
            </p>
            <p className="mt-1 text-xs text-terminal-muted">Positive leans bid-side; negative leans ask-side. Live book depth is not expanded into synthetic depth buckets.</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function DataSourcePanel({ market, liveTicker, liveBook, realtimeError }: { market: MarketAnalytics; liveTicker?: PerplTickerState; liveBook?: PerplOrderBookState; realtimeError: string | null }) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Database className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Data source
        </span>
      }
      description="Live websocket values take priority where available; REST analytics remain the fallback."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <SourceCard label="Ticker" value={liveTicker ? "WebSocket" : "REST fallback"} tone={liveTicker ? "live" : "neutral"} detail={liveTicker ? `Updated ${formatUtc(liveTicker.updatedAt)}` : "Using REST market detail values"} />
        <SourceCard label="Order book" value={liveBook ? "WebSocket" : market.orderBook ? "REST snapshot" : "Unavailable"} tone={liveBook ? "live" : market.orderBook ? "neutral" : "warning"} detail={liveBook ? `${liveBook.bids.length} bids / ${liveBook.asks.length} asks` : market.orderBook ? `${market.orderBook.sampledLevels.requested} requested levels` : "No book data returned"} />
        <SourceCard label="Open interest" value={market.openInterest.openInterestUsdEstimate.estimated ? "Estimated" : market.openInterest.openInterestUsdEstimate.source ?? "Unavailable"} tone={market.openInterest.openInterestUsdEstimate.estimated ? "warning" : statusTone(market.openInterest.openInterestUsdEstimate.status)} detail={market.openInterest.openInterestUsdEstimate.methodology} />
        <SourceCard label="Volume" value={market.volume.selectedPeriodVolume.source ?? "Fallback"} tone={statusTone(market.volume.selectedPeriodVolume.status, market.volume.selectedPeriodVolume.estimated)} detail={market.volume.selectedPeriodVolume.methodology} />
      </div>
      {realtimeError ? <p className="mt-3 rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-xs text-signal-warn">{realtimeError}</p> : null}
    </Panel>
  );
}

function MethodologyCards({ market }: { market: MarketAnalytics }) {
  const rows = [
    { label: "Open interest estimate", metric: market.openInterest.openInterestUsdEstimate },
    { label: "TVL", metric: market.tvl.marketTvl },
    { label: "Spread", metric: market.current.spreadBps },
    { label: "Funding normalized", metric: market.funding.fundingRateNormalized },
    { label: "Selected period volume", metric: market.volume.selectedPeriodVolume }
  ];
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Methodology
        </span>
      }
      description="Metric status, source, estimate flag, and calculation notes."
      className="min-w-0"
    >
      <div className="grid gap-3">
        {rows.map((row) => <MethodologyCard key={row.label} label={row.label} metric={row.metric} />)}
      </div>
    </Panel>
  );
}

function MethodologyCard({ label, metric }: { label: string; metric: AnalyticsMetric<unknown> }) {
  const tone = statusTone(metric.status, metric.estimated);
  return (
    <article className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-terminal-text">{label}</h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={tone}>{metric.status}</StatusBadge>
          {metric.estimated ? <StatusBadge tone="warning">Estimated</StatusBadge> : null}
        </div>
      </div>
      <div className="mt-2 grid gap-2 text-xs text-terminal-muted sm:grid-cols-[112px_minmax(0,1fr)]">
        <span className="font-semibold uppercase tracking-wide text-terminal-subtle">Source</span>
        <span className="break-words">{metric.source ?? "Unavailable"}</span>
        <span className="font-semibold uppercase tracking-wide text-terminal-subtle">Method</span>
        <span className="break-words" title={metric.reason}>{metric.methodology}</span>
        {metric.reason ? (
          <>
            <span className="font-semibold uppercase tracking-wide text-terminal-subtle">Reason</span>
            <span className="break-words">{metric.reason}</span>
          </>
        ) : null}
      </div>
    </article>
  );
}

function SourceCard({ label, value, tone, detail }: { label: string; value: string; tone: StatusTone; detail: string }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">{label}</p>
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
      <p className="mt-2 text-xs leading-5 text-terminal-muted">{detail}</p>
    </div>
  );
}

function LiquidityMetric({ label, value, tone, source }: { label: string; value: string; tone?: "bid" | "ask"; source?: string }) {
  const color = tone === "bid" ? "text-signal-pass" : tone === "ask" ? "text-signal-danger" : "text-terminal-text";
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">{label}</p>
        {source ? <span className="text-[11px] text-terminal-subtle">{source}</span> : null}
      </div>
      <p className={`mt-2 break-words font-mono text-base font-semibold tabular-nums ${value === "Unavailable" ? "text-terminal-subtle" : color}`}>{value}</p>
    </div>
  );
}

function DepthDatum({ label, value, tone }: { label: string; value: string; tone?: "bid" | "ask" }) {
  const color = tone === "bid" ? "text-signal-pass" : tone === "ask" ? "text-signal-danger" : "text-terminal-text";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-terminal-subtle">{label}</p>
      <p className={`mt-1 break-words font-mono text-sm font-semibold tabular-nums ${value === "Unavailable" ? "text-terminal-subtle" : color}`}>{value}</p>
    </div>
  );
}

function LiveSource() {
  return (
    <span className="inline-flex items-center gap-1 text-signal-live">
      <span className="h-1.5 w-1.5 rounded-full bg-signal-live" aria-hidden="true" />
      Live
    </span>
  );
}

function chartDescription(metric: AnalyticsHistoryMetric) {
  if (metric === "price") return "Mark/oracle price context for the selected period.";
  if (metric === "volume") return "Trading activity across the selected period.";
  return "Funding rate history where available.";
}

function chartColor(metric: AnalyticsHistoryMetric) {
  if (metric === "price") return "#22d3ee";
  if (metric === "volume") return "#34d399";
  return "#f59e0b";
}

function chartValue(market: MarketAnalytics, metric: AnalyticsHistoryMetric) {
  if (metric === "price") return formatUsdValue(market.current.markPrice ?? market.current.oraclePrice);
  if (metric === "volume") return formatUsdValue(market.volume.selectedPeriodVolume.value, { compact: true });
  return market.funding.fundingRateRaw.value === null ? "Unavailable" : formatBps(market.funding.fundingRateRaw.value / 100);
}

function selectedVolume(market: MarketAnalytics, period: AnalyticsPeriod) {
  if (period === "24h") return market.volume.volume24h.value;
  if (period === "7d") return market.volume.volume7d.value;
  return market.volume.volume30d.value;
}

function formatDepth(value: { bid: string; ask: string } | null, unit: string) {
  if (!value) return "Unavailable";
  return `Bid ${formatToken(value.bid, unit)} / Ask ${formatToken(value.ask, unit)}`;
}

function spreadBpsFromBook(book?: PerplOrderBookState) {
  const bid = toFiniteNumber(book?.bids[0]?.price);
  const ask = toFiniteNumber(book?.asks[0]?.price);
  if (bid === null || ask === null) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return ((ask - bid) / mid) * 10_000;
}

function sourceLabel<T>(metric: AnalyticsMetric<T>) {
  if (metric.estimated) return <span className="text-signal-warn">Estimated</span>;
  return metric.source ?? "Fallback";
}

function statusTone(status: string | undefined, estimated = false): StatusTone {
  if (estimated || status === "partial" || status === "stale") return "warning";
  if (status === "available") return "success";
  if (status === "unavailable") return "danger";
  return "neutral";
}

function metricTone(status: string | undefined, estimated = false): "default" | "live" | "success" | "warning" | "danger" {
  const tone = statusTone(status, estimated);
  return tone === "neutral" ? "default" : tone;
}

function imbalanceClass(value: number | null | undefined) {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric === 0) return "text-terminal-muted";
  return numeric > 0 ? "text-signal-pass" : "text-signal-danger";
}

function imbalanceTone(value: number | null | undefined): StatusTone {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric === 0) return "neutral";
  return numeric > 0 ? "success" : "danger";
}

function imbalanceLabel(value: number | null | undefined) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "unavailable";
  if (numeric > 0) return "bid-side";
  if (numeric < 0) return "ask-side";
  return "neutral";
}
