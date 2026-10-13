import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  Network,
  Play,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  XCircle
} from "lucide-react";

const stackItems = [
  {
    name: "Perpl Analytics",
    detail: "Market activity, funding context, open interest estimates, and live status for monitored Perpl markets.",
    icon: BarChart3
  },
  {
    name: "Wallet Risk Engine",
    detail: "Wallet scoring that turns positions, exposure, and stale data into operator-readable risk signals.",
    icon: Wallet
  },
  {
    name: "Agent Strategy",
    detail: "Agent plans are reviewed against risk policy before the user is asked to approve execution.",
    icon: Network
  },
  {
    name: "Trade Guard",
    detail: "Deterministic dry-runs compare current risk, proposed action, and backend execution constraints.",
    icon: ShieldCheck
  },
  {
    name: "Receipt Chain",
    detail: "Application-layer receipts record decisions and outputs with hash-chain verification for later review.",
    icon: FileCheck2
  }
];

const capabilities = [
  "Realtime market data",
  "Wallet risk",
  "Dry-run simulation",
  "Guarded execution",
  "Hash-chain receipts"
];

const comparisonRows = [
  {
    problem: "Agents form trades from partial market context.",
    improvement: "Perpl market data and wallet state are reviewed before a strategy reaches execution."
  },
  {
    problem: "Risk checks are implicit, inconsistent, or hard to replay.",
    improvement: "Simulation output is deterministic and visible to the user before approval."
  },
  {
    problem: "Execution paths mix intent, approval, and signing logic.",
    improvement: "Backend-guarded testnet execution keeps policy review in the application layer."
  },
  {
    problem: "Post-trade records are scattered across logs and UI state.",
    improvement: "Application-layer receipts provide hash-chain verification of decisions and results."
  }
];

const flowSteps = [
  { label: "Market feed", value: "Perpl", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" },
  { label: "Wallet score", value: "Risk 42", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  { label: "Dry-run", value: "Pass", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { label: "Guard", value: "Confirm", tone: "border-slate-300 bg-white text-slate-800" }
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-600">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-950 text-white">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight sm:text-base">AssetPilot</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex" aria-label="Landing navigation">
            <a className="rounded-sm hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600" href="#product">
              Product
            </a>
            <a className="rounded-sm hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600" href="#stack">
              Stack
            </a>
            <a className="rounded-sm hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-600" href="#security">
              Security
            </a>
          </nav>
          <Link
            href="/overview"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2"
          >
            Launch App
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section id="product" className="relative overflow-hidden border-b border-slate-200">
          <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,#f6f8fb,rgba(246,248,251,0))]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
            <div className="flex flex-col justify-center">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-800">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-600" aria-hidden="true" />
                Monad testnet risk console
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Perpl risk intelligence before agent-driven testnet execution.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                AssetPilot combines Perpl risk intelligence, wallet risk scoring, deterministic risk simulation, agent strategy review, backend-guarded testnet execution, and application-layer receipts.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/overview"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2"
                >
                  Launch App
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  aria-label="Watch demo video, coming soon"
                  title="Demo video coming soon"
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-400"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Watch demo video
                </button>
              </div>
              <div className="mt-8 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                <Signal label="Perpl" value="Market-aware" />
                <Signal label="Wallet" value="Risk-scored" />
                <Signal label="Receipts" value="Hash-verified" />
              </div>
            </div>

            <RiskTrackVisual />
          </div>
        </section>

        <section className="border-b border-slate-200 bg-mist py-4">
          <div className="mx-auto grid max-w-7xl gap-2 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
            {capabilities.map((capability) => (
              <div key={capability} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{capability}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="stack" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Stack</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">A risk-first control path for testnet trading agents.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              The stack keeps analytics, wallet review, strategy assessment, execution guardrails, and receipts in one traceable application flow.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {stackItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.name} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-cyan-800">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-950">{item.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="security" className="bg-mist py-16 lg:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Thesis</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Agents should pass through a visible risk console before execution.</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                AssetPilot does not promise protocol-level enforcement. It gives operators an application-layer workflow for reviewing agent intent, simulating risk, guarding backend testnet execution, and verifying receipts.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-rose-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-rose-800">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Typical agent flow
                </div>
                <div className="space-y-3">
                  {comparisonRows.map((row) => (
                    <p key={row.problem} className="border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600 first:border-t-0 first:pt-0">
                      {row.problem}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-emerald-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  AssetPilot control path
                </div>
                <div className="space-y-3">
                  {comparisonRows.map((row) => (
                    <p key={row.improvement} className="border-t border-slate-100 pt-3 text-sm leading-6 text-slate-700 first:border-t-0 first:pt-0">
                      {row.improvement}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-semibold tracking-tight text-slate-950">AssetPilot</p>
            <p className="mt-1 text-sm text-slate-500">Monad Testnet risk intelligence and guarded execution console.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <span className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-cyan-800">Monad Testnet</span>
            <Link className="rounded-md bg-slate-950 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2" href="/overview">
              Launch App
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-slate-950">{value}</p>
    </div>
  );
}

function RiskTrackVisual() {
  return (
    <div className="relative rounded-md border border-slate-200 bg-white p-4 shadow-panel sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Execution review</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Risk track</h2>
        </div>
        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Testnet only</span>
      </div>

      <div className="mt-5 space-y-3">
        {flowSteps.map((step, index) => (
          <div key={step.label} className="grid grid-cols-[auto_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white font-mono text-xs font-semibold text-slate-700">{index + 1}</span>
              {index < flowSteps.length - 1 ? <span className="h-10 w-px bg-slate-200" aria-hidden="true" /> : null}
            </div>
            <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{step.label}</p>
                <span className={`rounded border px-2 py-0.5 font-mono text-xs ${step.tone}`}>{step.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Policy delta
          </div>
          <p className="mt-2 text-xs leading-5 text-amber-900/80">Leverage and exposure are compared before confirmation.</p>
        </div>
        <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-900">
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Receipt hash
          </div>
          <p className="mt-2 break-all font-mono text-xs text-cyan-900/80">0x8fb2...41d9</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <LockKeyhole className="h-4 w-4 text-slate-700" aria-hidden="true" />
        Backend key guarded
        <span className="text-slate-300" aria-hidden="true">/</span>
        <Database className="h-4 w-4 text-slate-700" aria-hidden="true" />
        Application-layer records
      </div>
    </div>
  );
}
