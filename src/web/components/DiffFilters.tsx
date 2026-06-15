interface Props {
  commentedOnly: boolean;
  onToggleCommented: () => void;
  hideGenerated: boolean;
  onToggleHideGenerated: () => void;
  singleFile: boolean;
  onToggleSingleFile: () => void;
}

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Compact icon-only toggles for filtering the diff. Labels live in the tooltips. */
export function DiffFilters({
  commentedOnly,
  onToggleCommented,
  hideGenerated,
  onToggleHideGenerated,
  singleFile,
  onToggleSingleFile,
}: Props) {
  return (
    <div className="diff-filters" role="group" aria-label="Diff filters">
      <button
        className={`filter-toggle${commentedOnly ? ' active' : ''}`}
        aria-pressed={commentedOnly}
        aria-label="Show only files with comments"
        onClick={onToggleCommented}
        title="Show only files with comments"
      >
        <svg {...ICON}>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      </button>

      <button
        className={`filter-toggle${hideGenerated ? ' active' : ''}`}
        aria-pressed={hideGenerated}
        aria-label="Hide generated files"
        onClick={onToggleHideGenerated}
        title="Hide generated files (lockfiles, dist/, *.min.js, .prless/, …)"
      >
        <svg {...ICON}>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M1 1l22 22" />
        </svg>
      </button>

      <span className="diff-filters-sep" aria-hidden />

      <button
        className={`filter-toggle${singleFile ? ' active' : ''}`}
        aria-pressed={singleFile}
        aria-label={singleFile ? 'Showing one file — switch to all files' : 'Show only the selected file'}
        onClick={onToggleSingleFile}
        title={singleFile ? 'Showing one file — click for all files' : 'Show only the selected file'}
      >
        <svg {...ICON}>
          {singleFile ? (
            <rect x="4" y="4" width="16" height="16" rx="2" />
          ) : (
            <>
              <rect x="4" y="4" width="16" height="5" rx="1.5" />
              <rect x="4" y="11" width="16" height="5" rx="1.5" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
