export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value: unknown): unknown {
  if (value === undefined) throw new Error("Canonical JSON does not allow undefined.");
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not allow NaN or Infinity.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const item = record[key];
        if (item === undefined) throw new Error(`Canonical JSON does not allow undefined at ${key}.`);
        acc[key] = canonicalize(item);
        return acc;
      }, {});
  }
  throw new Error(`Canonical JSON does not support ${typeof value}.`);
}
