import { useEffect, useRef } from 'react';

export type ActionId =
  | 'nextFile'
  | 'prevFile'
  | 'splitView'
  | 'unifiedView'
  | 'toggleSingleFile'
  | 'focusSearch'
  | 'toggleCommented'
  | 'toggleHideGenerated'
  | 'toggleTheme'
  | 'exportReview'
  | 'help';

export interface ActionDef {
  id: ActionId;
  label: string;
  defaultKey: string;
}

/** Actions in display order, with their default bindings (canonical combo strings). */
export const ACTIONS: ActionDef[] = [
  { id: 'nextFile', label: 'Next file', defaultKey: 'j' },
  { id: 'prevFile', label: 'Previous file', defaultKey: 'k' },
  { id: 'splitView', label: 'Split view', defaultKey: 'mod+]' },
  { id: 'unifiedView', label: 'Unified view', defaultKey: 'mod+[' },
  { id: 'toggleSingleFile', label: 'Toggle single-file view', defaultKey: 'f' },
  { id: 'focusSearch', label: 'Search files', defaultKey: '/' },
  { id: 'toggleCommented', label: 'Toggle “commented only”', defaultKey: 'c' },
  { id: 'toggleHideGenerated', label: 'Toggle “hide generated”', defaultKey: 'g' },
  { id: 'toggleTheme', label: 'Toggle light / dark theme', defaultKey: 't' },
  { id: 'exportReview', label: 'Export for AI', defaultKey: 'e' },
  { id: 'help', label: 'Keyboard shortcuts', defaultKey: '?' },
];

export type Bindings = Record<ActionId, string>;

const STORAGE_KEY = 'prless.shortcuts';

export function defaultBindings(): Bindings {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, a.defaultKey])) as Bindings;
}

export function loadBindings(): Bindings {
  const merged = defaultBindings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Bindings>;
      for (const a of ACTIONS) if (typeof saved[a.id] === 'string') merged[a.id] = saved[a.id]!;
    }
  } catch {
    // ignore unreadable storage
  }
  return merged;
}

export function saveBindings(bindings: Bindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // ignore unwritable storage
  }
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/** Canonical combo from a keyboard event, e.g. "j", "mod+]", "?". '' for modifier-only. */
export function eventCombo(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): string {
  if (MODIFIER_KEYS.has(e.key)) return '';
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  parts.push(e.key === ' ' ? 'space' : e.key.toLowerCase());
  return parts.join('+');
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** Human-readable combo, e.g. "mod+]" → "⌘ ]" on mac, "Ctrl ]" elsewhere. */
export function formatCombo(combo: string): string {
  const sep = isMac ? ' ' : '+';
  return combo
    .split('+')
    .map((p) => {
      if (p === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (p === 'alt') return isMac ? '⌥' : 'Alt';
      if (p === 'space') return 'Space';
      return p.length === 1 ? p.toUpperCase() : p;
    })
    .join(sep);
}

/**
 * Bind global keyboard shortcuts. Handlers and bindings are read through a ref
 * so the window listener is attached once. Shortcuts are ignored while typing
 * in an input/textarea (except modifier combos).
 */
export function useShortcuts(
  bindings: Bindings,
  handlers: Partial<Record<ActionId, () => void>>,
  enabled: boolean,
): void {
  const ref = useRef({ bindings, handlers, enabled });
  ref.current = { bindings, handlers, enabled };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = ref.current;
      if (!cur.enabled) return;

      const combo = eventCombo(e);
      if (!combo) return;

      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing && !combo.startsWith('mod+')) return;

      const match = (Object.keys(cur.bindings) as ActionId[]).find(
        (id) => cur.bindings[id] === combo,
      );
      if (!match) return;
      const handler = cur.handlers[match];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
