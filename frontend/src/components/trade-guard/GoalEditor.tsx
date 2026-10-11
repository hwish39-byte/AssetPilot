"use client";

import { RotateCcw, X } from "lucide-react";
import { goalLimit, validateGoal } from "./tradeGuardUtils";

const shortcuts = [
  { label: "Reduce leverage", text: "Reduce current account leverage without increasing exposure." },
  { label: "Reduce concentration", text: "Reduce the largest position concentration while respecting policy limits." },
  { label: "Cancel risky orders", text: "Cancel open orders that could increase current risk." },
  { label: "Reach medium risk", text: "Bring the account to medium risk or lower without increasing exposure." },
  { label: "Analysis only", text: "Only analyze the current risk. Do not change positions or orders." }
];

export function GoalEditor({
  goal,
  setGoal,
  onRun,
  onCancel,
  isRunning,
  disabled
}: {
  goal: string;
  setGoal: (value: string) => void;
  onRun: () => void;
  onCancel: () => void;
  isRunning: boolean;
  disabled: boolean;
}) {
  const error = validateGoal(goal);
  const errorId = "trade-guard-goal-error";

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Goal</h2>
          <p className="mt-1 text-xs text-slate-600">Plain text only. Do not include secrets, API keys, or signatures.</p>
        </div>
        <span className={`font-mono text-xs ${goal.length > goalLimit ? "text-red-700" : "text-slate-500"}`}>{goal.length}/{goalLimit}</span>
      </div>

      <label htmlFor="trade-guard-goal" className="mt-4 block text-sm font-medium text-slate-700">Risk management goal</label>
      <textarea
        id="trade-guard-goal"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        aria-describedby={error ? errorId : undefined}
        rows={5}
        className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
        placeholder="Reduce current Perpl risk without increasing exposure."
      />
      {error ? <p id={errorId} className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.label}
            type="button"
            onClick={() => setGoal(shortcut.text)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          >
            {shortcut.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={disabled || isRunning || !!error}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
        >
          {isRunning ? "Running analysis..." : "Run analysis"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={!isRunning}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setGoal("")}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Clear
        </button>
      </div>
    </section>
  );
}
