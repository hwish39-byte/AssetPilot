import { Decimal } from "decimal.js";

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function decimalOrNull(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

export function zero(): Decimal {
  return new Decimal(0);
}

export function decimalString(value: Decimal | null): string | null {
  if (!value || !value.isFinite()) return null;
  return value.toFixed();
}

export function ratioNumber(numerator: Decimal | null, denominator: Decimal | null): number | null {
  if (!numerator || !denominator || denominator.isZero()) return null;
  return safeNumber(numerator.div(denominator));
}

export function safeNumber(value: Decimal | null): number | null {
  if (!value || !value.isFinite()) return null;
  const numberValue = value.toNumber();
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function interpolate(value: number, points: Array<[number, number]>): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (value <= sorted[0]![0]) return sorted[0]![1];
  for (let index = 1; index < sorted.length; index += 1) {
    const [x1, y1] = sorted[index - 1]!;
    const [x2, y2] = sorted[index]!;
    if (value <= x2) {
      const progress = (value - x1) / (x2 - x1);
      return clamp(y1 + (y2 - y1) * progress);
    }
  }
  return sorted[sorted.length - 1]![1];
}

export function roundPercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 100;
}

export function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
