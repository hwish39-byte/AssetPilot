import { EventEmitter } from "node:events";
import type { PerplWebSocketFactory, PerplWebSocketLike, SubscriptionRequest } from "./types.js";

const WS_OPEN = 1;

export class PublicMarketWsClient extends EventEmitter {
  private ws: PerplWebSocketLike | null = null;

  constructor(
    private readonly options: {
      url: string;
      webSocketFactory?: PerplWebSocketFactory;
    }
  ) {
    super();
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WS_OPEN) return;
    const ws = this.createWebSocket(this.options.url);
    this.ws = ws;
    ws.addEventListener("open", () => this.emit("open"));
    ws.addEventListener("message", (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : Buffer.isBuffer(event.data) ? event.data.toString("utf8") : String(event.data);
        this.emit("message", JSON.parse(raw));
      } catch {
        this.emit("error", new Error("Perpl market WebSocket returned invalid JSON."));
      }
    });
    ws.addEventListener("close", (event) => this.emit("close", event));
    ws.addEventListener("error", (event) => this.emit("error", event));
  }

  subscribe(streams: string[], subscribe: boolean): void {
    this.send({ mt: 5, subs: streams.map((stream) => ({ stream, subscribe })) });
  }

  ping(): void {
    this.send({ mt: 1 });
  }

  close(): void {
    this.ws?.close(1000, "client stopped");
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WS_OPEN;
  }

  private send(payload: SubscriptionRequest | { mt: 1 }): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private createWebSocket(url: string): PerplWebSocketLike {
    if (this.options.webSocketFactory) return this.options.webSocketFactory(url);
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => PerplWebSocketLike }).WebSocket;
    if (!WebSocketCtor) {
      throw new Error("Global WebSocket is unavailable in this Node runtime.");
    }
    return new WebSocketCtor(url);
  }
}
