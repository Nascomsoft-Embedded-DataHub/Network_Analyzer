import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Used as the card title in the narrow-screen layout. */
  primary?: boolean;
  /** Omitted from the narrow-screen card layout. */
  hideOnMobile?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  /** Rendered when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/**
 * Responsive table.
 *
 * Tables are the main risk on a 360px screen, so below the `md` breakpoint the
 * table collapses into a stacked card list — one card per row, with each
 * field labelled. The phone is the tighter constraint, not the laptop.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  className,
}: TableProps<T>) {
  const primaryColumn = columns.find((column) => column.primary) ?? columns[0];
  const secondaryColumns = columns.filter(
    (column) => column.key !== primaryColumn?.key && !column.hideOnMobile,
  );

  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div className={className}>
      {/* Wide layout: a real table. */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-sm">
          {caption !== undefined ? (
            <caption className="sr-only">{caption}</caption>
          ) : null}
          <thead>
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2.5 align-middle text-ink">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow layout: one card per row. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg border border-line bg-surface p-3">
            {primaryColumn ? (
              <div className="text-sm font-medium text-ink">{primaryColumn.render(row)}</div>
            ) : null}
            <dl className="mt-2 grid grid-cols-1 gap-1">
              {secondaryColumns.map((column) => (
                <div key={column.key} className="flex justify-between gap-3">
                  <dt className="text-xs text-ink-muted">{column.header}</dt>
                  <dd className="text-right text-xs text-ink">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
