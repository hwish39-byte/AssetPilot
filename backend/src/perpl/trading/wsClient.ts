import { PerplApiError } from "../errors.js";
import { signTradingWsAuth, type TradingAuthDeps } from "./auth.js";
import type { PerplOrderSpec, PerplOrderSubmissionResult, PerplTradingClient, PerplTradingConfig, TradingWsConnectionState } from "./types.js";

type WebSocketCtor = new (url: string) => WebSocketLike;

interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: { data?: unknown }) => void, options?: { once?: boolean }): void;
}

export interface PerplTradingWsClientOptions extends TradingAuthDeps {
  config: PerplTradingConfig;
  WebSocket?: WebSocketCtor;
  timeoutMs?: number;
  nowIso?: () => string;
}

export class PerplTradingWsClient implements PerplTradingClient {
  private readonly config: PerplTradingConfig;
  private readonly WebSocket?: WebSocketCtor;
  private readonly timeoutMs: number;
  private readonly authDeps: TradingAuthDeps;
  private readonly nowIso: () => string;
  private state: TradingWsConnectionState = "idle";

  constructor(options: PerplTradingWsClientOptions) {
    this.config = options.config;
    this.WebSocket = options.WebSocket ?? (globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.authDeps = { nowMs: options.nowMs, nonce: options.nonce };
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  getState(): TradingWsConnectionState {
    return this.state;
  }

  async submitOrder(order: PerplOrderSpec): Promise<PerplOrderSubmissionResult> {
    const socket = await this.connectAndAuthenticate();
    const frame = { mt: 22, orders: [order] };
    socket.send(JSON.stringify(frame));
    return this.waitForOrderResult(socket, order.rq);
  }

  async connectAndAuthenticate(): Promise<WebSocketLike> {
    if (!this.WebSocket) {
      throw new PerplApiError({ code: "PERPL_TRADING_UNSUPPORTED", statusCode: 500, message: "Runtime WebSocket implementation is unavailable." });
    }
    const socket = new this.WebSocket(`${this.config.wsUrl.replace(/\/$/, "")}/ws/v1/trading`);
    this.state = "connecting";
    await waitFor(socket, "open", this.timeoutMs);
    this.state = "authenticating";
    const { frame } = await signTradingWsAuth(this.config, this.authDeps);
    socket.send(JSON.stringify(frame));
    this.state = "snapshotting";
    await this.waitForSnapshotOrReady(socket);
    this.state = "ready";
    return socket;
  }

  private async waitForSnapshotOrReady(socket: WebSocketLike): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for Perpl trading snapshots.")), this.timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.addEventListener("message", (event) => {
        const message = parseMessage(event.data);
        if (message && [19, 23, 26].includes(Number(message.mt))) done();
        if (message && Number(message.mt) === 30 && message.error) reject(new Error("Perpl trading authentication rejected."));
      });
      socket.addEventListener("close", () => reject(new Error("Perpl trading WebSocket closed before snapshots.")), { once: true });
      socket.addEventListener("error", () => reject(new Error("Perpl trading WebSocket error before snapshots.")), { once: true });
    }).catch((error) => {
      this.state = "error";
      throw new PerplApiError({
        code: "PERPL_NETWORK_ERROR",
        statusCode: 502,
        message: error instanceof Error ? error.message : "Perpl trading WebSocket failed."
      });
    });
  }

  private async waitForOrderResult(socket: WebSocketLike, requestId: number): Promise<PerplOrderSubmissionResult> {
    return new Promise<PerplOrderSubmissionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.state = "closed";
        socket.close();
        resolve({ status: "timeout", requestId, orderId: null, perplStatus: null, perplStatusReason: null, message: "Timed out waiting for Perpl order status.", receivedAt: this.nowIso() });
      }, this.timeoutMs);
      socket.addEventListener("message", (event) => {
        const message = parseMessage(event.data);
        const order = Array.isArray(message?.orders) ? message.orders.find((item: Record<string, unknown>) => Number(item.rq) === requestId) : message;
        if (!order || Number(order.rq) !== requestId) return;
        clearTimeout(timer);
        const perplStatus = Number.isFinite(Number(order.st)) ? Number(order.st) : null;
        const perplStatusReason = Number.isFinite(Number(order.sr)) ? Number(order.sr) : null;
        const accepted = perplStatus === 0 || perplStatus === 2;
        resolve({
          status: accepted ? "accepted" : "rejected",
          requestId,
          orderId: order.oid === undefined ? null : String(order.oid),
          perplStatus,
          perplStatusReason,
          message: accepted ? "Perpl accepted the testnet order for forwarding." : "Perpl rejected the testnet order.",
          receivedAt: this.nowIso()
        });
      });
      socket.addEventListener("close", () => {
        clearTimeout(timer);
        this.state = "closed";
        resolve({ status: "disconnected", requestId, orderId: null, perplStatus: null, perplStatusReason: null, message: "Perpl trading WebSocket disconnected.", receivedAt: this.nowIso() });
      }, { once: true });
    });
  }
}

function waitFor(socket: WebSocketLike, type: "open", timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for WebSocket ${type}.`)), timeoutMs);
    socket.addEventListener(type, () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket connection failed."));
    }, { once: true });
  });
}

function parseMessage(data: unknown): Record<string, unknown> | null {
  try {
    if (typeof data === "string") return JSON.parse(data) as Record<string, unknown>;
    if (data instanceof Buffer) return JSON.parse(data.toString()) as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}
