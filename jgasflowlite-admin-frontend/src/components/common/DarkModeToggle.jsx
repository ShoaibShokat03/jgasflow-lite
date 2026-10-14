// src/components/common/DarkModeToggle.jsx
import React from "react";
import { Moon, Sun } from "lucide-react";
import { useDarkMode } from "../../contexts/DarkModeContext";

const DarkModeToggle = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  return (
    <button
      onClick={toggleDarkMode}
      title={isDarkMode ? "Light mode" : "Dark mode"}
      aria-label="Toggle dark mode"
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      {isDarkMode ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
};

export default DarkModeToggle;
