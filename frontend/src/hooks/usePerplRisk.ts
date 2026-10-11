"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { perplApi, shouldRetryApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { PerplRiskSimulationRequest } from "@/types/perpl";

export function usePerplRisk() {
  return useQuery({
    queryKey: queryKeys.perpl.risk(),
    queryFn: ({ signal }) => perplApi.risk({}, signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });
}

export function usePerplRiskSimulation() {
  return useMutation({
    mutationFn: (request: PerplRiskSimulationRequest) => perplApi.simulate(request)
  });
}
