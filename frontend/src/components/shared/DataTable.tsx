import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyLabel = "No rows found.",
  dense = false,
  stickyHeader = false,
  onRowClick,
  selectedRowKey
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyLabel?: string;
  dense?: boolean;
  stickyHeader?: boolean;
  onRowClick?: (row: T) => void;
  selectedRowKey?: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-terminal-line bg-terminal-panel">
      <table className="min-w-full divide-y divide-terminal-line text-sm text-terminal-muted">
        <thead className={`bg-terminal-raised text-xs uppercase tracking-wide text-terminal-subtle ${stickyHeader ? "sticky top-0 z-10" : ""}`}>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`whitespace-nowrap px-3 ${dense ? "py-2" : "py-2.5"} font-semibold ${alignClass(column.align)}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-terminal-line">
          {rows.length > 0 ? (
            rows.map((row) => {
              const rowKey = getRowKey(row);
              const selected = selectedRowKey === rowKey;
              return (
              <tr
                key={rowKey}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition hover:bg-terminal-raised/70 ${onRowClick ? "cursor-pointer" : ""} ${selected ? "bg-signal-live/10 shadow-[inset_3px_0_0_#22d3ee]" : ""}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`whitespace-nowrap px-3 ${dense ? "py-2" : "py-2.5"} ${alignClass(column.align)}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
              );
            })
          ) : (
            <tr>
              <td className="px-3 py-8 text-center text-terminal-subtle" colSpan={columns.length}>
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function alignClass(align: Column<unknown>["align"]) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}
