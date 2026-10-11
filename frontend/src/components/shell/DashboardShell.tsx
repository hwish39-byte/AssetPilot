"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, FileText, Gauge, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";

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
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const metaMask = connectors.find((connector) => connector.name.toLowerCase().includes("meta")) ?? connectors[0];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="border-b border-slate-200 px-4 py-4">
            <Link href="/overview" className="text-lg font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-cyan-600">
              AssetPilot
            </Link>
            <p className="mt-1 text-xs text-slate-500">Perpl risk intelligence</p>
          </div>
          <nav className="space-y-1 p-3" aria-label="Primary navigation">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-600 ${
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-700" aria-hidden="true" />
                  <span className="font-semibold">AssetPilot</span>
                  <span className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800">Monad Testnet</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Perpl real-time risk intelligence and pre-trade risk simulation on Monad</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Perpl API polling</span>
                <button
                  type="button"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["perpl"] })}
                  aria-label="Refresh Perpl data"
                  title="Refresh Perpl data"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => disconnect()}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600"
                  >
                    Connected Monad wallet: {shortAddress(address)}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isPending || !metaMask}
                    onClick={() => metaMask && connect({ connector: metaMask })}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
                  >
                    Connect Monad wallet
                  </button>
                )}
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden" aria-label="Mobile navigation">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-600 ${
                      active ? "bg-slate-900 text-white" : "text-slate-600"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          <main className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
