import "dotenv/config";
import { loadPerplConfig } from "../src/perpl/config.js";
import { PerplService } from "../src/perpl/service.js";
import { loadPerplTradingConfig, hasPerplTradeCredentials } from "../src/perpl/trading/config.js";
import { signTradingWsAuth } from "../src/perpl/trading/auth.js";
import { PerplTradingExecutionService } from "../src/perpl/trading/executionService.js";

async function main() {
  const perplConfig = loadPerplConfig();
  const tradingConfig = loadPerplTradingConfig(perplConfig);
  const perpl = new PerplService({ config: perplConfig });
  const service = new PerplTradingExecutionService({ perplService: perpl, perplConfig, tradingConfig });
  const capabilities = await service.getCapabilities();

  console.log(`perpl trade: network=testnet enabled=${capabilities.tradingEnabled} submit=${capabilities.canSubmitOrder}`);
  console.log(`perpl trade: readonly_key=${capabilities.readonlyKeyConfigured} trade_key=${capabilities.credentialsConfigured} accounts=${capabilities.wallet.accounts.length}`);
  console.log(`perpl trade: allowed_markets=${capabilities.allowedMarketIds.length || "all"} actions=${capabilities.allowedActions.join(",")}`);
  if (capabilities.reasons.length > 0) console.log(`perpl trade: blocked_reasons=${capabilities.reasons.length}`);

  if (hasPerplTradeCredentials(tradingConfig)) {
    await signTradingWsAuth(tradingConfig);
    console.log("perpl trade: ws_auth_frame=signable");
  } else {
    console.log("perpl trade: ws_auth_frame=skipped_no_trade_key");
  }
  console.log("perpl trade: no orders submitted");
}

main().catch((error) => {
  console.error(`perpl trade: failed ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
