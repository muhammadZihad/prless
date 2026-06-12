import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDiff } from 'react-diff-view';
import type { Comment, DiffMode, DiffSide, RefsResponse } from '../shared/types';
import { api } from './api';
import { anchorKey, buildChangeKeyIndex, filePath, type FileDiff } from './diffUtils';
import { useTheme } from './theme';
import { copyToClipboard } from './clipboard';
import { DiffView, type AddAnchor } from './components/DiffView';
import { FileList } from './components/FileList';
import { OrphanedComments } from './components/OrphanedComments';
import { RefPicker } from './components/RefPicker';
import { CodeThemePicker, ThemeToggle } from './components/Controls';
import { Toast, type ToastState } from './components/Toast';

export function App() {
  const [refs, setRefs] = useState<RefsResponse | null>(null);
  const [mode, setMode] = useState<DiffMode>('working');
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [raw, setRaw] = useState('');
  const [untracked, setUntracked] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewType, setViewType] = useState<'unified' | 'split'>('split');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [error, setError] = useState<string>('');
  const [exported, setExported] = useState(false);
  const { appTheme, codeTheme, setCodeTheme, toggleAppTheme } = useTheme();

  const files = useMemo<FileDiff[]>(() => {
    if (!raw.trim()) return [];
    try {
      return parseDiff(raw);
    } catch {
      return [];
    }
  }, [raw]);

  useEffect(() => {
    api.getRefs().then(setRefs).catch((e) => setError(String(e)));
    api.getComments().then(setComments).catch((e) => setError(String(e)));
  }, []);

  const loadDiff = useCallback(async () => {
    setError('');
    if (mode === 'compare' && (!base || !head)) {
      setRaw('');
      setUntracked([]);
      return;
    }
    try {
      const res = await api.getDiff(mode, base, head);
      setRaw(res.raw);
      setUntracked(res.untracked ?? []);
    } catch (e) {
      setError(String(e));
      setRaw('');
      setUntracked([]);
    }
  }, [mode, base, head]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  // A prior export is stale once comments change, so reset the button.
  useEffect(() => {
    setExported(false);
  }, [comments]);

  const handleAdd = useCallback(
    async (file: string, side: DiffSide, line: number, anchor: AddAnchor, body: string) => {
      try {
        const created = await api.addComment({
          file,
          side,
          line,
          body,
          snippet: anchor.snippet,
          beforeContext: anchor.beforeContext,
          afterContext: anchor.afterContext,
          hunkHeader: anchor.hunkHeader,
        });
        setComments((prev) => [...prev, created]);
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const handleAddFile = useCallback(async (file: string, body: string) => {
    try {
      const created = await api.addComment({ file, body, scope: 'file' });
      setComments((prev) => [...prev, created]);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const handleResolve = useCallback(async (id: string, resolved: boolean) => {
    try {
      const updated = await api.patchComment(id, { status: resolved ? 'resolved' : 'open' });
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const res = await api.exportReview();
      if (res.count === 0) {
        setToast({ message: 'No open comments to export.', tone: 'error' });
        return;
      }
      // Fall back to a path-based instruction if an older server build didn't
      // return the rendered content, so we never copy a literal "undefined".
      const instructions =
        res.content && res.content.trim()
          ? res.content
          : `Address the code review comments in ${res.path}. For each comment, make the requested change in the referenced file, then briefly note what you changed.`;
      const copied = await copyToClipboard(instructions);
      setExported(true);
      setToast(
        copied
          ? {
              message: 'Instructions copied — paste them into your AI agent.',
              tone: 'success',
            }
          : {
              message: `Clipboard blocked. Open ${res.path} and paste it to your agent.`,
              tone: 'error',
            },
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const commentsForFile = useCallback(
    (path: string) => comments.filter((c) => c.file === path),
    [comments],
  );

  // Map each diffed file to the set of anchors present in the current diff.
  const anchoredByFile = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const f of files) {
      const keys = new Set<string>(buildChangeKeyIndex(f).keys());
      map.set(filePath(f), keys);
    }
    return map;
  }, [files]);

  // Open comments whose anchor no longer exists anywhere in the current diff.
  // Only meaningful once a diff has loaded, so don't flag when there are no files.
  const orphanComments = useMemo(() => {
    if (files.length === 0) return [];
    return comments.filter(
      (c) =>
        c.status === 'open' &&
        c.scope !== 'file' && // file comments aren't line-anchored, so never orphaned
        !anchoredByFile.get(c.file)?.has(anchorKey(c.side, c.line)),
    );
  }, [comments, anchoredByFile, files]);

  const openCount = comments.filter((c) => c.status === 'open').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M6 21V9a9 9 0 0 0 9 9" />
            </svg>
          </span>
          <h1>PRless</h1>
        </div>
        <div className="divider" />
        <RefPicker
          refs={refs}
          mode={mode}
          base={base}
          head={head}
          onChange={(m, b, h) => {
            setMode(m);
            setBase(b);
            setHead(h);
          }}
        />
        <div className="spacer" />
        <div className="toolset">
          <CodeThemePicker value={codeTheme} onChange={setCodeTheme} />
          <button
            onClick={() => setViewType((v) => (v === 'split' ? 'unified' : 'split'))}
            title="Toggle split / unified view"
          >
            {viewType === 'split' ? 'Split' : 'Unified'}
          </button>
          <ThemeToggle theme={appTheme} onToggle={toggleAppTheme} />
          <div className="divider" />
          <button
            className={`primary${exported ? ' is-exported' : ''}`}
            onClick={handleExport}
          >
            {exported ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Exported
              </>
            ) : (
              <>
                Export for AI
                <span className="count-pill">{openCount}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      {untracked.length > 0 && (
        <div className="banner warning">
          {untracked.length} untracked {untracked.length === 1 ? 'file is' : 'files are'} not
          included in this review. Run <code>git add -N &lt;file&gt;</code> to include{' '}
          {untracked.length === 1 ? 'it' : 'them'}.
        </div>
      )}

      <div className="layout">
        <aside>
          <FileList files={files} comments={comments} />
        </aside>
        <main>
          <OrphanedComments
            comments={orphanComments}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
          {files.length === 0 ? (
            <div className="empty">No changes to review for this selection.</div>
          ) : (
            files.map((file) => (
              <DiffView
                key={filePath(file)}
                file={file}
                viewType={viewType}
                comments={commentsForFile(filePath(file))}
                onAdd={handleAdd}
                onAddFile={handleAddFile}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            ))
          )}
        </main>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
