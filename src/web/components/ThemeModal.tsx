import { useEffect } from 'react';
import { CODE_THEMES } from '../codeThemes';
import { resolveCodeTheme, type AppTheme, type CodeThemeId } from '../theme';

interface Props {
  value: CodeThemeId;
  appTheme: AppTheme;
  onSelect: (id: CodeThemeId) => void;
  onClose: () => void;
}

/** A tiny syntax-highlighted snippet rendered in a given theme's colors. */
function ThemePreview({ themeId }: { themeId: Exclude<CodeThemeId, 'auto'> }) {
  const k = { color: 'var(--tk-keyword)' };
  const f = { color: 'var(--tk-function)' };
  const v = { color: 'var(--tk-variable)' };
  const s = { color: 'var(--tk-string)' };
  const c = { color: 'var(--tk-comment)' };
  const p = { color: 'var(--tk-punct)' };
  return (
    <pre className="theme-preview" data-code-theme={themeId}>
      <code>
        <span style={c}>{'// review'}</span>
        {'\n'}
        <span style={k}>const</span> <span style={f}>greet</span> <span style={p}>=</span>{' '}
        <span style={p}>(</span>
        <span style={v}>name</span>
        <span style={p}>)</span> <span style={p}>{'=>'}</span> <span style={s}>{'`Hi ${name}`'}</span>
        <span style={p}>;</span>
      </code>
    </pre>
  );
}

/** Theme picker as a grid of live previews. Selecting applies immediately. */
export function ThemeModal({ value, appTheme, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal theme-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Syntax theme"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Syntax theme</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="theme-grid">
          {CODE_THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-tile${t.id === value ? ' selected' : ''}`}
              onClick={() => onSelect(t.id)}
              aria-pressed={t.id === value}
            >
              <ThemePreview themeId={resolveCodeTheme(t.id, appTheme)} />
              <span className="theme-tile-label">
                {t.label}
                {t.id === value && <span className="theme-tile-check"> ✓</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
