import { loadPerplConfig } from "../config.js";
import type { PerplRealtimeConfig } from "./types.js";

export function loadPerplRealtimeConfig(): PerplRealtimeConfig {
  const perpl = loadPerplConfig();
  return {
    wsUrl: `${perpl.wsUrl.replace(/\/+$/, "")}/ws/v1/market-data`,
    chainId: perpl.chainId,
    maxMarketsPerClient: readPositiveInt("PERPL_REALTIME_MAX_MARKETS", 8),
    heartbeatIntervalMs: readPositiveInt("PERPL_REALTIME_HEARTBEAT_MS", 15_000),
    staleAfterMs: readPositiveInt("PERPL_REALTIME_STALE_AFTER_MS", 45_000),
    restResyncIntervalMs: readPositiveInt("PERPL_REALTIME_REST_RESYNC_MS", 30_000),
    maxReconnectDelayMs: readPositiveInt("PERPL_REALTIME_MAX_RECONNECT_MS", 20_000)
  };
}

function readPositiveInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
