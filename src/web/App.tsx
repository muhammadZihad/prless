import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDiff } from 'react-diff-view';
import type { Comment, DiffMode, DiffSide, RefsResponse } from '../shared/types';
import { api } from './api';
import {
  anchorKey,
  buildChangeKeyIndex,
  countChanges,
  diffStats,
  filePath,
  isGeneratedFile,
  type FileDiff,
} from './diffUtils';
import { useTheme } from './theme';
import { copyToClipboard } from './clipboard';
import {
  defaultBindings,
  loadBindings,
  saveBindings,
  useShortcuts,
  type ActionId,
  type Bindings,
} from './shortcuts';
import { DiffView, type AddAnchor } from './components/DiffView';
import { DiffFilters } from './components/DiffFilters';
import { FileList } from './components/FileList';
import { OrphanedComments } from './components/OrphanedComments';
import { RefPicker } from './components/RefPicker';
import { RepoPicker } from './components/RepoPicker';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ThemeModal } from './components/ThemeModal';
import { CodeThemeButton, ThemeToggle, ViewToggle } from './components/Controls';
import { Toast, type ToastState } from './components/Toast';
import { usePersistedState } from './settings';

export function App() {
  const [repo, setRepo] = useState<{ repoRoot: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const [refs, setRefs] = useState<RefsResponse | null>(null);
  const [mode, setMode] = useState<DiffMode>('working');
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [raw, setRaw] = useState('');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  // Remembered across reloads.
  const [viewType, setViewType] = usePersistedState<'unified' | 'split'>('prless:view-type', 'split');
  const [hideGenerated, setHideGenerated] = usePersistedState('prless:hide-generated', false);
  const [singleFile, setSingleFile] = usePersistedState('prless:single-file', false);
  const [sidebarWidth, setSidebarWidth] = usePersistedState('prless:sidebar-width', 290);
  const [resizing, setResizing] = useState(false);
  const [fileQuery, setFileQuery] = useState('');
  const [commentedOnly, setCommentedOnly] = useState(false);
  const [largeDismissed, setLargeDismissed] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [error, setError] = useState<string>('');
  const [exported, setExported] = useState(false);
  const [bindings, setBindings] = useState<Bindings>(loadBindings);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { appTheme, codeTheme, setCodeTheme, toggleAppTheme } = useTheme();

  const files = useMemo<FileDiff[]>(() => {
    if (!raw.trim()) return [];
    try {
      return parseDiff(raw);
    } catch {
      return [];
    }
  }, [raw]);

  // On load, ask the server whether a repo is already selected.
  useEffect(() => {
    api
      .getRepo()
      .then((r) => {
        if (r.repoRoot) setRepo({ repoRoot: r.repoRoot, name: r.name ?? r.repoRoot });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setReady(true));
  }, []);

  // Reflect the active repo in the browser tab title.
  useEffect(() => {
    document.title = repo ? `${repo.name} · PRless` : 'PRless';
  }, [repo]);

  // Load refs + comments whenever the active repo changes.
  useEffect(() => {
    if (!repo) return;
    api.getRefs().then(setRefs).catch((e) => setError(String(e)));
    api.getComments().then(setComments).catch((e) => setError(String(e)));
  }, [repo]);

  const handlePickRepo = useCallback(async () => {
    setError('');
    setPicking(true);
    try {
      const r = await api.pickRepo();
      if (r?.repoRoot) {
        setRepo({ repoRoot: r.repoRoot, name: r.name ?? r.repoRoot });
        // Reset view state for the freshly selected repo.
        setMode('working');
        setBase('');
        setHead('');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPicking(false);
    }
  }, []);

  const loadDiff = useCallback(async () => {
    setError('');
    if (!repo) {
      setRaw('');
      return;
    }
    if (mode === 'compare' && (!base || !head)) {
      setRaw('');
      setIgnored([]);
      return;
    }
    try {
      const res = await api.getDiff(mode, base, head);
      setRaw(res.raw);
      setIgnored(res.ignored ?? []);
    } catch (e) {
      setError(String(e));
      setRaw('');
      setIgnored([]);
    }
  }, [repo, mode, base, head]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  // On a reload, the diff loads async — so the browser can't honor a
  // `#file-<path>` hash at first paint. Once the diff has rendered, scroll the
  // hashed file into view (once).
  const scrolledToHash = useRef(false);
  useEffect(() => {
    if (scrolledToHash.current || files.length === 0) return;
    const hash = decodeURIComponent(window.location.hash);
    if (!hash.startsWith('#file-')) return;
    scrolledToHash.current = true;
    const id = hash.slice(1);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
  }, [files]);

  // A prior export is stale once comments change, so reset the button.
  useEffect(() => {
    setExported(false);
  }, [comments]);

  const handleAdd = useCallback(
    async (
      file: string,
      side: DiffSide,
      line: number,
      endLine: number | undefined,
      anchor: AddAnchor,
      body: string,
    ) => {
      try {
        const created = await api.addComment({
          file,
          side,
          line,
          endLine,
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

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const res = await api.exportReview({
        commentIds: selectedIds.size ? [...selectedIds] : undefined,
      });
      if (res.count === 0) {
        setToast({ message: 'No comments to export.', tone: 'error' });
        return;
      }
      const copied = await copyToClipboard(res.content);
      setExported(true);
      setToast(
        copied
          ? {
              message: `Exported ${res.count} comment${res.count === 1 ? '' : 's'} — copied to your clipboard.`,
              tone: 'success',
            }
          : { message: `Clipboard blocked. Open ${res.path} and paste it to your agent.`, tone: 'error' },
      );
    } catch (e) {
      setError(String(e));
    }
  }, [selectedIds]);

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

  // Files that carry at least one comment (any status).
  const commentedFiles = useMemo(() => new Set(comments.map((c) => c.file)), [comments]);

  // Apply the search box + "commented only" + "hide generated" filters.
  const visibleFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    return files.filter((f) => {
      const path = filePath(f);
      if (q && !path.toLowerCase().includes(q)) return false;
      if (hideGenerated && isGeneratedFile(path)) return false;
      if (commentedOnly && !commentedFiles.has(path)) return false;
      return true;
    });
  }, [files, fileQuery, hideGenerated, commentedOnly, commentedFiles]);

  // In single-file mode, render only the chosen file (default to the first visible one).
  const effectiveActive = useMemo(() => {
    if (!singleFile || visibleFiles.length === 0) return null;
    const stillVisible = visibleFiles.some((f) => filePath(f) === activeFile);
    return stillVisible ? activeFile : filePath(visibleFiles[0]);
  }, [singleFile, visibleFiles, activeFile]);

  const filesToRender = useMemo(
    () =>
      effectiveActive ? visibleFiles.filter((f) => filePath(f) === effectiveActive) : visibleFiles,
    [effectiveActive, visibleFiles],
  );

  // j/k navigation: move the active file and bring it into view.
  const moveFile = useCallback(
    (delta: number) => {
      const paths = visibleFiles.map(filePath);
      if (paths.length === 0) return;
      const current = (singleFile ? effectiveActive : activeFile) ?? paths[0];
      const idx = paths.indexOf(current);
      const next = paths[(((idx === -1 ? 0 : idx) + delta) % paths.length + paths.length) % paths.length];
      setActiveFile(next);
      requestAnimationFrame(() => {
        document.getElementById(`file-${next}`)?.scrollIntoView({ block: 'start' });
      });
    },
    [visibleFiles, singleFile, effectiveActive, activeFile],
  );

  const rebind = useCallback((id: ActionId, combo: string) => {
    setBindings((prev) => {
      const next = { ...prev, [id]: combo };
      saveBindings(next);
      return next;
    });
  }, []);

  const resetBindings = useCallback(() => {
    const next = defaultBindings();
    saveBindings(next);
    setBindings(next);
  }, []);

  // Drag the divider to resize the sidebar (clamped). Persisted across reloads.
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = e.currentTarget.parentElement?.firstElementChild?.getBoundingClientRect().width ?? 290;
    setResizing(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(Math.max(startWidth + (ev.clientX - startX), 180), 600);
      setSidebarWidth(next);
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  useShortcuts(
    bindings,
    {
      nextFile: () => moveFile(1),
      prevFile: () => moveFile(-1),
      splitView: () => setViewType('split'),
      unifiedView: () => setViewType('unified'),
      toggleSingleFile: () => setSingleFile((v) => !v),
      focusSearch: () => searchRef.current?.focus(),
      toggleCommented: () => setCommentedOnly((v) => !v),
      toggleHideGenerated: () => setHideGenerated((v) => !v),
      toggleTheme: () => toggleAppTheme(),
      exportReview: () => void handleExport(),
      help: () => setShortcutsOpen(true),
    },
    !shortcutsOpen,
  );

  // Warn when the whole diff is large enough to be sluggish.
  const stats = useMemo(() => diffStats(files), [files]);
  const isLargeDiff = stats.changes > 10_000 || stats.files > 75;

  if (!ready) {
    return (
      <div className="app">
        <div className="empty">Starting…</div>
      </div>
    );
  }

  if (!repo) {
    return <RepoPicker onPick={handlePickRepo} busy={picking} error={error} />;
  }

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
        <button
          className="repo-chip"
          onClick={handlePickRepo}
          disabled={picking}
          title={`${repo.repoRoot} — click to switch project`}
        >
          {repo.name}
        </button>
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
          <CodeThemeButton value={codeTheme} onClick={() => setThemeOpen(true)} />
          <ViewToggle
            viewType={viewType}
            onToggle={() => setViewType(viewType === 'split' ? 'unified' : 'split')}
          />
          <ThemeToggle theme={appTheme} onToggle={toggleAppTheme} />
          <button className="icon" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
            ⌘
          </button>
          <div className="divider" />
          <button
            className={`primary${exported ? ' is-exported' : ''}`}
            onClick={handleExport}
            title={
              selectedIds.size
                ? `Export ${selectedIds.size} selected comment(s)`
                : 'Export open comments to .prless/review.md'
            }
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
                {selectedIds.size ? 'Export selected' : 'Export for AI'}
                <span className="count-pill">{selectedIds.size || openCount}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      {ignored.length > 0 && (
        <div className="banner info">
          {ignored.length} {ignored.length === 1 ? 'file' : 'files'} hidden by{' '}
          <code>.prlessignore</code>.
        </div>
      )}

      {isLargeDiff && !largeDismissed && (
        <div className="banner warning">
          This diff has {stats.changes.toLocaleString()} changed lines across {stats.files} files.
          Consider <code>.prlessignore</code>, path filters (<code>prless open . -- src</code>), or
          the “Commented” filter to narrow it down.
          <span className="spacer" />
          <button onClick={() => setLargeDismissed(true)}>Dismiss</button>
        </div>
      )}

      <div className="layout" style={{ gridTemplateColumns: `${sidebarWidth}px 6px 1fr` }}>
        <aside>
          <div className="file-controls">
            <input
              ref={searchRef}
              className="file-search"
              type="search"
              value={fileQuery}
              placeholder="Search files…"
              aria-label="Search files"
              onChange={(e) => setFileQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') e.currentTarget.blur();
              }}
            />
            <DiffFilters
              commentedOnly={commentedOnly}
              onToggleCommented={() => setCommentedOnly((v) => !v)}
              hideGenerated={hideGenerated}
              onToggleHideGenerated={() => setHideGenerated((v) => !v)}
              singleFile={singleFile}
              onToggleSingleFile={() => setSingleFile((v) => !v)}
            />
          </div>
          <FileList
            files={visibleFiles}
            comments={comments}
            activeFile={effectiveActive}
            onSelect={singleFile ? setActiveFile : undefined}
          />
        </aside>
        <div
          className={`resizer${resizing ? ' dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={startResize}
          onDoubleClick={() => setSidebarWidth(290)}
          title="Drag to resize · double-click to reset"
        />
        <main>
          <OrphanedComments
            comments={orphanComments}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
          {filesToRender.length === 0 ? (
            <div className="empty">
              {files.length === 0
                ? 'No changes to review for this selection.'
                : 'No files match the current filters.'}
            </div>
          ) : (
            filesToRender.map((file) => {
              const path = filePath(file);
              const fileComments = commentsForFile(path);
              const generated = isGeneratedFile(path);
              const large = countChanges(file) > 500;
              const collapsedByDefault = (generated || large) && fileComments.length === 0;
              return (
                <DiffView
                  key={path}
                  file={file}
                  viewType={viewType}
                  comments={fileComments}
                  collapsedByDefault={collapsedByDefault}
                  collapseReason={generated ? 'Generated file' : large ? 'Large file' : undefined}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onAdd={handleAdd}
                  onAddFile={handleAddFile}
                  onResolve={handleResolve}
                  onDelete={handleDelete}
                />
              );
            })
          )}
        </main>
      </div>

      {themeOpen && (
        <ThemeModal
          value={codeTheme}
          appTheme={appTheme}
          onSelect={setCodeTheme}
          onClose={() => setThemeOpen(false)}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsModal
          bindings={bindings}
          onRebind={rebind}
          onReset={resetBindings}
          onClose={() => setShortcutsOpen(false)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
