"use client";

import { useQuery } from "@tanstack/react-query";
import { perplApi, shouldRetryApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function usePerplWallet() {
  const wallet = useQuery({
    queryKey: queryKeys.perpl.wallet(),
    queryFn: ({ signal }) => perplApi.wallet(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  const positions = useQuery({
    queryKey: queryKeys.perpl.positions(),
    queryFn: ({ signal }) => perplApi.positions(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  const orders = useQuery({
    queryKey: queryKeys.perpl.orders(),
    queryFn: ({ signal }) => perplApi.orders(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  const fills = useQuery({
    queryKey: queryKeys.perpl.fills(),
    queryFn: ({ signal }) => perplApi.fills(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryApi
  });

  return { wallet, positions, orders, fills };
}
