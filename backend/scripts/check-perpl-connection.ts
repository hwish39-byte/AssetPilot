import "dotenv/config";
import { hasPerplCredentials, loadPerplConfig, type PerplConfig } from "../src/perpl/config.js";
import { PerplApiError } from "../src/perpl/errors.js";
import { PerplPublicClient } from "../src/perpl/publicClient.js";
import { PerplSignedClient } from "../src/perpl/signedClient.js";
import { PerplService } from "../src/perpl/service.js";
import type { Context, Market } from "../src/perpl/types.js";
import { PerplRiskService } from "../src/risk/perplRiskService.js";

async function main() {
  const config = loadPerplConfig();
  const publicClient = new PerplPublicClient({ apiUrl: config.apiUrl });
  const context = await publicClient.getContext();

  assertContext(context, config);
  const market = chooseMarket(context);
  const { from, to } = recentRangeMs();
  const [allTicker, marketTicker, book, funding, candles] = await Promise.all([
    publicClient.getTicker(),
    publicClient.getTicker(market.id),
    publicClient.getOrderBook({ marketId: market.id, levels: 5 }),
    publicClient.getFunding({ marketId: market.id, from, to }),
    publicClient.getCandles({ marketId: market.id, resolution: 3600, from, to })
  ]);

  console.log(
    [
      "perpl public: ok",
      `chain_id=${context.chain.chain_id}`,
      `markets=${context.markets.length}`,
      `selected_market_id=${market.id}`,
      `selected_market_symbol=${market.symbol}`,
      `all_ticker_markets=${Object.keys(allTicker.d).length}`,
      `market_ticker_present=${Boolean(marketTicker.d[String(market.id)])}`,
      `book_bid_levels=${book.bid.length}`,
      `book_ask_levels=${book.ask.length}`,
      `funding_events=${funding.d.length}`,
      `candles=${candles.d.length}`
    ].join(" ")
  );

  if (!hasPerplCredentials(config)) {
    console.log("perpl private: skipped credentials=not_configured");
    return;
  }

  const signedClient = new PerplSignedClient({ config });
  const [wallet, positions, orders, fills, accountHistory, orderHistory, positionHistory, portfolioEquity, portfolioPnl] =
    await Promise.all([
      signedClient.getWallet(),
      signedClient.getPositions(),
      signedClient.getOrders(),
      signedClient.getFills({ count: 5 }),
      signedClient.getAccountHistory({ count: 5 }),
      signedClient.getOrderHistory({ count: 5 }),
      signedClient.getPositionHistory({ count: 5 }),
      signedClient.getPortfolio("equity", "week"),
      signedClient.getPortfolio("pnl", "week")
    ]);

  console.log(
    [
      "perpl private: ok",
      `accounts=${wallet.as?.length ?? 0}`,
      `stats=${wallet.sts?.length ?? 0}`,
      `positions=${positions.d.length}`,
      `open_orders=${orders.d.length}`,
      `fills=${fills.d.length}`,
      `account_history=${accountHistory.d.length}`,
      `order_history=${orderHistory.d.length}`,
      `position_history=${positionHistory.d.length}`,
      `portfolio_equity_points=${portfolioEquity.chart.length}`,
      `portfolio_pnl_points=${portfolioPnl.chart.length}`
    ].join(" ")
  );

  const risk = await new PerplRiskService(new PerplService({ config })).getRiskSnapshot({ historyCount: 20, portfolioPeriod: "week" });
  console.log(
    [
      "perpl risk: ok",
      `methodology=${risk.methodologyVersion}`,
      `risk_level=${risk.riskLevel}`,
      `score=${risk.score ?? "unavailable"}`,
      `coverage=${risk.scoreCoveragePercent}`,
      `positions=${risk.positions.length}`,
      `issues=${risk.issues.length}`,
      `history_complete=${risk.history.historyComplete}`
    ].join(" ")
  );
}

function assertContext(context: Context, config: PerplConfig): void {
  if (context.chain.chain_id !== config.chainId) {
    throw new PerplApiError({
      code: "PERPL_CONFIG_ERROR",
      statusCode: 500,
      message: `Perpl context chain_id ${context.chain.chain_id} does not match configured chain ID.`
    });
  }

  if (context.markets.length === 0) {
    throw new PerplApiError({
      code: "PERPL_HTTP_ERROR",
      statusCode: 502,
      message: "Perpl context returned no markets."
    });
  }
}

function chooseMarket(context: Context): Market {
  return context.markets.find((market) => market.config.is_open) ?? context.markets[0]!;
}

function recentRangeMs(): { from: number; to: number } {
  const to = Date.now();
  return { from: to - 24 * 60 * 60 * 1000, to };
}

main().catch((error: unknown) => {
  if (error instanceof PerplApiError) {
    console.error(`perpl check failed: code=${error.code} status=${error.perplStatus ?? error.statusCode}`);
    process.exit(1);
  }

  console.error("perpl check failed: unexpected_error");
  process.exit(1);
});
