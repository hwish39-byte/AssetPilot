import { createHash } from "node:crypto";
import { canonicalJson } from "./canonicalJson.js";
import type { PerplReceipt } from "./types.js";

export function sha256Hex(value: string): string {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function receiptHashInput(receipt: PerplReceipt): string {
  const clone = { ...(receipt as unknown as Record<string, unknown>) };
  delete clone.receiptHash;
  delete clone.signature;
  return canonicalJson(clone);
}

export function computeReceiptHash(receipt: PerplReceipt): string {
  return sha256Hex(receiptHashInput(receipt));
}

export function stableHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
