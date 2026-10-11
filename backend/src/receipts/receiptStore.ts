import { mkdir, readFile, stat, appendFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { computeReceiptHash } from "./hashing.js";
import type { ChainVerificationResult, PerplReceipt, ReceiptListQuery, ReceiptListResponse } from "./types.js";

export interface ReceiptStoreOptions {
  path?: string;
}

export class ReceiptStore {
  private readonly path: string;
  private receipts: PerplReceipt[] = [];
  private byId = new Map<string, PerplReceipt>();
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized = false;
  private failedClosed: Error | null = null;

  constructor(options: ReceiptStoreOptions = {}) {
    this.path = options.path ?? process.env.PERPL_RECEIPT_STORE_PATH ?? defaultReceiptPath();
  }

  getPath(): string {
    return this.path;
  }

  isFailedClosed(): boolean {
    return this.failedClosed !== null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      try {
        await stat(this.path);
      } catch {
        await appendFile(this.path, "");
      }
      const raw = await readFile(this.path, "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      const receipts: PerplReceipt[] = [];
      for (const [index, line] of lines.entries()) {
        let parsed: PerplReceipt;
        try {
          parsed = JSON.parse(line) as PerplReceipt;
        } catch {
          throw new Error(`Malformed receipt JSONL at line ${index + 1}.`);
        }
        if (computeReceiptHash(parsed) !== parsed.receiptHash) throw new Error(`Receipt hash mismatch at line ${index + 1}.`);
        receipts.push(parsed);
      }
      const chain = verifyReceiptArray(receipts);
      if (!chain.valid) throw new Error(`Receipt hash chain invalid: ${chain.errors.join("; ")}`);
      this.receipts = receipts;
      this.byId = new Map(receipts.map((receipt) => [receipt.receiptId, receipt]));
      this.initialized = true;
    } catch (error) {
      this.failedClosed = error instanceof Error ? error : new Error(String(error));
      throw this.failedClosed;
    }
  }

  async append(receipt: PerplReceipt): Promise<PerplReceipt> {
    await this.initialize();
    if (this.failedClosed) throw this.failedClosed;
    this.writeQueue = this.writeQueue.then(async () => {
      if (this.byId.has(receipt.receiptId)) throw new Error(`Receipt ${receipt.receiptId} already exists.`);
      await appendFile(this.path, `${JSON.stringify(receipt)}\n`, "utf8");
      this.receipts.push(receipt);
      this.byId.set(receipt.receiptId, receipt);
    });
    await this.writeQueue;
    return receipt;
  }

  latest(): PerplReceipt | null {
    return this.receipts[this.receipts.length - 1] ?? null;
  }

  get(receiptId: string): PerplReceipt | null {
    return this.byId.get(receiptId) ?? null;
  }

  all(): PerplReceipt[] {
    return [...this.receipts];
  }

  list(query: ReceiptListQuery = {}): ReceiptListResponse {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const cursorSequence = query.cursor ? Number(Buffer.from(query.cursor, "base64url").toString("utf8")) : null;
    let rows = [...this.receipts].reverse();
    if (cursorSequence) rows = rows.filter((receipt) => receipt.sequenceNumber < cursorSequence);
    if (query.type) rows = rows.filter((receipt) => receipt.receiptType === query.type);
    if (query.workflowId) rows = rows.filter((receipt) => receipt.workflowId === query.workflowId);
    if (query.decision) rows = rows.filter((receipt) => receipt.receiptType === "risk_review" && receipt.riskDecision.decision === query.decision);
    if (query.executionStatus) {
      rows = rows.filter((receipt) => {
        if (receipt.receiptType === "order_submission") return receipt.orderStatus === query.executionStatus;
        if (receipt.receiptType === "order_update") return receipt.currentStatus === query.executionStatus;
        if (receipt.receiptType === "order_finalized") return receipt.finalStatus === query.executionStatus;
        return false;
      });
    }
    const data = rows.slice(0, limit);
    const next = rows.length > limit ? data[data.length - 1] : null;
    return {
      data,
      nextCursor: next ? Buffer.from(String(next.sequenceNumber), "utf8").toString("base64url") : null
    };
  }

  verifyChain(): ChainVerificationResult {
    return verifyReceiptArray(this.receipts);
  }
}

function defaultReceiptPath(): string {
  if (process.env.NODE_ENV === "test") return join(tmpdir(), `assetpilot-perpl-receipts-${process.pid}.jsonl`);
  return basename(process.cwd()) === "backend" ? join(process.cwd(), ".data", "perpl-receipts.jsonl") : join(process.cwd(), "backend", ".data", "perpl-receipts.jsonl");
}

export function verifyReceiptArray(receipts: PerplReceipt[]): ChainVerificationResult {
  const errors: string[] = [];
  const byId = new Map(receipts.map((receipt) => [receipt.receiptId, receipt]));
  for (const [index, receipt] of receipts.entries()) {
    const expectedSequence = index + 1;
    if (receipt.sequenceNumber !== expectedSequence) errors.push(`sequence ${receipt.sequenceNumber} expected ${expectedSequence}`);
    if (computeReceiptHash(receipt) !== receipt.receiptHash) errors.push(`hash mismatch at sequence ${receipt.sequenceNumber}`);
    const previous = receipts[index - 1] ?? null;
    if (index === 0 && receipt.previousReceiptHash !== null) errors.push("first receipt previousReceiptHash must be null");
    if (index > 0 && receipt.previousReceiptHash !== previous?.receiptHash) errors.push(`previous hash mismatch at sequence ${receipt.sequenceNumber}`);
    if (receipt.parentReceiptId && !byId.has(receipt.parentReceiptId)) errors.push(`parent missing for ${receipt.receiptId}`);
    const parent = receipt.parentReceiptId ? byId.get(receipt.parentReceiptId) : null;
    if (parent && parent.workflowId !== receipt.workflowId) errors.push(`workflow mismatch for parent ${receipt.parentReceiptId}`);
  }
  return {
    valid: errors.length === 0,
    receiptCount: receipts.length,
    firstSequence: receipts[0]?.sequenceNumber ?? null,
    lastSequence: receipts[receipts.length - 1]?.sequenceNumber ?? null,
    lastReceiptHash: receipts[receipts.length - 1]?.receiptHash ?? null,
    corruptedSequence: errors.length ? receipts.find((receipt) => computeReceiptHash(receipt) !== receipt.receiptHash)?.sequenceNumber ?? null : null,
    errors
  };
}
