'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render a placeholder with the same dimensions to prevent layout shift
    // or render the button in a "loading" state if preferred.
    // For this design, we can render the button structure but inert or with a default state.
    // However, to match the hydration mismatch avoidance pattern, null or a skeleton is safe.
    // Given the specific CSS animations, rendering the button structure is better but we must avoid mismatch.
    // Let's return the button structure but without interactive logic initially, 
    // or just null if we are okay with it popping in. 
    // "Legacy" behavior was likely client-side only anyway.
    return (
        <button
          id="dark-mode-toggle"
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors h-10 w-10 flex items-center justify-center opacity-0"
          title="Toggle Dark Mode"
        >
        </button>
    )
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      id="dark-mode-toggle"
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors h-10 w-10 flex items-center justify-center"
      title="Toggle Dark Mode"
    >
      <div className="toggle-icon-wrapper">
        <svg
          id="sun-icon"
          className="toggle-icon h-6 w-6 text-yellow-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        <svg
          id="moon-icon"
          className="toggle-icon h-6 w-6 text-indigo-600 dark:text-indigo-300"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      </div>
    </button>
  );
}
