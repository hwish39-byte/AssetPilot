"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { perplApi, perplRealtimeStreamUrl, shouldRetryApi } from "@/lib/api";
import type {
  PerplFundingState,
  PerplOrderBookState,
  PerplRealtimeMarketSnapshot,
  PerplRealtimeSnapshotEvent,
  PerplRealtimeStatus,
  PerplTickerState,
  RealtimeChannel
} from "@/types/perpl";

export function useRealtimeStatus() {
  return useQuery({
    queryKey: ["perpl", "realtime", "status"],
    queryFn: ({ signal }) => perplApi.realtimeStatus(signal),
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });
}

export function usePerplRealtime(args: { markets?: number[]; channels?: RealtimeChannel[] }) {
  const [status, setStatus] = useState<PerplRealtimeStatus | null>(null);
  const [snapshots, setSnapshots] = useState<PerplRealtimeMarketSnapshot[]>([]);
  const [tickers, setTickers] = useState<Record<number, PerplTickerState>>({});
  const [funding, setFunding] = useState<Record<number, PerplFundingState>>({});
  const [orderbooks, setOrderbooks] = useState<Record<number, PerplOrderBookState>>({});
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const marketsKey = useMemo(() => [...(args.markets ?? [])].sort((a, b) => a - b).join(","), [args.markets]);
  const channelsKey = useMemo(() => [...(args.channels ?? [])].sort().join(","), [args.channels]);

  useEffect(() => {
    const markets = marketsKey ? marketsKey.split(",").map((item) => Number(item)).filter((item) => Number.isInteger(item)) : [];
    const channels = channelsKey ? (channelsKey.split(",") as RealtimeChannel[]) : [];
    const source = new EventSource(perplRealtimeStreamUrl({ markets, channels }));
    const mark = () => setLastEventAt(new Date().toISOString());
    const onSnapshot = (event: MessageEvent) => {
      mark();
      const payload = JSON.parse(event.data) as PerplRealtimeSnapshotEvent;
      setSnapshots(payload.markets);
      setStatus(payload.status);
      setTickers(Object.fromEntries(payload.markets.filter((item) => item.ticker).map((item) => [item.market.id, item.ticker as PerplTickerState])));
      setFunding(Object.fromEntries(payload.markets.filter((item) => item.funding).map((item) => [item.market.id, item.funding as PerplFundingState])));
      setOrderbooks(Object.fromEntries(payload.markets.filter((item) => item.orderbook).map((item) => [item.market.id, item.orderbook as PerplOrderBookState])));
    };
    const onTicker = (event: MessageEvent) => {
      mark();
      const payload = JSON.parse(event.data) as PerplTickerState;
      setTickers((current) => ({ ...current, [payload.marketId]: payload }));
    };
    const onFunding = (event: MessageEvent) => {
      mark();
      const payload = JSON.parse(event.data) as PerplFundingState;
      setFunding((current) => ({ ...current, [payload.marketId]: payload }));
    };
    const onOrderBook = (event: MessageEvent) => {
      mark();
      const payload = JSON.parse(event.data) as PerplOrderBookState;
      setOrderbooks((current) => ({ ...current, [payload.marketId]: payload }));
    };
    const onStatus = (event: MessageEvent) => {
      mark();
      setStatus(JSON.parse(event.data) as PerplRealtimeStatus);
    };
    const onErrorEvent = (event: MessageEvent) => {
      mark();
      const payload = JSON.parse(event.data) as { message?: string };
      setError(payload.message ?? "Realtime stream error.");
    };

    source.addEventListener("snapshot", onSnapshot);
    source.addEventListener("ticker", onTicker);
    source.addEventListener("funding", onFunding);
    source.addEventListener("orderbook", onOrderBook);
    source.addEventListener("status", onStatus);
    source.addEventListener("error", onErrorEvent);
    source.onerror = () => setError("Realtime stream disconnected; REST polling remains active.");

    return () => {
      source.close();
    };
  }, [marketsKey, channelsKey]);

  return { status, snapshots, tickers, funding, orderbooks, lastEventAt, error };
}

export function usePerplMarketStream(marketId: number, channels: RealtimeChannel[] = ["ticker", "funding", "orderbook", "heartbeat"]) {
  return usePerplRealtime({ markets: Number.isInteger(marketId) && marketId > 0 ? [marketId] : [], channels });
}
