import { useEffect, useState } from 'react';
import { ACTIONS, eventCombo, formatCombo, type ActionId, type Bindings } from '../shortcuts';

interface Props {
  bindings: Bindings;
  onRebind: (id: ActionId, combo: string) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Lists keyboard shortcuts and lets the user rebind each (persisted by the caller). */
export function ShortcutsModal({ bindings, onRebind, onReset, onClose }: Props) {
  const [capturing, setCapturing] = useState<ActionId | null>(null);

  // While capturing, the next keypress becomes the new binding (Esc cancels).
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const combo = eventCombo(e);
      if (!combo) return; // wait for a non-modifier key
      onRebind(capturing, combo);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, onRebind]);

  // Esc closes the modal when not capturing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !capturing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing, onClose]);

  // Flag bindings used by more than one action.
  const counts = new Map<string, number>();
  for (const a of ACTIONS) counts.set(bindings[a.id], (counts.get(bindings[a.id]) ?? 0) + 1);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Keyboard shortcuts</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <ul className="shortcut-list">
          {ACTIONS.map((a) => {
            const combo = bindings[a.id];
            const conflict = (counts.get(combo) ?? 0) > 1;
            return (
              <li key={a.id}>
                <span className="shortcut-label">{a.label}</span>
                <button
                  className={`shortcut-key${capturing === a.id ? ' capturing' : ''}${conflict ? ' conflict' : ''}`}
                  onClick={() => setCapturing(a.id)}
                  title="Click, then press a key to rebind"
                >
                  {capturing === a.id ? 'press a key…' : formatCombo(combo)}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="modal-footer">
          <span className="hint">Click a shortcut to rebind it · Esc to close</span>
          <button onClick={onReset}>Reset to defaults</button>
        </footer>
      </div>
    </div>
  );
}
