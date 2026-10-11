"use client";

import type { AnalyticsPeriod } from "@/types/perpl";

const periods: AnalyticsPeriod[] = ["24h", "7d", "30d"];

export function PeriodSelector({ value, onChange }: { value: AnalyticsPeriod; onChange: (period: AnalyticsPeriod) => void }) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5" aria-label="Analytics period">
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onChange(period)}
          className={`min-w-12 rounded px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-600 ${
            value === period ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {period}
        </button>
      ))}
    </div>
  );
}
