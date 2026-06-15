import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIONS,
  defaultBindings,
  eventCombo,
  formatCombo,
  loadBindings,
  saveBindings,
} from './shortcuts';

describe('eventCombo', () => {
  it('builds canonical combos', () => {
    expect(eventCombo({ key: 'j' })).toBe('j');
    expect(eventCombo({ key: 'K' })).toBe('k'); // case-insensitive
    expect(eventCombo({ key: ']', metaKey: true })).toBe('mod+]');
    expect(eventCombo({ key: '[', ctrlKey: true })).toBe('mod+[');
    expect(eventCombo({ key: '?' })).toBe('?');
    expect(eventCombo({ key: ' ' })).toBe('space');
  });

  it('returns empty for modifier-only keys', () => {
    expect(eventCombo({ key: 'Shift' })).toBe('');
    expect(eventCombo({ key: 'Meta' })).toBe('');
  });
});

describe('formatCombo', () => {
  it('renders a readable label', () => {
    expect(formatCombo('j')).toBe('J');
    expect(formatCombo('?')).toBe('?');
    // platform-dependent modifier glyph, but the key is always shown
    const mod = formatCombo('mod+]');
    expect(mod).toContain(']');
    expect(/⌘|Ctrl/.test(mod)).toBe(true);
  });
});

describe('bindings persistence', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  });

  it('defaults cover every action', () => {
    const b = defaultBindings();
    for (const a of ACTIONS) expect(b[a.id]).toBe(a.defaultKey);
  });

  it('round-trips saved bindings and merges with defaults', () => {
    const b = defaultBindings();
    b.nextFile = 'n';
    saveBindings(b);
    const loaded = loadBindings();
    expect(loaded.nextFile).toBe('n');
    expect(loaded.prevFile).toBe('k'); // untouched default
  });
});
