"use client";

import { AlertTriangle, ChevronDown, ListTree } from "lucide-react";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatBps, formatLeverage, formatPercent, formatToken } from "@/lib/format";
import type { PerplAgentAction, PerplMarket, PerplOrder, PerplPosition, PerplStrategyOutput } from "@/types/perpl";
import { findMarket, findOrder, findPosition } from "./tradeGuardUtils";

export function StrategyActionList({
  strategy,
  positions,
  orders,
  markets
}: {
  strategy: PerplStrategyOutput;
  positions: PerplPosition[];
  orders: PerplOrder[];
  markets: PerplMarket[];
}) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <ListTree className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Strategy actions
        </span>
      }
      actions={<StatusBadge tone={strategy.status === "generated" ? "success" : strategy.status === "clarification_required" ? "warning" : "danger"}>{strategy.status}</StatusBadge>}
    >
      <p className="text-sm leading-6 text-terminal-muted">{strategy.objective}</p>
      {strategy.clarificationQuestions.length ? (
        <div className="mt-3 rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-sm text-signal-warn">
          <p className="font-semibold">Clarification required</p>
          <ul className="mt-1 list-inside list-disc">
            {strategy.clarificationQuestions.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {strategy.actions.map((action) => <ActionRow key={action.actionId} action={action} positions={positions} orders={orders} markets={markets} />)}
      </div>
    </Panel>
  );
}

function ActionRow({ action, positions, orders, markets }: { action: PerplAgentAction; positions: PerplPosition[]; orders: PerplOrder[]; markets: PerplMarket[] }) {
  const position = "positionId" in action ? findPosition(positions, action.positionId) : undefined;
  const order = "orderId" in action ? findOrder(orders, action.orderId) : undefined;
  const marketId = action.type === "place_order" ? action.marketId : position?.marketId ?? order?.marketId;
  const market = findMarket(markets, marketId);

  return (
    <article className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-terminal-subtle">{action.actionId}</span>
        <StatusBadge tone={action.type === "place_order" && !action.reduceOnly ? "danger" : action.type === "hold" ? "neutral" : "live"}>{action.type}</StatusBadge>
        <span className="text-xs text-terminal-muted">{market?.symbol ?? marketId ?? "No market"}</span>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-terminal-muted sm:grid-cols-2 lg:grid-cols-3">
        {fieldsFor(action, position, order).map((field) => (
          <div key={field.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-terminal-subtle">{field.label}</p>
            <p className="break-words font-medium text-terminal-text">{field.value}</p>
          </div>
        ))}
      </div>
      {action.type === "place_order" && !action.reduceOnly ? (
        <p className="mt-2 inline-flex items-center gap-2 rounded border border-signal-danger/35 bg-signal-danger/10 px-2 py-1 text-xs font-semibold text-signal-danger">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          This action can increase exposure and cannot be locally confirmed unless risk review approves it.
        </p>
      ) : null}
      {action.type === "add_collateral" ? <p className="mt-2 text-xs font-semibold text-signal-warn">Hypothetical collateral input</p> : null}
      <p className="mt-2 text-sm text-terminal-muted">{action.rationale}</p>
      <ul className="mt-2 list-inside list-disc text-xs leading-5 text-terminal-muted">
        {action.expectedEffects.map((effect) => <li key={effect}>{effect}</li>)}
      </ul>
      <details className="mt-2">
        <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-terminal-muted focus:outline-none focus:ring-2 focus:ring-signal-live">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          JSON detail
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded bg-terminal-bg p-3 text-xs text-terminal-text">{JSON.stringify(action, null, 2)}</pre>
      </details>
    </article>
  );
}

function fieldsFor(action: PerplAgentAction, position?: PerplPosition, order?: PerplOrder) {
  if (action.type === "reduce_position") {
    return [
      { label: "Position", value: action.positionId },
      { label: "Side", value: position?.side ?? "Unavailable" },
      { label: "Reduction", value: formatPercent(action.percentage) },
      { label: "Max slippage", value: formatBps(action.maxSlippageBps) }
    ];
  }
  if (action.type === "close_position") {
    return [
      { label: "Position", value: action.positionId },
      { label: "Side", value: position?.side ?? "Unavailable" },
      { label: "Current size", value: formatToken(position?.size, position?.marketSymbol ?? "") }
    ];
  }
  if (action.type === "cancel_order") {
    return [
      { label: "Order", value: action.orderId },
      { label: "Order type", value: order?.type ?? "Unavailable" },
      { label: "Price", value: order?.limitPrice ?? "Unavailable" },
      { label: "Size", value: order?.originalSize ?? "Unavailable" }
    ];
  }
  if (action.type === "add_collateral") return [{ label: "Account", value: action.accountId }, { label: "Amount", value: action.amount }];
  if (action.type === "place_order") {
    return [
      { label: "Side", value: action.side },
      { label: "Order type", value: action.orderType },
      { label: "Size", value: action.size },
      { label: "Limit price", value: action.limitPrice ?? "Market" },
      { label: "Leverage", value: formatLeverage(action.leverage) },
      { label: "Reduce only", value: action.reduceOnly ? "Yes" : "No" },
      { label: "Slippage", value: formatBps(action.maxSlippageBps) }
    ];
  }
  return [{ label: "Reason", value: action.reason }, { label: "Assumptions", value: action.assumptions.join(", ") || "None" }];
}
