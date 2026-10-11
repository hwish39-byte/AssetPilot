import { MarketDetailDashboard } from "@/components/markets/MarketDetailDashboard";

export default function MarketDetailPage({ params }: { params: { marketId: string } }) {
  return <MarketDetailDashboard marketId={Number(params.marketId)} />;
}
