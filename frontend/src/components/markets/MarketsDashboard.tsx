"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Search } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ErrorState, LoadingSkeleton } from "@/components/shared/State";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { StatusPill } from "@/components/shared/MetricValue";
import { RealtimeStatusBadge } from "@/components/shared/RealtimeStatusBadge";
import { usePerplMarkets } from "@/hooks/usePerplMarkets";
import { usePerplRealtime } from "@/hooks/usePerplRealtime";
import { formatBps, formatPercent, formatUsdValue, signedClass, toFiniteNumber } from "@/lib/format";
import type { AnalyticsPeriod, MarketAnalytics } from "@/types/perpl";

type Filter = "all" | "open" | "closed";
type SortKey = "symbol" | "volume" | "oi" | "tvl" | "funding" | "spread" | "imbalance";

export function MarketsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<AnalyticsPeriod>((searchParams.get("period") as AnalyticsPeriod) || "24h");
  const [filter, setFilter] = useState<Filter>((searchParams.get("filter") as Filter) || "all");
  const [sort, setSort] = useState<SortKey>((searchParams.get("sort") as SortKey) || "volume");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const { overview, markets } = usePerplMarkets(period);
  const realtime = usePerplRealtime({ markets: (overview.data?.marketRankings ?? []).slice(0, 8).map((market) => market.marketId), channels: ["ticker", "funding", "orderbook", "heartbeat"] });

  const marketRows = markets.map((query) => query.data).filter((market): market is MarketAnalytics => Boolean(market));
  const loading = overview.isLoading || (overview.data && marketRows.length === 0 && markets.some((query) => query.isLoading));
  const errors = [overview.error, ...markets.map((query) => query.error)].filter(Boolean);

  const rows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return marketRows
      .filter((market) => (filter === "all" ? true : filter === "open" ? market.isOpen : !market.isOpen))
      .filter((market) => !lower || market.symbol.toLowerCase().includes(lower) || market.name.toLowerCase().includes(lower))
      .sort((a, b) => compare(sortValue(b, sort, period), sortValue(a, sort, period)) || a.symbol.localeCompare(b.symbol));
  }, [filter, marketRows, period, query, sort]);

  const syncUrl = (next: { period?: AnalyticsPeriod; filter?: Filter; sort?: SortKey; q?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.period) params.set("period", next.period);
    if (next.filter) params.set("filter", next.filter);
    if (next.sort) params.set("sort", next.sort);
    if (next.q !== undefined) next.q ? params.set("q", next.q) : params.delete("q");
    router.replace(`/markets?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market Scanner</h1>
          <p className="mt-1 text-sm text-slate-600">Scan Perpl markets by activity, liquidity, and risk-relevant metrics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeStatusBadge status={realtime.status} />
          <PeriodSelector value={period} onChange={(value) => { setPeriod(value); syncUrl({ period: value }); }} />
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3">
        <label className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); syncUrl({ q: event.target.value }); }}
            placeholder="Search symbol or name"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
        </label>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(["all", "open", "closed"] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setFilter(item); syncUrl({ filter: item }); }}
              className={`rounded px-3 py-1.5 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-cyan-600 ${filter === item ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-slate-500">Partial markets: {overview.data?.failedMarkets.length ?? 0}</p>
      </section>

      {loading ? <LoadingSkeleton rows={6} /> : null}
      {errors[0] ? <ErrorState error={errors[0]} onRetry={() => { overview.refetch(); markets.forEach((market) => market.refetch()); }} /> : null}
      {rows.length > 0 ? <DataTable columns={marketColumns(sort, (key) => { setSort(key); syncUrl({ sort: key }); }, period, realtime.tickers)} rows={rows} getRowKey={(row) => String(row.marketId)} /> : null}
    </div>
  );
}

function marketColumns(sort: SortKey, setSort: (key: SortKey) => void, period: AnalyticsPeriod, liveTickers: ReturnType<typeof usePerplRealtime>["tickers"]): Column<MarketAnalytics>[] {
  const sortable = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort(key)} className="inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-600">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sort === key ? "text-slate-900" : "text-slate-400"}`} aria-hidden="true" />
    </button>
  );
  return [
    { key: "symbol", header: sortable("symbol", "Symbol"), render: (row) => <Link className="font-semibold text-cyan-800 hover:underline" href={`/markets/${row.marketId}`}>{row.symbol}</Link> },
    { key: "mark", header: "Mark", align: "right", render: (row) => <LiveValue value={formatUsdValue(liveTickers[row.marketId]?.values.markPrice ?? row.current.markPrice)} live={Boolean(liveTickers[row.marketId])} /> },
    { key: "oracle", header: "Oracle", align: "right", render: (row) => formatUsdValue(liveTickers[row.marketId]?.values.oraclePrice ?? row.current.oraclePrice) },
    { key: "volume", header: sortable("volume", `${period} Volume`), align: "right", render: (row) => formatUsdValue(selectedVolume(row, period), { compact: true }) },
    { key: "oi", header: sortable("oi", "OI USD Est."), align: "right", render: (row) => formatUsdValue(row.openInterest.openInterestUsdEstimate.value, { compact: true, estimated: true }) },
    { key: "tvl", header: sortable("tvl", "TVL"), align: "right", render: (row) => formatUsdValue(row.tvl.marketTvl.value, { compact: true }) },
    { key: "funding", header: sortable("funding", "Funding"), align: "right", render: (row) => row.funding.fundingRateRaw.value === null ? "Unavailable" : formatBps(row.funding.fundingRateRaw.value / 100) },
    { key: "spread", header: sortable("spread", "Spread"), align: "right", render: (row) => formatBps(row.current.spreadBps.value) },
    { key: "imbalance", header: sortable("imbalance", "Book imbalance"), align: "right", render: (row) => <span className={signedClass(row.orderBook?.orderBookImbalance.value)}>{formatPercent(row.orderBook?.orderBookImbalance.value, { signed: true })}</span> },
    { key: "status", header: "Status", align: "center", render: (row) => <StatusPill status={row.isOpen ? "available" : "stale"} /> }
  ];
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
  if (sort === "funding") return market.funding.fundingRateRaw.value;
  if (sort === "spread") return market.current.spreadBps.value;
  return market.orderBook?.orderBookImbalance.value ?? null;
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

function LiveValue({ value, live }: { value: string; live: boolean }) {
  return <span className={live ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 transition-colors motion-reduce:transition-none" : ""}>{value}</span>;
}
