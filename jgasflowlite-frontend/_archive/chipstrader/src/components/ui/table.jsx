import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, Skeleton } from './core';

/**
 * Data table.
 *
 *   columns: [{ key, header, render?(row), align?, sort?, className?, mobile? }]
 *   rows, loading, onRowClick, sort {by, order} + onSort
 *
 * On phones it renders each row as a compact card from the columns marked
 * `mobile` (or the first three), so no table ever scrolls sideways on a phone.
 */
export function DataTable({ columns, rows, loading, onRowClick, empty, sort, onSort, rowKey = 'id', dense, footer }) {
  const mobileCols = columns.filter((c) => c.mobile).length ? columns.filter((c) => c.mobile) : columns.slice(0, 3);
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key] ?? null);

  if (!loading && !rows?.length) return <div className="card">{empty ?? <EmptyState title="Nothing here yet" />}</div>;

  return (
    <div className="card overflow-hidden">
      <div className="hidden md:block overflow-x-auto max-h-[calc(100vh-260px)]">
        <table className="table-base">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn(c.align === 'right' && 'text-right', c.className)}>
                  {c.sort && onSort ? (
                    <button
                      className={cn('inline-flex items-center gap-1 uppercase hover:text-ink', c.align === 'right' && 'flex-row-reverse')}
                      onClick={() => onSort(c.sort, sort?.by === c.sort && sort?.order === 'ASC' ? 'DESC' : 'ASC')}
                    >
                      {c.header}
                      {sort?.by === c.sort && (sort.order === 'ASC' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        <Skeleton className={cn('h-3.5', c.align === 'right' ? 'w-14 ml-auto' : 'w-24')} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && 'cursor-pointer')}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn(dense && 'py-1.5', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                        {cell(c, r)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-line">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3.5 space-y-2">
                <Skeleton className="w-32" />
                <Skeleton className="w-48 h-3" />
              </div>
            ))
          : rows.map((r) => (
              <div key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('p-3.5 active:bg-surface-2', onRowClick && 'cursor-pointer')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-medium">{cell(mobileCols[0], r)}</div>
                  {mobileCols[2] && <div className="shrink-0">{cell(mobileCols[2], r)}</div>}
                </div>
                {mobileCols[1] && <div className="text-[13px] text-muted mt-1 truncate">{cell(mobileCols[1], r)}</div>}
              </div>
            ))}
      </div>
      {footer}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage, label = 'results' }) {
  if (!total) return null;
  const p = Number(page) || 1;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line bg-surface-2 text-xs text-muted">
      <span>
        {total.toLocaleString()} {label}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-sm btn-icon" disabled={p <= 1} onClick={() => onPage(p - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <span className="px-2 tabular-nums">
            {p} / {totalPages}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" disabled={p >= totalPages} onClick={() => onPage(p + 1)} aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
