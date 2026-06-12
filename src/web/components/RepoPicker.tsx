interface Props {
  onPick: () => void;
  busy: boolean;
  error?: string;
}

/** Full-screen empty state shown when no repository is selected. */
export function RepoPicker({ onPick, busy, error }: Props) {
  return (
    <div className="repo-picker">
      <div className="repo-picker-card">
        <span className="mark" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M6 21V9a9 9 0 0 0 9 9" />
          </svg>
        </span>
        <h1>No project selected</h1>
        <p>Choose a git repository to review its local changes.</p>
        <button className="primary" onClick={onPick} disabled={busy}>
          {busy ? 'Opening…' : 'Select project'}
        </button>
        {error && <p className="repo-picker-error">{error}</p>}
        <p className="repo-picker-hint">
          Or start from a path: <code>prless open ~/projects/my-app</code>
        </p>
      </div>
    </div>
  );
}
