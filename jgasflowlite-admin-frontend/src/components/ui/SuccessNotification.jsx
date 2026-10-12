// src/components/ui/SuccessNotification.jsx
import React, { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

const SuccessNotification = React.memo(({ message, duration = 3000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className="fixed top-6 right-6 z-[9999] animate-in slide-in-from-right duration-300">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
        <CheckCircle className="text-green-600" size={20} />
        <span className="text-green-800 font-medium">{message}</span>
      </div>
    </div>
  );
});

SuccessNotification.displayName = 'SuccessNotification';
export default SuccessNotification;