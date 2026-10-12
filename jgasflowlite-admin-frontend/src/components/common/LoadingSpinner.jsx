// src/components/common/LoadingSpinner.jsx
import React from 'react';

const LoadingSpinner = ({ message = 'Loading...', size = 'medium' }) => {
  const sizeClass = {
    small: 'h-6 w-6',
    medium: 'h-12 w-12',
    large: 'h-16 w-16'
  }[size];

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className={`animate-spin rounded-full border-b-2 border-purple-600 ${sizeClass}`}></div>
      {message && <p className="text-gray-600">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;