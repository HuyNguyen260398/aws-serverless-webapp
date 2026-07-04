'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ColorMode = 'light' | 'dark';

interface ColorModeContextValue {
  colorMode: ColorMode;
  toggleColorMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'todo-app-color-mode';

function getInitialColorMode(): ColorMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  // Starts unresolved (null) so the DOM/localStorage-sync effect below never
  // writes a placeholder value before the real initial preference is read.
  // Without this, React 18 Strict Mode's double-invoked effects in `next dev`
  // can permanently overwrite the real preference with the placeholder.
  const [colorMode, setColorMode] = useState<ColorMode | null>(null);

  useEffect(() => {
    setColorMode(getInitialColorMode());
  }, []);

  useEffect(() => {
    if (colorMode === null) return;
    document.documentElement.classList.toggle('dark', colorMode === 'dark');
    window.localStorage.setItem(STORAGE_KEY, colorMode);
  }, [colorMode]);

  function toggleColorMode() {
    setColorMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  return (
    <ColorModeContext.Provider value={{ colorMode: colorMode ?? 'light', toggleColorMode }}>
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider');
  return ctx;
}
