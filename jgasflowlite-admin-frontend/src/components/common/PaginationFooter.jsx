// src/components/common/PaginationFooter.jsx
// Shared list-pagination footer: "Showing X–Y of Z" summary, optional
// rows-per-page selector, numbered pages with ellipses, prev/next.
// Render it whenever the list has data — it degrades gracefully to just
// the summary when everything fits on one page.
import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Keeps `page` valid when the result set shrinks (filter change, deletion):
 * if the current page is beyond the last page, snap to the last page.
 *
 *   useClampPage(data, page, setPage);   // data = {total_pages} | undefined
 */
export const useClampPage = (data, page, setPage) => {
  const totalPages = data?.total_pages;
  useEffect(() => {
    if (typeof totalPages === 'number' && totalPages >= 1 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page, setPage]);
};

const PaginationFooter = React.memo(({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 15,
  itemName = 'items',
  /** Optional rows-per-page selector — pass both to enable. */
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50, 100],
}) => {
  const perPage = Number(itemsPerPage) > 0 ? Number(itemsPerPage) : 15;
  const total = Number(totalItems) || 0;
  const pages = Math.max(1, Number(totalPages) || 1);
  const page = Math.min(Math.max(1, Number(currentPage) || 1), pages);

  const startItem = total > 0 ? (page - 1) * perPage + 1 : 0;
  const endItem = Math.min(page * perPage, total);

  const handlePageChange = (next) => {
    if (next >= 1 && next <= pages && next !== page) onPageChange(next);
  };

  // Numbered window (max 5) around the current page
  const getPageNumbers = () => {
    const maxVisible = 5;
    if (pages <= maxVisible) return Array.from({ length: pages }, (_, i) => i + 1);
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(pages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  const pageNumbers = getPageNumbers();

  const summary = (
    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 transition-colors">
      <span>
        {total > 0
          ? `Showing ${startItem} to ${endItem} of ${total} ${itemName}`
          : `No ${itemName} found`}
      </span>
      {onPageSizeChange && total > 0 && (
        <label className="inline-flex items-center gap-1.5 text-xs">
          <select
            value={pageSize ?? perPage}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          per page
        </label>
      )}
    </div>
  );

  if (pages <= 1) {
    return (
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
        {summary}
      </div>
    );
  }

  const numBtn = (n) => (
    <button
      key={n}
      onClick={() => handlePageChange(n)}
      aria-current={page === n ? 'page' : undefined}
      className={`w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-colors ${
        page === n
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30'
      }`}
    >
      {n}
    </button>
  );

  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
      {summary}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers[0] > 1 && (
            <>
              {numBtn(1)}
              {pageNumbers[0] > 2 && (
                <span className="text-gray-400 dark:text-gray-500 px-0.5">…</span>
              )}
            </>
          )}
          {pageNumbers.map(numBtn)}
          {pageNumbers[pageNumbers.length - 1] < pages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < pages - 1 && (
                <span className="text-gray-400 dark:text-gray-500 px-0.5">…</span>
              )}
              {numBtn(pages)}
            </>
          )}
        </div>

        <button
          onClick={() => handlePageChange(page + 1)}
          disabled={page === pages}
          className="px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 disabled:hover:bg-transparent"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
});

PaginationFooter.displayName = 'PaginationFooter';
export default PaginationFooter;
