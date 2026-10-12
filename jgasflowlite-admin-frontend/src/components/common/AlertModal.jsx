// src/components/common/AlertModal.jsx
import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const AlertModal = ({
  isOpen,
  onClose,
  type = 'success', // success, error, warning, info
  title,
  message,
  duration = 3000,
  showCloseButton = true
}) => {
  useEffect(() => {
    if (isOpen && duration > 0 && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  // Render when there's anything meaningful to show. Used to require
  // `message` specifically, but many callers (the toast-compatible
  // notifications provider, validation warnings, etc.) only pass a `title`.
  if (!isOpen) return null;
  if (!message && !title) return null;

  const typeStyles = {
    success: {
      headerBg: 'bg-green-500 dark:bg-green-600',
      icon: <CheckCircle className="text-white" size={18} />,
      bodyBg: 'bg-green-50 dark:bg-green-900/30',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
    },
    error: {
      headerBg: 'bg-red-500 dark:bg-red-600',
      icon: <AlertCircle className="text-white" size={18} />,
      bodyBg: 'bg-red-50 dark:bg-red-900/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
    },
    warning: {
      headerBg: 'bg-amber-500 dark:bg-amber-600',
      icon: <AlertTriangle className="text-amber-900 dark:text-amber-100" size={18} />,
      bodyBg: 'bg-amber-50 dark:bg-amber-900/30',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-200',
    },
    info: {
      headerBg: 'bg-blue-500 dark:bg-blue-600',
      icon: <Info className="text-blue-900 dark:text-blue-100" size={18} />,
      bodyBg: 'bg-blue-50 dark:bg-blue-900/30',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
    },
  };

  const style = typeStyles[type] || typeStyles.success;
  const defaultTitle = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Information',
  }[type] || 'Alert';

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[9999] animate-in fade-in duration-200">
      <div className={`bg-white dark:bg-gray-800 rounded-xl w-full max-w-md mx-4 overflow-hidden border ${style.border} transition-colors animate-in zoom-in-95 duration-300`}>
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-purple-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 transition-colors">
          <div className="flex items-center space-x-2.5">
            <div className={`p-1.5 rounded-lg ${type === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
              type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                type === 'info' ? 'bg-blue-100 dark:bg-blue-900/30' :
                  'bg-green-100 dark:bg-green-900/30'}`}>
              {React.cloneElement(style.icon, {
                className: type === 'error' ? 'text-red-600 dark:text-red-400' :
                  type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    type === 'info' ? 'text-blue-600 dark:text-blue-400' :
                      'text-green-600 dark:text-green-400',
                size: 18
              })}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 transition-colors">
                {title || defaultTitle}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">System Notification</p>
            </div>
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-purple-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={16} className="text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* Modal Body  only rendered if there's body copy; title-only
            alerts skip this entirely so the modal doesn't show empty
            whitespace. */}
        {message && (
          <div className={`px-6 py-5 bg-white dark:bg-gray-800 transition-colors`}>
            <p className={`text-sm text-gray-600 dark:text-gray-300 leading-relaxed transition-colors`}>
              {message}
            </p>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex-shrink-0 flex justify-end px-5 py-4 border-t border-purple-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 transition-colors">
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2 rounded-lg font-semibold transition-all text-xs active:scale-95 ${type === 'error' ? 'bg-red-600 text-white hover:bg-red-700' :
              type === 'warning' ? 'bg-amber-500 text-white hover:bg-amber-600' :
                type === 'info' ? 'bg-blue-600 text-white hover:bg-blue-700' :
                  'bg-green-600 text-white hover:bg-green-700'}`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AlertModal);

