"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, FileText, Gauge, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const nav = [
  { href: "/overview", label: "Overview", icon: Gauge },
  { href: "/markets", label: "Markets", icon: BarChart3 },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/trade-guard", label: "Trade Guard", icon: ShieldCheck },
  { href: "/receipts", label: "Receipts", icon: FileText }
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  return (
    <div className="dashboard-terminal min-h-screen bg-terminal-bg text-terminal-text">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-terminal-line bg-terminal-shell lg:block">
          <div className="border-b border-terminal-line px-4 py-4">
            <Link href="/overview" className="flex items-center gap-2 rounded-md text-lg font-semibold tracking-tight text-terminal-text focus:outline-none focus:ring-2 focus:ring-signal-live">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-terminal-line bg-terminal-raised text-signal-live">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>AssetPilot</span>
            </Link>
            <p className="mt-2 text-xs text-terminal-muted">Perpl risk intelligence</p>
          </div>
          <nav className="space-y-1 p-3" aria-label="Primary navigation">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-signal-live ${
                    active ? "bg-terminal-raised text-terminal-text shadow-[inset_3px_0_0_#22d3ee]" : "text-terminal-muted hover:bg-terminal-raised hover:text-terminal-text"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-signal-live" : "text-terminal-subtle"}`} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 bg-terminal-bg">
          <header className="sticky top-0 z-20 border-b border-terminal-line bg-terminal-shell/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-signal-live" aria-hidden="true" />
                  <span className="font-semibold text-terminal-text">AssetPilot</span>
                  <span className="rounded border border-signal-live/30 bg-signal-live/10 px-2 py-0.5 text-xs font-medium text-signal-live">Monad Testnet</span>
                </div>
                <p className="mt-0.5 text-xs text-terminal-muted">Perpl real-time risk intelligence and pre-trade risk simulation on Monad</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-signal-pass/30 bg-signal-pass/10 px-2 py-1 text-xs font-medium text-signal-pass">Perpl REST + public WS</span>
                <button
                  type="button"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["perpl"] })}
                  aria-label="Refresh Perpl data"
                  title="Refresh Perpl data"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-terminal-line bg-terminal-raised text-terminal-muted transition hover:border-signal-live/50 hover:text-signal-live focus:outline-none focus:ring-2 focus:ring-signal-live"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="rounded-md border border-terminal-line bg-terminal-raised px-3 py-1.5 text-xs font-medium text-terminal-muted">Backend trade key guarded</span>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] bg-terminal-bg px-4 py-5 lg:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
