import "dotenv/config";
import { loadPerplConfig } from "../src/perpl/config.js";
import { PerplApiError } from "../src/perpl/errors.js";
import { PerplAnalyticsService } from "../src/perpl/analytics/analyticsService.js";

async function main() {
  const config = loadPerplConfig();
  const analytics = new PerplAnalyticsService({ config });
  const overview24h = await analytics.getOverview("24h");
  const overview7d = await analytics.getOverview("7d");
  const marketId = overview24h.marketRankings[0]?.marketId ?? overview24h.volumeByMarket[0]?.marketId;
  if (!marketId) {
    throw new PerplApiError({ code: "PERPL_HTTP_ERROR", statusCode: 502, message: "No Perpl markets available for analytics check." });
  }
  const [market, priceHistory, fundingHistory, availability] = await Promise.all([
    analytics.getMarketAnalytics(marketId, "24h"),
    analytics.getMarketHistory(marketId, "24h", "price"),
    analytics.getMarketHistory(marketId, "24h", "funding"),
    analytics.getAvailability()
  ]);
  const unavailable = availability.dataAvailability.filter((item) => item.status === "unavailable").map((item) => item.metric).join(",");

  console.log(
    [
      "perpl analytics: ok",
      `markets=${overview24h.metrics.totalMarkets.value}`,
      `selected_market_id=${marketId}`,
      "period=24h",
      `volume_status=${overview24h.metrics.totalVolume24h.status}`,
      `oi_status=${overview24h.metrics.totalOpenInterestUsdEstimate.status}`,
      `tvl_status=${overview24h.metrics.totalTvl.status}`,
      `funding_status=${market.funding.fundingRateRaw.status}`,
      `price_points=${priceHistory.series.length}`,
      `funding_points=${fundingHistory.series.length}`,
      `partial_market_count=${overview24h.failedMarkets.length}`,
      `overview_7d_volume_status=${overview7d.metrics.totalVolume7d.status}`,
      `unavailable=${unavailable}`
    ].join(" ")
  );
}

main().catch((error: unknown) => {
  if (error instanceof PerplApiError) {
    console.error(`perpl analytics check failed: code=${error.code} status=${error.perplStatus ?? error.statusCode}`);
    process.exit(1);
  }

  console.error("perpl analytics check failed: unexpected_error");
  process.exit(1);
});
