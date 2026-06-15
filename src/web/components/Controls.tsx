import { codeThemeLabel } from '../codeThemes';
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

/** Toggle between split and unified diff layouts. Icon + tooltip, no text label. */
export function ViewToggle({
  viewType,
  onToggle,
}: {
  viewType: 'unified' | 'split';
  onToggle: () => void;
}) {
  const split = viewType === 'split';
  return (
    <button
      className="icon"
      onClick={onToggle}
      title={`${split ? 'Unified' : 'Split'} view`}
      aria-label={`Switch to ${split ? 'unified' : 'split'} view`}
    >
      {split ? (
        // two side-by-side panes
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="7.5" height="16" rx="1.5" />
          <rect x="13.5" y="4" width="7.5" height="16" rx="1.5" />
        </svg>
      ) : (
        // stacked rows
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M3 10h18M3 14h18" />
        </svg>
      )}
    </button>
  );
}

/** Opens the theme modal; the button label shows the current syntax theme. */
export function CodeThemeButton({ value, onClick }: { value: CodeThemeId; onClick: () => void }) {
  return (
    <button className="theme-button" onClick={onClick} title="Choose a syntax theme">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="13.5" cy="6.5" r="1.6" />
        <circle cx="17" cy="11" r="1.6" />
        <circle cx="8" cy="6.5" r="1.6" />
        <circle cx="6" cy="11.5" r="1.6" />
        <path d="M12 3a9 9 0 0 0 0 18 1.8 1.8 0 0 0 1.8-1.8c0-1 .8-1.7 1.7-1.7H17a4 4 0 0 0 4-4 9 9 0 0 0-9-10.5z" />
      </svg>
      {codeThemeLabel(value)}
    </button>
  );
}
