"use client";

import { useQuery } from "@tanstack/react-query";
import { perplApi, shouldRetryApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { AnalyticsPeriod } from "@/types/perpl";

export function usePerplOverview(period: AnalyticsPeriod) {
  const overview = useQuery({
    queryKey: queryKeys.perpl.overview(period),
    queryFn: ({ signal }) => perplApi.overview(period, signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  const availability = useQuery({
    queryKey: queryKeys.perpl.availability(),
    queryFn: ({ signal }) => perplApi.availability(signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  return { overview, availability };
}
