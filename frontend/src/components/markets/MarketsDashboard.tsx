"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { RealtimeStatusBadge } from "@/components/shared/RealtimeStatusBadge";
import { StatusPill } from "@/components/shared/MetricValue";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePerplMarkets } from "@/hooks/usePerplMarkets";
import { usePerplRealtime } from "@/hooks/usePerplRealtime";
import { formatBps, formatPercent, formatUsdValue, signedClass, toFiniteNumber } from "@/lib/format";
import type { AnalyticsPeriod, MarketAnalytics } from "@/types/perpl";

type Filter = "all" | "open" | "closed";
type SortKey = "symbol" | "volume" | "oi" | "tvl" | "funding" | "spread" | "imbalance";
type QuickFilter = "highVolume" | "highOi" | "fundingExtreme" | "wideSpread" | "bookImbalance" | "liveWs";

const statusFilters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" }
];

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "volume", label: "Volume" },
  { value: "oi", label: "OI" },
  { value: "tvl", label: "TVL" },
  { value: "funding", label: "Funding" },
  { value: "spread", label: "Spread" },
  { value: "imbalance", label: "Imbalance" }
];

const quickFilters: Array<{ key: QuickFilter; label: string }> = [
  { key: "highVolume", label: "High volume" },
  { key: "highOi", label: "High OI" },
  { key: "fundingExtreme", label: "Funding extreme" },
  { key: "wideSpread", label: "Wide spread" },
  { key: "bookImbalance", label: "Book imbalance" },
  { key: "liveWs", label: "Live WS" }
];

export function MarketsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<AnalyticsPeriod>((searchParams.get("period") as AnalyticsPeriod) || "24h");
  const [filter, setFilter] = useState<Filter>((searchParams.get("filter") as Filter) || "all");
  const [sort, setSort] = useState<SortKey>((searchParams.get("sort") as SortKey) || "volume");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [activeQuickFilters, setActiveQuickFilters] = useState<QuickFilter[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const { overview, markets } = usePerplMarkets(period);
  const realtime = usePerplRealtime({ markets: (overview.data?.marketRankings ?? []).slice(0, 8).map((market) => market.marketId), channels: ["ticker", "funding", "orderbook", "heartbeat"] });

  const marketRows = markets.map((query) => query.data).filter((market): market is MarketAnalytics => Boolean(market));
  const loading = overview.isLoading || (overview.data && marketRows.length === 0 && markets.some((query) => query.isLoading));
  const errors = [overview.error, ...markets.map((query) => query.error)].filter(Boolean);
  const thresholds = useMemo(() => buildThresholds(marketRows, period), [marketRows, period]);

  const rows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return marketRows
      .filter((market) => (filter === "all" ? true : filter === "open" ? market.isOpen : !market.isOpen))
      .filter((market) => !lower || market.symbol.toLowerCase().includes(lower) || market.name.toLowerCase().includes(lower))
      .filter((market) => passesQuickFilters(market, activeQuickFilters, thresholds, realtime.tickers, period))
      .sort((a, b) => compare(sortValue(b, sort, period), sortValue(a, sort, period)) || a.symbol.localeCompare(b.symbol));
  }, [activeQuickFilters, filter, marketRows, period, query, realtime.tickers, sort, thresholds]);

  const selectedMarket = rows.find((market) => market.marketId === selectedMarketId) ?? marketRows.find((market) => market.marketId === selectedMarketId) ?? null;

  const syncUrl = (next: { period?: AnalyticsPeriod; filter?: Filter; sort?: SortKey; q?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.period) params.set("period", next.period);
    if (next.filter) params.set("filter", next.filter);
    if (next.sort) params.set("sort", next.sort);
    if (next.q !== undefined) next.q ? params.set("q", next.q) : params.delete("q");
    router.replace(`/markets?${params.toString()}`);
  };

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
    setSort("volume");
    setActiveQuickFilters([]);
    setSelectedMarketId(null);
    router.replace("/markets?sort=volume");
  };

  const toggleQuickFilter = (key: QuickFilter) => {
    setActiveQuickFilters((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market Screener</h1>
          <p className="mt-1 text-sm text-terminal-muted">Scan Perpl markets by liquidity, funding, spread, and live state.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeStatusBadge status={realtime.status} />
          <PeriodSelector value={period} onChange={(value) => { setPeriod(value); syncUrl({ period: value }); }} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactStat label="Total markets" value={overview.data?.metrics.totalMarkets.value ?? marketRows.length} />
        <CompactStat label="Visible markets" value={rows.length} />
        <CompactStat label="Failed / partial" value={overview.data?.failedMarkets.length ?? 0} tone={(overview.data?.failedMarkets.length ?? 0) > 0 ? "warning" : "default"} />
        <CompactStat label="Live streamed" value={Object.keys(realtime.tickers).length} tone={Object.keys(realtime.tickers).length > 0 ? "live" : "default"} />
      </section>

      <Panel>
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto_auto] xl:items-center">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-terminal-subtle" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); syncUrl({ q: event.target.value }); }}
              placeholder="Search symbol or market"
              className="w-full rounded-md border border-terminal-line bg-terminal-raised py-2 pl-9 pr-3 text-sm text-terminal-text placeholder:text-terminal-subtle focus:outline-none focus:ring-2 focus:ring-signal-live"
            />
          </label>
          <SegmentedFilter value={filter} onChange={(value) => { setFilter(value); syncUrl({ filter: value }); }} />
          <label className="flex min-w-48 items-center gap-2 rounded-md border border-terminal-line bg-terminal-raised px-3 py-2 text-sm text-terminal-muted">
            <SlidersHorizontal className="h-4 w-4 text-terminal-subtle" aria-hidden="true" />
            <span className="text-xs uppercase tracking-wide">Sort</span>
            <select
              value={sort}
              onChange={(event) => { const value = event.target.value as SortKey; setSort(value); syncUrl({ sort: value }); }}
              className="min-w-0 flex-1 bg-transparent text-terminal-text focus:outline-none"
            >
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickFilters.map((item) => {
            const active = activeQuickFilters.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleQuickFilter(item.key)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-signal-live ${
                  active ? "border-signal-live/40 bg-signal-live/15 text-signal-live" : "border-terminal-line bg-terminal-raised/60 text-terminal-muted hover:text-terminal-text"
                }`}
              >
                {item.label}
              </button>
            );
          })}
          {(query || filter !== "all" || activeQuickFilters.length > 0 || sort !== "volume") ? (
            <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
          ) : null}
        </div>
      </Panel>

      {loading ? <LoadingSkeleton rows={6} /> : null}
      {errors[0] ? <ErrorState error={errors[0]} onRetry={() => { overview.refetch(); markets.forEach((market) => market.refetch()); }} /> : null}

      {!loading && !errors[0] ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            {rows.length > 0 ? (
              <DataTable
                columns={marketColumns(sort, (key) => { setSort(key); syncUrl({ sort: key }); }, period, realtime.tickers)}
                rows={rows}
                getRowKey={(row) => String(row.marketId)}
                dense
                stickyHeader
                selectedRowKey={selectedMarketId === null ? null : String(selectedMarketId)}
                onRowClick={(row) => setSelectedMarketId(row.marketId)}
              />
            ) : (
              <Panel>
                <EmptyState title="No markets match this screener." description="Adjust search, status, or quick filters to broaden the market set." />
                <div className="mt-4">
                  <Button onClick={clearFilters} variant="primary">Clear filters</Button>
                </div>
              </Panel>
            )}
          </div>
          <MarketPreviewPanel market={selectedMarket} period={period} liveTicker={selectedMarket ? realtime.tickers[selectedMarket.marketId] : undefined} />
        </section>
      ) : null}
    </div>
  );
}

function CompactStat({ label, value, tone = "default" }: { label: string; value: string | number | null | undefined; tone?: "default" | "live" | "warning" }) {
  return <MetricTile label={label} value={value ?? "Unavailable"} tone={tone} className="p-2.5" />;
}

function SegmentedFilter({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div className="inline-flex rounded-md border border-terminal-line bg-terminal-panel p-0.5">
      {statusFilters.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal-live ${value === item.value ? "bg-signal-live/15 text-signal-live" : "text-terminal-muted hover:bg-terminal-raised"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function marketColumns(sort: SortKey, setSort: (key: SortKey) => void, period: AnalyticsPeriod, liveTickers: ReturnType<typeof usePerplRealtime>["tickers"]): Column<MarketAnalytics>[] {
  const sortable = (key: SortKey, label: string) => (
    <button type="button" onClick={(event) => { event.stopPropagation(); setSort(key); }} className="inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-signal-live">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sort === key ? "text-signal-live" : "text-terminal-subtle"}`} aria-hidden="true" />
    </button>
  );
  return [
    {
      key: "symbol",
      header: sortable("symbol", "Symbol / Name"),
      render: (row) => (
        <div className="min-w-44">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-terminal-text">{row.symbol}</span>
            {liveTickers[row.marketId] ? <span className="h-1.5 w-1.5 rounded-full bg-signal-live" aria-label="Live stream available" /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="max-w-36 truncate text-xs text-terminal-subtle">{row.name}</span>
            <Link onClick={(event) => event.stopPropagation()} className="text-xs font-semibold text-signal-live hover:underline" href={`/markets/${row.marketId}`}>
              Open detail
            </Link>
          </div>
        </div>
      )
    },
    { key: "mark", header: "Mark", align: "right", render: (row) => <LiveValue value={formatUsdValue(liveTickers[row.marketId]?.values.markPrice ?? row.current.markPrice)} live={Boolean(liveTickers[row.marketId])} /> },
    { key: "oracle", header: "Oracle", align: "right", render: (row) => formatUsdValue(liveTickers[row.marketId]?.values.oraclePrice ?? row.current.oraclePrice) },
    { key: "volume", header: sortable("volume", `${period} Volume`), align: "right", render: (row) => formatUsdValue(selectedVolume(row, period), { compact: true }) },
    { key: "oi", header: sortable("oi", "OI"), align: "right", render: (row) => formatUsdValue(row.openInterest.openInterestUsdEstimate.value, { compact: true, estimated: true }) },
    { key: "tvl", header: sortable("tvl", "TVL"), align: "right", render: (row) => formatUsdValue(row.tvl.marketTvl.value, { compact: true }) },
    { key: "funding", header: sortable("funding", "Funding"), align: "right", render: (row) => row.funding.fundingRateRaw.value === null ? <Muted>Unavailable</Muted> : <span className={signedClass(row.funding.fundingRateRaw.value)}>{formatBps(row.funding.fundingRateRaw.value / 100)}</span> },
    { key: "spread", header: sortable("spread", "Spread"), align: "right", render: (row) => formatBps(row.current.spreadBps.value) },
    { key: "imbalance", header: sortable("imbalance", "Book imbalance"), align: "right", render: (row) => <span className={signedClass(row.orderBook?.orderBookImbalance.value)}>{formatPercent(row.orderBook?.orderBookImbalance.value, { signed: true })}</span> },
    { key: "status", header: "Status", align: "center", render: (row) => <StatusPill status={row.isOpen ? "available" : "stale"} /> }
  ];
}

function MarketPreviewPanel({ market, period, liveTicker }: { market: MarketAnalytics | null; period: AnalyticsPeriod; liveTicker?: ReturnType<typeof usePerplRealtime>["tickers"][number] }) {
  if (!market) {
    return (
      <Panel className="xl:sticky xl:top-24 xl:self-start" title="Select a market" description="Preview mark, oracle, funding, spread, order book, and data status before opening the detail view.">
        <div className="rounded-md border border-dashed border-terminal-line bg-terminal-raised/40 p-6 text-sm text-terminal-muted">
          Click any screener row to inspect its live state.
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      className="xl:sticky xl:top-24 xl:self-start"
      title={<span className="flex items-center gap-2">{market.symbol}{liveTicker ? <span className="h-1.5 w-1.5 rounded-full bg-signal-live" /> : null}</span>}
      description={market.name}
      actions={<StatusPill status={market.isOpen ? "available" : "stale"} />}
    >
      <div className="grid gap-3">
        <MetricTile label="Mark price" value={formatUsdValue(liveTicker?.values.markPrice ?? market.current.markPrice)} tone={liveTicker ? "live" : "default"} helper={liveTicker ? "Live stream" : "REST"} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <PreviewMetric label="Oracle" value={formatUsdValue(liveTicker?.values.oraclePrice ?? market.current.oraclePrice)} />
          <PreviewMetric label={`${period} volume`} value={formatUsdValue(selectedVolume(market, period), { compact: true })} />
          <PreviewMetric label="OI estimate" value={formatUsdValue(market.openInterest.openInterestUsdEstimate.value, { compact: true, estimated: true })} />
          <PreviewMetric label="TVL" value={formatUsdValue(market.tvl.marketTvl.value, { compact: true })} />
          <PreviewMetric label="Funding" value={market.funding.fundingRateRaw.value === null ? "Unavailable" : formatBps(market.funding.fundingRateRaw.value / 100)} valueClassName={signedClass(market.funding.fundingRateRaw.value)} />
          <PreviewMetric label="Spread" value={formatBps(market.current.spreadBps.value)} />
          <PreviewMetric label="Book imbalance" value={formatPercent(market.orderBook?.orderBookImbalance.value, { signed: true })} valueClassName={signedClass(market.orderBook?.orderBookImbalance.value)} />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-terminal-line pt-3">
          <StatusBadge tone={market.volume.selectedPeriodVolume.status === "available" ? "success" : "warning"}>{market.volume.selectedPeriodVolume.status}</StatusBadge>
          <StatusBadge tone={market.openInterest.openInterestUsdEstimate.estimated ? "warning" : "neutral"}>{market.openInterest.openInterestUsdEstimate.estimated ? "OI estimated" : "OI sourced"}</StatusBadge>
          <StatusBadge tone={liveTicker ? "live" : "neutral"}>{liveTicker ? "Live ticker" : "REST state"}</StatusBadge>
        </div>
        <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-signal-live/50 bg-signal-live/15 px-3 py-2 text-sm font-semibold text-signal-live transition hover:bg-signal-live/20 focus:outline-none focus:ring-2 focus:ring-signal-live" href={`/markets/${market.marketId}`}>
          Open detail
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Panel>
  );
}

function PreviewMetric({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/45 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-terminal-muted">{label}</p>
      <p className={`mt-1 break-words font-mono text-sm font-semibold tabular-nums text-terminal-text ${value === "Unavailable" ? "text-terminal-subtle" : ""} ${valueClassName}`}>{value}</p>
    </div>
  );
}

function Muted({ children }: { children: string }) {
  return <span className="text-terminal-subtle">{children}</span>;
}

function LiveValue({ value, live }: { value: string; live: boolean }) {
  return (
    <span className={`inline-flex items-center justify-end gap-1 font-mono tabular-nums ${value === "Unavailable" ? "text-terminal-subtle" : ""}`}>
      {live ? <span className="h-1.5 w-1.5 rounded-full bg-signal-live" aria-hidden="true" /> : null}
      {value}
    </span>
  );
}

function selectedVolume(market: MarketAnalytics, period: AnalyticsPeriod) {
  if (period === "24h") return market.volume.volume24h.value;
  if (period === "7d") return market.volume.volume7d.value;
  return market.volume.volume30d.value;
}

function sortValue(market: MarketAnalytics, sort: SortKey, period: AnalyticsPeriod) {
  if (sort === "symbol") return market.symbol;
  if (sort === "volume") return selectedVolume(market, period);
  if (sort === "oi") return market.openInterest.openInterestUsdEstimate.value;
  if (sort === "tvl") return market.tvl.marketTvl.value;
  if (sort === "funding") return market.funding.fundingRateRaw.value === null ? null : Math.abs(market.funding.fundingRateRaw.value);
  if (sort === "spread") return market.current.spreadBps.value;
  return market.orderBook?.orderBookImbalance.value === null || market.orderBook?.orderBookImbalance.value === undefined ? null : Math.abs(market.orderBook.orderBookImbalance.value);
}

function compare(a: string | number | null, b: string | number | null) {
  if (typeof a === "string" && typeof b === "string" && Number.isNaN(Number(a)) && Number.isNaN(Number(b))) return a.localeCompare(b);
  const na = toFiniteNumber(a);
  const nb = toFiniteNumber(b);
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return na - nb;
}

function buildThresholds(markets: MarketAnalytics[], period: AnalyticsPeriod) {
  return {
    highVolume: percentileThreshold(markets.map((market) => toFiniteNumber(selectedVolume(market, period)))),
    highOi: percentileThreshold(markets.map((market) => toFiniteNumber(market.openInterest.openInterestUsdEstimate.value))),
    fundingExtreme: percentileThreshold(markets.map((market) => market.funding.fundingRateRaw.value === null ? null : Math.abs(market.funding.fundingRateRaw.value))),
    wideSpread: percentileThreshold(markets.map((market) => toFiniteNumber(market.current.spreadBps.value))),
    bookImbalance: percentileThreshold(markets.map((market) => market.orderBook?.orderBookImbalance.value === null || market.orderBook?.orderBookImbalance.value === undefined ? null : Math.abs(market.orderBook.orderBookImbalance.value)))
  };
}

function percentileThreshold(values: Array<number | null>) {
  const sorted = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(sorted.length * 0.75) - 1);
  return sorted[index];
}

function passesQuickFilters(
  market: MarketAnalytics,
  filters: QuickFilter[],
  thresholds: ReturnType<typeof buildThresholds>,
  liveTickers: ReturnType<typeof usePerplRealtime>["tickers"],
  period: AnalyticsPeriod
) {
  return filters.every((filter) => {
    if (filter === "liveWs") return Boolean(liveTickers[market.marketId]);
    if (filter === "highVolume") return meetsThreshold(toFiniteNumber(selectedVolume(market, period)), thresholds.highVolume);
    if (filter === "highOi") return meetsThreshold(toFiniteNumber(market.openInterest.openInterestUsdEstimate.value), thresholds.highOi);
    if (filter === "fundingExtreme") return meetsThreshold(market.funding.fundingRateRaw.value === null ? null : Math.abs(market.funding.fundingRateRaw.value), thresholds.fundingExtreme);
    if (filter === "wideSpread") return meetsThreshold(toFiniteNumber(market.current.spreadBps.value), thresholds.wideSpread);
    return meetsThreshold(market.orderBook?.orderBookImbalance.value === null || market.orderBook?.orderBookImbalance.value === undefined ? null : Math.abs(market.orderBook.orderBookImbalance.value), thresholds.bookImbalance);
  });
}

function meetsThreshold(value: number | null, threshold: number | null) {
  return value !== null && threshold !== null && value >= threshold;
}
