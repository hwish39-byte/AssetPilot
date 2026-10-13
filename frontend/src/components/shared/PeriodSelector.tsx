"use client";

import type { AnalyticsPeriod } from "@/types/perpl";

const periods: AnalyticsPeriod[] = ["24h", "7d", "30d"];

export function PeriodSelector({ value, onChange }: { value: AnalyticsPeriod; onChange: (period: AnalyticsPeriod) => void }) {
  return (
    <div className="inline-flex rounded-md border border-terminal-line bg-terminal-panel p-0.5" aria-label="Analytics period">
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onChange(period)}
          className={`min-w-12 rounded px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-signal-live ${
            value === period ? "bg-signal-live/15 text-signal-live" : "text-terminal-muted hover:bg-terminal-raised hover:text-terminal-text"
          }`}
        >
          {period}
        </button>
      ))}
    </div>
  );
}
