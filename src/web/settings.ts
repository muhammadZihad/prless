import { useEffect, useState } from 'react';

/**
 * useState backed by localStorage, so a preference is remembered across reloads.
 * Falls back to `initial` when storage is unreadable or empty.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore unwritable storage
    }
  }, [key, state]);

  return [state, setState];
}
