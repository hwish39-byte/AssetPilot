"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useRealtimeStatus } from "@/hooks/usePerplRealtime";
import { formatUtc } from "@/lib/format";
import type { PerplRealtimeStatus, RealtimeDataMode, RealtimeStatus } from "@/types/perpl";

export function RealtimeStatusBadge({ status }: { status?: PerplRealtimeStatus | null }) {
  const fallback = useRealtimeStatus();
  const value = status ?? fallback.data ?? null;
  const label = value ? labelFor(value.status, value.mode) : "Checking";
  const live = value?.status === "live" && value.mode === "websocket";

  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${live ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {live ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{label}</span>
      {value?.lastMessageAt ? <span className="hidden text-slate-500 sm:inline">Updated {formatUtc(value.lastMessageAt)}</span> : null}
    </div>
  );
}

export function SystemStatusStrip() {
  const { data } = useRealtimeStatus();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RealtimeStatusBadge status={data} />
      {data?.lastError ? <span className="text-xs text-amber-700">{data.lastError.code}</span> : null}
    </div>
  );
}

function labelFor(status: RealtimeStatus, mode: RealtimeDataMode) {
  if (status === "live" && mode === "websocket") return "Live";
  if (status === "reconnecting") return "Reconnecting";
  if (mode === "rest_fallback") return "REST fallback";
  if (status === "stale") return "Stale";
  if (status === "failed") return "Unavailable";
  return status.replace("_", " ");
}
