"use client";

import { EmptyState } from "@/components/shared/State";

export function TradeGuardEmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}
