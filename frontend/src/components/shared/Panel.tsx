import type { ReactNode } from "react";

type PanelTone = "default" | "warning" | "danger" | "success";

const toneClass: Record<PanelTone, string> = {
  default: "border-terminal-line bg-terminal-panel",
  warning: "border-signal-warn/35 bg-signal-warn/10",
  danger: "border-signal-danger/40 bg-signal-danger/10",
  success: "border-signal-pass/35 bg-signal-pass/10"
};

export function Panel({
  children,
  title,
  description,
  actions,
  className = "",
  tone = "default"
}: {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  tone?: PanelTone;
}) {
  const hasHeader = title || description || actions;

  return (
    <section className={`rounded-lg border ${toneClass[tone]} text-terminal-text ${className}`}>
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-terminal-line px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-terminal-text">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs leading-5 text-terminal-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
