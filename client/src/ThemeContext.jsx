import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem('mn-theme') || 'original'
  );

  function setTheme(t) {
    setThemeState(t);
    localStorage.setItem('mn-theme', t);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'original' ? '' : theme;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
