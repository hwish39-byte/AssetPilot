"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { perplApi, shouldRetryApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { AnalyticsPeriod } from "@/types/perpl";

export function usePerplMarkets(period: AnalyticsPeriod) {
  const overview = useQuery({
    queryKey: queryKeys.perpl.overview(period),
    queryFn: ({ signal }) => perplApi.overview(period, signal),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  const marketIds = overview.data?.marketRankings.map((market) => market.marketId) ?? [];
  const marketQueries = useQueries({
    queries: marketIds.map((marketId) => ({
      queryKey: queryKeys.perpl.market(marketId, period),
      queryFn: ({ signal }: { signal?: AbortSignal }) => perplApi.market(marketId, period, signal),
      staleTime: 15_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: shouldRetryApi,
      enabled: marketIds.length > 0
    }))
  });

  return { overview, markets: marketQueries };
}

export function usePerplMarket(marketId: number, period: AnalyticsPeriod) {
  return useQuery({
    queryKey: queryKeys.perpl.market(marketId, period),
    queryFn: ({ signal }) => perplApi.market(marketId, period, signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi,
    enabled: Number.isInteger(marketId) && marketId > 0
  });
}

export function usePerplMarketHistory(marketId: number, period: AnalyticsPeriod, metric: "price" | "volume" | "funding") {
  return useQuery({
    queryKey: queryKeys.perpl.marketHistory(marketId, period, metric),
    queryFn: ({ signal }) => perplApi.marketHistory(marketId, period, metric, signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi,
    enabled: Number.isInteger(marketId) && marketId > 0
  });
}
