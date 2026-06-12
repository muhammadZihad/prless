import { useCallback, useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';
export type CodeThemeId =
  | 'auto'
  | 'github-light'
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'one-dark'
  | 'solarized-light'
  | 'monokai';

const APP_KEY = 'prless:theme';
const CODE_KEY = 'prless:code-theme';

function systemTheme(): AppTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initialAppTheme(): AppTheme {
  const stored = localStorage.getItem(APP_KEY);
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
}

export function initialCodeTheme(): CodeThemeId {
  return (localStorage.getItem(CODE_KEY) as CodeThemeId | null) ?? 'auto';
}

/** Resolve "auto" to a concrete code theme that tracks the app theme. */
export function resolveCodeTheme(code: CodeThemeId, app: AppTheme): Exclude<CodeThemeId, 'auto'> {
  if (code !== 'auto') return code;
  return app === 'dark' ? 'github-dark' : 'github-light';
}

/** Applies the chosen themes to <html> via data attributes and persists them. */
export function useTheme() {
  const [appTheme, setAppTheme] = useState<AppTheme>(initialAppTheme);
  const [codeTheme, setCodeTheme] = useState<CodeThemeId>(initialCodeTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appTheme;
    root.dataset.codeTheme = resolveCodeTheme(codeTheme, appTheme);
    localStorage.setItem(APP_KEY, appTheme);
    localStorage.setItem(CODE_KEY, codeTheme);
  }, [appTheme, codeTheme]);

  const toggleAppTheme = useCallback(() => {
    setAppTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { appTheme, codeTheme, setCodeTheme, toggleAppTheme };
}
