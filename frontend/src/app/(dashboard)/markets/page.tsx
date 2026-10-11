import { Suspense } from "react";
import { MarketsDashboard } from "@/components/markets/MarketsDashboard";
import { LoadingSkeleton } from "@/components/shared/State";

export default function MarketsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <MarketsDashboard />
    </Suspense>
  );
}
