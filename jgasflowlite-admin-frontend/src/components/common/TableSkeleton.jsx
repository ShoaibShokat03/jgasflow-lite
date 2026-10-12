// src/components/common/TableSkeleton.jsx
import React from 'react';

/**
 * Generic shimmer table skeleton used across list views.
 *
 * - rows: number of skeleton rows
 * - columns: number of columns
 * - columnWidths: optional array of tailwind width classes per column
 * - showAvatar: whether any column shows avatar + text stack
 * - avatarColumnIndex: index of the avatar column (default 0)
 * - showActions: whether any column shows 3 action dots
 * - actionsColumnIndex: index of the actions column (default last)
 * - containerClassName: extra classes for outer card (e.g. min height)
 */
const TableSkeleton = ({
  rows = 8,
  columns = 6,
  columnWidths = [],
  showAvatar = false,
  showActions = true,
  avatarColumnIndex = 0,
  actionsColumnIndex,
  containerClassName = '',
}) => {
  const effectiveWidths = Array.from({ length: columns }).map((_, i) => {
    return columnWidths[i] || 'flex-1';
  });

  const actionsCol =
    typeof actionsColumnIndex === 'number' ? actionsColumnIndex : columns - 1;

  return (
    <div
      className={
        'bg-white dark:bg-gray-800 rounded-xl border border-purple-100 dark:border-gray-700 overflow-hidden ' +
        containerClassName
      }
    >
      {/* Header skeleton */}
      <div className="border-b border-purple-100 dark:border-gray-700 bg-purple-50/50 dark:bg-gray-700/50 p-3">
        <div className="flex items-center gap-4">
          {effectiveWidths.map((width, idx) => (
            <div
              key={idx}
              className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${width} flex-shrink-0`}
            />
          ))}
        </div>
      </div>

      {/* Rows skeleton */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="border-b border-purple-100 dark:border-gray-700 last:border-b-0 px-3 py-3"
        >
          <div className="flex items-center gap-4 min-h-[56px]">
            {effectiveWidths.map((width, colIndex) => {
              const isAvatarCol = showAvatar && colIndex === avatarColumnIndex;
              const isActionsCol = showActions && colIndex === actionsCol;

              return (
                <div
                  key={colIndex}
                  className={`${width} flex-shrink-0 flex items-center ${
                    isActionsCol ? 'justify-end' : ''
                  }`}
                >
                  {isAvatarCol ? (
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1.5" />
                        <div className="h-2.5 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </div>
                    </div>
                  ) : isActionsCol ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                  ) : (
                    <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(TableSkeleton);

// src/components/common/TableSkeleton.jsx
