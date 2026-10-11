"use client";

import { useMemo, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { ErrorState } from "@/components/shared/State";
import { perplApi } from "@/lib/api";
import type { PerplOrder, PerplPosition, PerplRiskAction, PerplRiskSimulationResult } from "@/types/perpl";
import { RiskComparison } from "./RiskComparison";

type ActionType = PerplRiskAction["type"];

export function ManualSimulationPanel({ positions, orders }: { positions: PerplPosition[]; orders: PerplOrder[] }) {
  const [type, setType] = useState<ActionType>("hold");
  const [positionId, setPositionId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [percentage, setPercentage] = useState(25);
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState<PerplRiskSimulationResult | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  const action = useMemo<PerplRiskAction>(() => {
    if (type === "reduce_position") return { type, positionId, percentage: percentage / 100 };
    if (type === "close_position") return { type, positionId };
    if (type === "cancel_order") return { type, orderId };
    if (type === "add_collateral") return { type, amount };
    return { type: "hold" };
  }, [amount, orderId, percentage, positionId, type]);

  const canRun = type === "hold" || (type === "add_collateral" && positiveDecimal(amount)) || ((type === "reduce_position" || type === "close_position") && !!positionId) || (type === "cancel_order" && !!orderId);
  const dirty = () => result && setStale(true);

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await perplApi.simulate({ actions: [action] }));
      setStale(false);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form className="border border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-950">Manual simulation</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">Uses real Perpl positionId/orderId. It never creates user confirmation or an execution plan.</p>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-700">Action type</span>
          <select value={type} onChange={(event) => { setType(event.target.value as ActionType); dirty(); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600">
            <option value="hold">Hold</option>
            <option value="reduce_position">Reduce position</option>
            <option value="close_position">Close position</option>
            <option value="cancel_order">Cancel order</option>
            <option value="add_collateral">Add collateral</option>
          </select>
        </label>

        {(type === "reduce_position" || type === "close_position") ? (
          <label className="mt-4 block text-sm">
            <span className="font-medium text-slate-700">Position</span>
            <select value={positionId} onChange={(event) => { setPositionId(event.target.value); dirty(); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600">
              <option value="">Select a position</option>
              {positions.map((position) => <option key={position.positionId} value={position.positionId}>{position.marketSymbol ?? position.marketId} {position.side ?? ""} #{position.positionId}</option>)}
            </select>
          </label>
        ) : null}

        {type === "cancel_order" ? (
          <label className="mt-4 block text-sm">
            <span className="font-medium text-slate-700">Order</span>
            <select value={orderId} onChange={(event) => { setOrderId(event.target.value); dirty(); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600">
              <option value="">Select an order</option>
              {orders.map((order) => <option key={order.orderId} value={order.orderId}>{order.marketSymbol ?? order.marketId} order #{order.orderId}</option>)}
            </select>
          </label>
        ) : null}

        {type === "reduce_position" ? (
          <label className="mt-4 block text-sm">
            <span className="font-medium text-slate-700">Reduction percentage</span>
            <input type="range" min={1} max={99} value={percentage} onChange={(event) => { setPercentage(Number(event.target.value)); dirty(); }} className="mt-2 w-full" />
            <input type="number" min={1} max={99} value={percentage} onChange={(event) => { setPercentage(Number(event.target.value)); dirty(); }} className="mt-2 w-24 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600" />
          </label>
        ) : null}

        {type === "add_collateral" ? (
          <label className="mt-4 block text-sm">
            <span className="font-medium text-slate-700">Collateral amount</span>
            <input value={amount} onChange={(event) => { setAmount(event.target.value); dirty(); }} inputMode="decimal" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600" />
          </label>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" disabled={!canRun || running} className="min-h-10 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-600">
            {running ? "Simulating..." : "Run simulation"}
          </button>
          <button type="button" onClick={() => { setResult(null); setStale(false); setError(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </button>
        </div>
      </form>

      <div>
        {stale ? <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Manual simulation result is stale because inputs changed.</p> : null}
        {error ? <div className="mb-3"><ErrorState error={error} title="Manual simulation failed" /></div> : null}
        <RiskComparison simulation={result} title="Manual simulation comparison" />
      </div>
    </section>
  );
}

function positiveDecimal(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}
