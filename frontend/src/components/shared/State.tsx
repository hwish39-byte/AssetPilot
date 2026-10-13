"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "./Button";

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-md border border-terminal-line bg-terminal-raised/70" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-terminal-line bg-terminal-raised/45 p-6 text-sm">
      <p className="font-semibold text-terminal-text">{title}</p>
      <p className="mt-1 text-terminal-muted">{description}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Data request failed" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div className="rounded-lg border border-signal-danger/40 bg-signal-danger/10 p-4 text-sm text-signal-danger">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-words">{code ? `${code}: ${message}` : message}</p>
        </div>
        {onRetry ? (
          <Button variant="danger" size="sm" onClick={onRetry} aria-label="Retry request" title="Retry request">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
