import { CODE_THEMES } from '../codeThemes';
import type { AppTheme, CodeThemeId } from '../theme';

export function ThemeToggle({ theme, onToggle }: { theme: AppTheme; onToggle: () => void }) {
  const isDark = theme === 'dark';
  return (
    <button
      className="icon"
      onClick={onToggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      aria-label="Toggle color theme"
    >
      {isDark ? (
        // moon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        // sun
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

export function CodeThemePicker({
  value,
  onChange,
}: {
  value: CodeThemeId;
  onChange: (id: CodeThemeId) => void;
}) {
  return (
    <label className="field" title="Syntax highlighting theme">
      <select
        className="select"
        value={value}
        aria-label="Syntax highlighting theme"
        onChange={(e) => onChange(e.target.value as CodeThemeId)}
      >
        {CODE_THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
