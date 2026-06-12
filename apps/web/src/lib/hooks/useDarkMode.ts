import { useState } from 'react';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('dosuxsoft-theme', next ? 'dark' : 'light');
    setIsDark(next);
  }

  return { isDark, toggle };
}
