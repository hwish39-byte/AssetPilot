"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatUtc, toFiniteNumber } from "@/lib/format";
import type { TimeSeriesPoint } from "@/types/perpl";
import { EmptyState } from "./State";

export function ChartContainer({ title, series, color = "#0891b2" }: { title: string; series: TimeSeriesPoint[]; color?: string }) {
  const data = series
    .map((point) => ({ time: point.timestamp, value: toFiniteNumber(point.value), status: point.status }))
    .filter((point) => point.value !== null);

  if (data.length === 0) {
    return <EmptyState title={`${title} unavailable`} description="The API returned no usable points for this period." />;
  }

  return (
    <div className="h-72 rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{data.length} points</p>
      </div>
      <ResponsiveContainer width="100%" height="88%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`fill-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.22} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="time" tickFormatter={(value) => formatUtc(value).replace(" UTC", "")} minTickGap={36} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => formatCompact(value)} width={64} tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(value) => formatUtc(Number(value))}
            formatter={(value) => [formatCompact(Number(value)), title]}
            contentStyle={{ borderRadius: 6, borderColor: "#cbd5e1", fontSize: 12 }}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#fill-${title.replace(/\W/g, "")})`} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
