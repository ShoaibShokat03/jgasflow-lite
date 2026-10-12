// src/components/common/DarkModeToggle.jsx
import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../../contexts/DarkModeContext';

const DarkModeToggle = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  return (
    <button
      onClick={toggleDarkMode}
      className="relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 hover:scale-105 active:scale-95"
      aria-label="Toggle dark mode"
      role="switch"
      aria-checked={isDarkMode}
    >
      {/* Background gradient effect */}
      <span
        className={`absolute inset-0 rounded-full transition-all duration-300 ${
          isDarkMode
            ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700'
            : 'bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500'
        }`}
      />
      
      {/* Toggle Circle */}
      <span
        className={`relative inline-flex h-6 w-6 transform rounded-full bg-white transition-all duration-300 items-center justify-center ${
          isDarkMode ? 'translate-x-8' : 'translate-x-1'
        }`}
      >
        <span className="flex items-center justify-center w-full h-full">
          {isDarkMode ? (
            <Moon className="h-3.5 w-3.5 text-purple-600" strokeWidth={2.5} />
          ) : (
            <Sun className="h-3.5 w-3.5 text-yellow-600" strokeWidth={2.5} fill="currentColor" />
          )}
        </span>
      </span>
    </button>
  );
};

export default DarkModeToggle;

