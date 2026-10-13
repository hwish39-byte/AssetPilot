"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useRealtimeStatus } from "@/hooks/usePerplRealtime";
import { formatUtc } from "@/lib/format";
import type { PerplRealtimeStatus, RealtimeDataMode, RealtimeStatus } from "@/types/perpl";
import { StatusBadge } from "./StatusBadge";

export function RealtimeStatusBadge({ status }: { status?: PerplRealtimeStatus | null }) {
  const fallback = useRealtimeStatus();
  const value = status ?? fallback.data ?? null;
  const label = value ? labelFor(value.status, value.mode) : "Checking";
  const live = value?.status === "live" && value.mode === "websocket";

  return (
    <StatusBadge tone={live ? "live" : "warning"} className="gap-2 px-3 py-1.5 normal-case tracking-normal">
      {live ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{label}</span>
      {value?.lastMessageAt ? <span className="text-terminal-subtle">Updated {formatUtc(value.lastMessageAt)}</span> : null}
    </StatusBadge>
  );
}

export function SystemStatusStrip() {
  const { data } = useRealtimeStatus();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RealtimeStatusBadge status={data} />
      {data?.lastError ? <span className="text-xs text-signal-warn">{data.lastError.code}</span> : null}
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
