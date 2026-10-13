"use client";

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Panel } from "@/components/shared/Panel";
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
  const overLimit = goal.length > goalLimit;

  return (
    <Panel
      title="Goal"
      description="Plain text objective for the agent planner. Do not include secrets, API keys, signatures, or private-key material."
      actions={<span className={`font-mono text-xs ${overLimit ? "text-signal-danger" : "text-terminal-muted"}`}>{goal.length}/{goalLimit}</span>}
    >
      <label htmlFor="trade-guard-goal" className="block text-sm font-medium text-terminal-muted">Risk management goal</label>
      <textarea
        id="trade-guard-goal"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        aria-describedby={error ? errorId : undefined}
        rows={6}
        className="mt-2 w-full resize-y rounded-md border border-terminal-line bg-terminal-raised px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-subtle focus:outline-none focus:ring-2 focus:ring-signal-live"
        placeholder="Reduce current Perpl risk without increasing exposure."
      />
      {error ? <p id={errorId} className="mt-2 text-xs font-medium text-signal-danger">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {shortcuts.map((shortcut) => (
          <Button key={shortcut.label} type="button" onClick={() => setGoal(shortcut.text)} variant="ghost" size="sm">
            {shortcut.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onRun} disabled={disabled || isRunning || !!error} variant="primary">
          {isRunning ? "Running analysis..." : "Run analysis"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={!isRunning} variant="secondary">
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </Button>
        <Button type="button" onClick={() => setGoal("")} variant="ghost">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Clear
        </Button>
      </div>
    </Panel>
  );
}
