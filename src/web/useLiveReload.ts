import { useEffect, useRef } from 'react';

interface Options {
  /** When false, no polling happens (e.g. no repo selected, or user turned it off). */
  enabled: boolean;
  /** Returns the current change-token; the hook compares successive values. */
  getToken: () => Promise<{ token: string }>;
  /** Called when the token changes (i.e. the working tree changed). */
  onChange: () => void;
  intervalMs?: number;
}

/**
 * Polls a cheap change-token and invokes `onChange` whenever it differs from the
 * last seen value. Paused while the tab is hidden; checks immediately on
 * visibility/focus regain. Skips a tick while a previous request is in flight.
 */
export function useLiveReload({ enabled, getToken, onChange, intervalMs = 1200 }: Options): void {
  const lastToken = useRef<string | null>(null);
  const inFlight = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) {
      lastToken.current = null; // re-baseline when re-enabled / repo changes
      return;
    }
    let cancelled = false;

    const check = async (): Promise<void> => {
      if (cancelled || inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const { token } = await getToken();
        if (cancelled) return;
        if (lastToken.current === null) {
          lastToken.current = token; // first observation establishes the baseline
        } else if (token !== lastToken.current) {
          lastToken.current = token;
          onChangeRef.current();
        }
      } catch {
        // transient (e.g. repo switching) — try again next tick
      } finally {
        inFlight.current = false;
      }
    };

    const id = window.setInterval(check, intervalMs);
    const onWake = (): void => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    void check(); // establish the baseline promptly

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [enabled, getToken, intervalMs]);
}
