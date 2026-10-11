import "dotenv/config";
import { loadPerplConfig } from "../src/perpl/config.js";
import { PerplApiError } from "../src/perpl/errors.js";
import { PerplPublicClient } from "../src/perpl/publicClient.js";
import type { Market } from "../src/perpl/types.js";

const TIMEOUT_MS = 25_000;

async function main() {
  const config = loadPerplConfig();
  const publicClient = new PerplPublicClient({ apiUrl: config.apiUrl, timeoutMs: 10_000 });
  const context = await publicClient.getContext();
  const market = chooseMarket(context.markets);
  const book = await publicClient.getOrderBook({ marketId: market.id, levels: 5 });
  const wsUrl = `${config.wsUrl.replace(/\/+$/, "")}/ws/v1/market-data`;

  const result = await waitForRealtime(wsUrl, config.chainId, market.id);

  console.log(
    [
      "perpl realtime: ok",
      `chain_id=${context.chain.chain_id}`,
      `markets=${context.markets.length}`,
      `selected_market_id=${market.id}`,
      `selected_market_symbol=${market.symbol}`,
      `rest_book_bid_levels=${book.bid.length}`,
      `rest_book_ask_levels=${book.ask.length}`,
      `ws_status=${result.status}`,
      `ticker_seen=${result.tickerSeen}`,
      `book_seen=${result.bookSeen}`,
      `heartbeat_seen=${result.heartbeatSeen}`
    ].join(" ")
  );
}

function waitForRealtime(wsUrl: string, chainId: number, marketId: number) {
  return new Promise<{ status: string; tickerSeen: boolean; bookSeen: boolean; heartbeatSeen: boolean }>((resolve, reject) => {
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => WebSocket }).WebSocket;
    if (!WebSocketCtor) {
      reject(new Error("Global WebSocket is unavailable in this Node runtime."));
      return;
    }

    let tickerSeen = false;
    let bookSeen = false;
    let heartbeatSeen = false;
    const ws = new WebSocketCtor(wsUrl);
    const timeout = setTimeout(() => {
      ws.close(1000, "check timeout");
      reject(new Error("Timed out waiting for Perpl public market WebSocket messages."));
    }, TIMEOUT_MS);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          mt: 5,
          subs: [
            { stream: `heartbeat@${chainId}`, subscribe: true },
            { stream: `market-state@${chainId}`, subscribe: true },
            { stream: `order-book@${marketId}`, subscribe: true }
          ]
        })
      );
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)) as { mt?: number; subs?: Array<{ status?: { code: number } }> };
        if (message.mt === 6 && message.subs?.some((sub) => sub.status?.code && sub.status.code !== 0)) {
          clearTimeout(timeout);
          ws.close(1000, "subscription failed");
          reject(new Error("Perpl realtime subscription failed."));
          return;
        }
        if (message.mt === 9) tickerSeen = true;
        if (message.mt === 15 || message.mt === 16) bookSeen = true;
        if (message.mt === 100) heartbeatSeen = true;
        if (tickerSeen && bookSeen) {
          clearTimeout(timeout);
          ws.send(JSON.stringify({ mt: 5, subs: [{ stream: `order-book@${marketId}`, subscribe: false }] }));
          ws.close(1000, "check complete");
          resolve({ status: "live", tickerSeen, bookSeen, heartbeatSeen });
        }
      } catch {
        clearTimeout(timeout);
        ws.close(1000, "invalid json");
        reject(new Error("Perpl realtime WebSocket returned invalid JSON."));
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Perpl realtime WebSocket connection failed."));
    });
  });
}

function chooseMarket(markets: Market[]): Market {
  const market = markets.find((item) => item.config.is_open) ?? markets[0];
  if (!market) {
    throw new PerplApiError({
      code: "PERPL_HTTP_ERROR",
      statusCode: 502,
      message: "Perpl context returned no markets."
    });
  }
  return market;
}

main().catch((error: unknown) => {
  console.error(`perpl realtime check failed: ${error instanceof Error ? error.message : "unexpected_error"}`);
  process.exit(1);
});
