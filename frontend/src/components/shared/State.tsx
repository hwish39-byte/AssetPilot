"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-slate-100" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-slate-600">{description}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Data request failed" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-words">{code ? `${code}: ${message}` : message}</p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Retry request"
            title="Retry request"
            className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-900 focus:outline-none focus:ring-2 focus:ring-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
