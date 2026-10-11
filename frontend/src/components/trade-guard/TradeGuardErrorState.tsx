"use client";

import { ErrorState } from "@/components/shared/State";

export function TradeGuardErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  return <ErrorState error={error} onRetry={onRetry} title={title ?? "Trade Guard data unavailable"} />;
}
