import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";

ed.etc.sha512Sync = (...messages) => createHash("sha512").update(Buffer.concat(messages.map((message) => Buffer.from(message)))).digest();

export interface ReceiptSigningConfig {
  enabled: boolean;
  privateKey?: string;
  publicKey?: string;
  keyId?: string;
}

export function loadReceiptSigningConfig(env: NodeJS.ProcessEnv = process.env): ReceiptSigningConfig {
  return {
    enabled: ["true", "1", "yes"].includes((env.PERPL_RECEIPT_SIGNING_ENABLED ?? "false").toLowerCase()),
    privateKey: normalize(env.PERPL_RECEIPT_SIGNING_PRIVATE_KEY),
    publicKey: normalize(env.PERPL_RECEIPT_SIGNING_PUBLIC_KEY),
    keyId: normalize(env.PERPL_RECEIPT_SIGNING_KEY_ID)
  };
}

export async function signReceiptHash(receiptHash: string, config: ReceiptSigningConfig): Promise<{ signature: string | null; signingKeyId: string | null }> {
  if (!config.enabled) return { signature: null, signingKeyId: null };
  if (!config.privateKey || !config.keyId) throw new Error("Receipt signing is enabled but private key or key id is missing.");
  const signature = await ed.sign(new TextEncoder().encode(receiptHash), Buffer.from(config.privateKey.replace(/^0x/, ""), "hex"));
  return { signature: Buffer.from(signature).toString("base64url"), signingKeyId: config.keyId };
}

export async function verifyReceiptSignature(receiptHash: string, signature: string | null, config: ReceiptSigningConfig): Promise<boolean | null> {
  if (!signature) return null;
  if (!config.publicKey) return false;
  return ed.verify(Buffer.from(signature, "base64url"), new TextEncoder().encode(receiptHash), Buffer.from(config.publicKey.replace(/^0x/, ""), "hex"));
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
