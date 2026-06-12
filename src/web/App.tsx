import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDiff } from 'react-diff-view';
import type { Comment, DiffMode, DiffSide, RefsResponse } from '../shared/types';
import { api } from './api';
import { filePath, type FileDiff } from './diffUtils';
import { useTheme } from './theme';
import { DiffView } from './components/DiffView';
import { FileList } from './components/FileList';
import { RefPicker } from './components/RefPicker';
import { CodeThemePicker, ThemeToggle } from './components/Controls';

export function App() {
  const [refs, setRefs] = useState<RefsResponse | null>(null);
  const [mode, setMode] = useState<DiffMode>('working');
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [raw, setRaw] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewType, setViewType] = useState<'unified' | 'split'>('split');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
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
      return;
    }
    try {
      const res = await api.getDiff(mode, base, head);
      setRaw(res.raw);
    } catch (e) {
      setError(String(e));
      setRaw('');
    }
  }, [mode, base, head]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  const handleAdd = useCallback(
    async (file: string, side: DiffSide, line: number, snippet: string, body: string) => {
      try {
        const created = await api.addComment({ file, side, line, body, snippet });
        setComments((prev) => [...prev, created]);
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

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
      setStatus(`Exported ${res.count} open comment(s) → ${res.path}`);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const commentsForFile = useCallback(
    (path: string) => comments.filter((c) => c.file === path),
    [comments],
  );

  const openCount = comments.filter((c) => c.status === 'open').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden />
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
          <button className="primary" onClick={handleExport}>
            Export for AI
            <span className="count-pill">{openCount}</span>
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {status && <div className="banner info">{status}</div>}

      <div className="layout">
        <aside>
          <FileList files={files} comments={comments} />
        </aside>
        <main>
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
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            ))
          )}
        </main>
      </div>
    </div>
  );
}
