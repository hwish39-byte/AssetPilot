import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, getRowKey }: { columns: Column<T>[]; rows: T[]; getRowKey: (row: T) => string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`whitespace-nowrap px-3 py-2 font-semibold ${alignClass(column.align)}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className={`whitespace-nowrap px-3 py-2 ${alignClass(column.align)}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
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
