import type { RealtimeChannel } from "./types.js";

export class SubscriptionManager {
  private readonly refs = new Map<string, number>();
  private readonly sidToStream = new Map<number, string>();

  retain(marketIds: number[], channels: RealtimeChannel[], chainId: number): string[] {
    const streams = buildStreams(marketIds, channels, chainId);
    const newlyNeeded: string[] = [];
    for (const stream of streams) {
      const next = (this.refs.get(stream) ?? 0) + 1;
      this.refs.set(stream, next);
      if (next === 1) newlyNeeded.push(stream);
    }
    return newlyNeeded;
  }

  release(marketIds: number[], channels: RealtimeChannel[], chainId: number): string[] {
    const streams = buildStreams(marketIds, channels, chainId);
    const noLongerNeeded: string[] = [];
    for (const stream of streams) {
      const next = (this.refs.get(stream) ?? 0) - 1;
      if (next <= 0) {
        this.refs.delete(stream);
        noLongerNeeded.push(stream);
      } else {
        this.refs.set(stream, next);
      }
    }
    return noLongerNeeded;
  }

  rememberSid(stream: string, sid: number | undefined): void {
    if (sid !== undefined) this.sidToStream.set(sid, stream);
  }

  streamForSid(sid: number | undefined): string | null {
    return sid === undefined ? null : this.sidToStream.get(sid) ?? null;
  }

  activeStreams(): string[] {
    return [...this.refs.keys()].sort();
  }
}

export function buildStreams(marketIds: number[], channels: RealtimeChannel[], chainId: number): string[] {
  const streams = new Set<string>();
  if (channels.includes("heartbeat")) streams.add(`heartbeat@${chainId}`);
  if (channels.includes("ticker")) streams.add(`market-state@${chainId}`);
  if (channels.includes("funding")) streams.add(`funding@${chainId}`);
  if (channels.includes("orderbook")) {
    for (const marketId of marketIds) streams.add(`order-book@${marketId}`);
  }
  return [...streams].sort();
}
