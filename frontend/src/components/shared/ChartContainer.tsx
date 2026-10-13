"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";
import { formatCompact, formatUtc, toFiniteNumber } from "@/lib/format";
import type { TimeSeriesPoint } from "@/types/perpl";
import { EmptyState } from "./State";

export function ChartContainer({
  title,
  series,
  color = "#22d3ee",
  description,
  value,
  footer,
  status,
  className = ""
}: {
  title: string;
  series: TimeSeriesPoint[];
  color?: string;
  description?: ReactNode;
  value?: ReactNode;
  footer?: ReactNode;
  status?: ReactNode;
  className?: string;
}) {
  const data = series
    .map((point) => ({ time: point.timestamp, value: toFiniteNumber(point.value), status: point.status }))
    .filter((point) => point.value !== null);

  if (data.length === 0) {
    return <EmptyState title={`${title} unavailable`} description="The API returned no usable points for this period." />;
  }

  return (
    <div className={`rounded-lg border border-terminal-line bg-terminal-panel p-3 ${className}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-terminal-text">{title}</h3>
            {status}
          </div>
          {description ? <p className="mt-1 text-xs leading-5 text-terminal-muted">{description}</p> : null}
        </div>
        <div className="text-right">
          {value ? <p className="font-mono text-lg font-semibold tabular-nums text-terminal-text">{value}</p> : null}
          <p className="text-xs text-terminal-subtle">{data.length} points</p>
        </div>
      </div>
      <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`fill-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.22} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1f2a37" strokeDasharray="3 3" />
          <XAxis dataKey="time" tickFormatter={(value) => formatUtc(value).replace(" UTC", "")} minTickGap={36} tick={{ fontSize: 11, fill: "#7d8b9a" }} axisLine={{ stroke: "#1f2a37" }} tickLine={{ stroke: "#1f2a37" }} />
          <YAxis tickFormatter={(value) => formatCompact(value)} width={64} tick={{ fontSize: 11, fill: "#7d8b9a" }} axisLine={{ stroke: "#1f2a37" }} tickLine={{ stroke: "#1f2a37" }} />
          <Tooltip
            labelFormatter={(value) => formatUtc(Number(value))}
            formatter={(value) => [formatCompact(Number(value)), title]}
            contentStyle={{ borderRadius: 6, borderColor: "#1f2a37", background: "#101720", color: "#e5eef7", fontSize: 12 }}
            labelStyle={{ color: "#7d8b9a" }}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#fill-${title.replace(/\W/g, "")})`} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      {footer ? <div className="mt-3 border-t border-terminal-line pt-3 text-xs text-terminal-muted">{footer}</div> : null}
    </div>
  );
}
