const SENSITIVE_KEY = /^(secret|privateKey|apiKey|authorization|x-api-key|x-api-signature|canonical|authPayload)$/i;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function redactForReceipt<T>(value: T): T {
  return redact(value) as T;
}

export function assertNoSensitiveFields(value: unknown): void {
  const findings: string[] = [];
  scan(value, "$", findings);
  if (findings.length > 0) throw new Error(`Receipt contains sensitive fields: ${findings.join(", ")}`);
}

export function maskAddress(address: string | null | undefined): { maskedAddress: string | null; addressHash: string | null } {
  if (!address) return { maskedAddress: null, addressHash: null };
  const maskedAddress = ADDRESS_RE.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : "[redacted]";
  return { maskedAddress, addressHash: null };
}

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, key) => {
      if (SENSITIVE_KEY.test(key)) {
        acc[key] = "[redacted]";
      } else {
        acc[key] = redact((value as Record<string, unknown>)[key]);
      }
      return acc;
    }, {});
  }
  return value;
}

function scan(value: unknown, path: string, findings: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`, findings));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) && item !== "[redacted]") findings.push(`${path}.${key}`);
    scan(item, `${path}.${key}`, findings);
  }
}
