import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemeTokens = {
  bg: string;
  bgCard: string;
  bgHeader: string;
  bgInput: string;
  border: string;
  text: string;
  textMuted: string;
  textSecondary: string;
};

const THEME_TOKENS: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    bg: '#f5f6fa',
    bgCard: '#ffffff',
    bgHeader: '#ffffff',
    bgInput: '#f0f2f7',
    border: '#d8dbe6',
    text: '#0f172a',
    textMuted: '#4b5563',
    textSecondary: '#6b7280',
  },
  dark: {
    bg: '#0b1021',
    bgCard: '#111827',
    bgHeader: '#0f172a',
    bgInput: '#0b1120',
    border: '#1f2937',
    text: '#e5e7eb',
    textMuted: '#9ca3af',
    textSecondary: '#cbd5f5',
  },
};

type ThemeContextValue = {
  darkMode: boolean;
  tokens: ThemeTokens;
  toggleDarkMode: () => void;
};

const THEME_STORAGE_KEY = 'pco-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTokens(tokens: ThemeTokens) {
  const root = document.documentElement;
  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored ? stored === 'dark' : false;
  });

  useEffect(() => {
    const mode = darkMode ? 'dark' : 'light';
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyTokens(THEME_TOKENS[mode]);
    document.documentElement.dataset.theme = mode;
  }, [darkMode]);

  const value = useMemo<ThemeContextValue>(() => {
    const mode = darkMode ? 'dark' : 'light';
    return {
      darkMode,
      tokens: THEME_TOKENS[mode],
      toggleDarkMode: () => setDarkMode((prev) => !prev),
    };
  }, [darkMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
