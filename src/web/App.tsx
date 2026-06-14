import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDiff } from 'react-diff-view';
import type {
  Comment,
  DiffMode,
  DiffSide,
  ExportFormat,
  ExportProfile,
  RefsResponse,
} from '../shared/types';
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
import { DiffView, type AddAnchor } from './components/DiffView';
import { FileList } from './components/FileList';
import { OrphanedComments } from './components/OrphanedComments';
import { RefPicker } from './components/RefPicker';
import { RepoPicker } from './components/RepoPicker';
import { CodeThemePicker, ThemeToggle } from './components/Controls';
import { Toast, type ToastState } from './components/Toast';

export function App() {
  const [repo, setRepo] = useState<{ repoRoot: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const [refs, setRefs] = useState<RefsResponse | null>(null);
  const [mode, setMode] = useState<DiffMode>('working');
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [raw, setRaw] = useState('');
  const [untracked, setUntracked] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewType, setViewType] = useState<'unified' | 'split'>('split');
  const [fileQuery, setFileQuery] = useState('');
  const [commentedOnly, setCommentedOnly] = useState(false);
  const [hideGenerated, setHideGenerated] = useState(false);
  const [largeDismissed, setLargeDismissed] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown');
  const [exportProfile, setExportProfile] = useState<ExportProfile>('generic');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewFile, setReviewFile] = useState('.prless/review.md');
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
      setUntracked([]);
      setIgnored([]);
      return;
    }
    try {
      const res = await api.getDiff(mode, base, head);
      setRaw(res.raw);
      setUntracked(res.untracked ?? []);
      setIgnored(res.ignored ?? []);
    } catch (e) {
      setError(String(e));
      setRaw('');
      setUntracked([]);
      setIgnored([]);
    }
  }, [repo, mode, base, head]);

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
        format: exportFormat,
        profile: exportProfile,
        commentIds: selectedIds.size ? [...selectedIds] : undefined,
      });
      if (res.count === 0) {
        setToast({ message: 'No comments to export.', tone: 'error' });
        return;
      }
      setReviewFile(`.prless/${res.format === 'json' ? 'review.json' : 'review.md'}`);
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
  }, [exportFormat, exportProfile, selectedIds]);

  const handleCopyCommand = useCallback(
    async (profile: 'claude' | 'codex') => {
      const command = `${profile} "Address the review comments in ${reviewFile}"`;
      const copied = await copyToClipboard(command);
      setToast(
        copied
          ? { message: `Copied: ${command}`, tone: 'success' }
          : { message: 'Clipboard blocked — copy the command manually.', tone: 'error' },
      );
    },
    [reviewFile],
  );

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
        <input
          className="file-search"
          type="search"
          value={fileQuery}
          placeholder="Search files…"
          aria-label="Search files"
          onChange={(e) => setFileQuery(e.target.value)}
        />
        <button
          className={`toggle${commentedOnly ? ' active' : ''}`}
          onClick={() => setCommentedOnly((v) => !v)}
          title="Show only files with comments"
        >
          Commented
        </button>
        <button
          className={`toggle${hideGenerated ? ' active' : ''}`}
          onClick={() => setHideGenerated((v) => !v)}
          title="Hide generated files (lockfiles, dist/, *.min.js, …)"
        >
          Hide generated
        </button>
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
          <select
            className="export-select"
            value={exportProfile}
            onChange={(e) => setExportProfile(e.target.value as ExportProfile)}
            title="Agent profile (tunes the instruction header + command)"
            aria-label="Export profile"
          >
            <option value="generic">Generic</option>
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
            <option value="cursor">Cursor</option>
          </select>
          <select
            className="export-select"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            title="Export format"
            aria-label="Export format"
          >
            <option value="markdown">Markdown</option>
            <option value="checklist">Checklist</option>
            <option value="json">JSON</option>
          </select>
          <button
            className={`primary${exported ? ' is-exported' : ''}`}
            onClick={handleExport}
            title={selectedIds.size ? `Export ${selectedIds.size} selected comment(s)` : 'Export all open comments'}
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
          <button className="cmd-btn" onClick={() => handleCopyCommand('claude')} title="Copy a Claude Code command for the exported review">
            ⧉ Claude
          </button>
          <button className="cmd-btn" onClick={() => handleCopyCommand('codex')} title="Copy a Codex command for the exported review">
            ⧉ Codex
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

      <div className="layout">
        <aside>
          <FileList files={visibleFiles} comments={comments} />
        </aside>
        <main>
          <OrphanedComments
            comments={orphanComments}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
          {visibleFiles.length === 0 ? (
            <div className="empty">
              {files.length === 0
                ? 'No changes to review for this selection.'
                : 'No files match the current filters.'}
            </div>
          ) : (
            visibleFiles.map((file) => {
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
