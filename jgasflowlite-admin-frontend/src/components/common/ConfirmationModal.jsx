// src/components/common/ConfirmationModal.jsx
import React from 'react';
import { X, AlertTriangle, CheckCircle, AlertCircle, Info, Trash2 } from 'lucide-react';

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  type = 'warning', // warning, danger, success, info
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  icon: CustomIcon
}) => {
  if (!isOpen) return null;

  const typeStyles = {
    warning: {
      headerBg: 'bg-amber-500 dark:bg-amber-600',
      icon: <AlertTriangle className="text-amber-900 dark:text-amber-100" size={18} />,
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white',
    },
    danger: {
      headerBg: 'bg-red-500 dark:bg-red-600',
      icon: <Trash2 className="text-white" size={18} />,
      confirmBtn: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white',
    },
    success: {
      headerBg: 'bg-green-500 dark:bg-green-600',
      icon: <CheckCircle className="text-white" size={18} />,
      confirmBtn: 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white',
    },
    info: {
      headerBg: 'bg-blue-500 dark:bg-blue-600',
      icon: <Info className="text-blue-900 dark:text-blue-100" size={18} />,
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white',
    },
  };

  const style = typeStyles[type] || typeStyles.warning;
  const IconComponent = CustomIcon || style.icon;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[9999] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md mx-4 overflow-hidden border border-purple-100 dark:border-gray-700 transition-colors animate-in zoom-in-95 duration-300">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-purple-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
          <div className="flex items-center space-x-2.5">
            <div className={`p-1.5 rounded-lg ${type === 'danger' ? 'bg-red-100 dark:bg-red-900/30' :
              type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                type === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                  'bg-blue-100 dark:bg-blue-900/30'}`}>
              {React.cloneElement(IconComponent, {
                className: type === 'danger' ? 'text-red-600 dark:text-red-400' :
                  type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    type === 'success' ? 'text-green-600 dark:text-green-400' :
                      'text-blue-600 dark:text-blue-400',
                size: 18
              })}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title || 'Confirmation'}</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Please confirm your action</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-purple-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <X size={16} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 bg-white dark:bg-gray-800 transition-colors">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {message || 'Are you sure you want to proceed?'}
          </p>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-shrink-0 items-center justify-end gap-3 px-6 py-4 border-t border-purple-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-xs font-medium transition-colors"
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all text-xs font-semibold active:scale-95 disabled:opacity-50 ${style.confirmBtn}`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ConfirmationModal);

