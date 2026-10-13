export function shortAddress(value?: string) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function formatUsdValue(value: string | number | null | undefined, options: { compact?: boolean; estimated?: boolean } = {}) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "Unavailable";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: Math.abs(numeric) >= 1000 || options.compact ? 2 : 4
  }).format(numeric);
  return options.estimated ? `Est. ${formatted}` : formatted;
}

export function formatToken(value: string | number | null | undefined, unit = "", maxDigits = 6) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "Unavailable";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits }).format(numeric);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatCompact(value: string | number | null | undefined) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(numeric);
}

export function formatPercent(value: number | null | undefined, options: { alreadyPercent?: boolean; signed?: boolean } = {}) {
  if (!Number.isFinite(value)) return "Unavailable";
  const numeric = options.alreadyPercent ? Number(value) : Number(value) * 100;
  const sign = options.signed && numeric > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric)}%`;
}

export function formatBps(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value))} bps`;
}

export function formatLeverage(value: string | number | null | undefined) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "Unavailable";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric)}x`;
}

export function formatUtc(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date) + " UTC";
}

export function formatDuration(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds)) return "Unavailable";
  const total = Math.max(0, Math.round(Number(seconds)));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function signedClass(value: string | number | null | undefined) {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric === 0) return "text-terminal-muted";
  return numeric > 0 ? "text-signal-pass" : "text-signal-danger";
}

export function toFiniteNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
