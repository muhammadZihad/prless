import { useEffect, useMemo, useRef, useState } from 'react';
import { Diff, Hunk, tokenize } from 'react-diff-view';
import { refractor } from 'refractor';
import type { Comment, DiffSide } from '../../shared/types';

// react-diff-view 3.x expects refractor v3's `highlight()` (returns an array of
// hast nodes). refractor v4 returns a hast `Root`, so unwrap `.children`.
const refractorAdapter = {
  highlight: (value: string, language: string) => refractor.highlight(value, language).children,
} as unknown as typeof refractor;
import { detectLanguage } from '../codeThemes';
import {
  anchorKey,
  buildAnchorInfo,
  buildChangeKeyIndex,
  buildChangeTextIndex,
  changeAnchor,
  filePath,
  isDrifted,
  type AnchorInfo,
  type FileDiff,
} from '../diffUtils';
import { CommentThread } from './CommentThread';

export type AddAnchor = AnchorInfo;

const EMPTY_ANCHOR: AddAnchor = { snippet: '', beforeContext: [], afterContext: [], hunkHeader: '' };

/** An in-progress line selection. `anchor` is where it started; start/end are normalized. */
interface Selection {
  side: DiffSide;
  anchor: number;
  start: number;
  end: number;
}

interface Props {
  file: FileDiff;
  viewType: 'unified' | 'split';
  comments: Comment[];
  onAdd: (
    file: string,
    side: DiffSide,
    line: number,
    endLine: number | undefined,
    anchor: AddAnchor,
    body: string,
  ) => void;
  onAddFile: (file: string, body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  collapsedByDefault?: boolean; // generated/large files start collapsed
  collapseReason?: string; // why it's collapsed (shown in the placeholder)
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function DiffView({
  file,
  viewType,
  comments,
  onAdd,
  onAddFile,
  onResolve,
  onDelete,
  collapsedByDefault = false,
  collapseReason,
  selectedIds,
  onToggleSelect,
}: Props) {
  const path = filePath(file);
  // The current line selection (single line or a shift-click range).
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showFileComposer, setShowFileComposer] = useState(false);
  const [expanded, setExpanded] = useState(!collapsedByDefault || comments.length > 0);

  // Track Shift so a gutter click can extend the selection into a range.
  const shiftHeld = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = e.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  // File-scoped comments render at the header; line comments anchor to the diff.
  const fileComments = useMemo(() => comments.filter((c) => c.scope === 'file'), [comments]);
  const lineComments = useMemo(() => comments.filter((c) => c.scope !== 'file'), [comments]);

  const changeKeyIndex = useMemo(() => buildChangeKeyIndex(file), [file]);
  const changeTextIndex = useMemo(() => buildChangeTextIndex(file), [file]);
  const anchorInfo = useMemo(() => buildAnchorInfo(file), [file]);

  // Drift only applies to single-line comments (a range snippet is multi-line).
  const driftedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of lineComments) {
      if (c.status === 'resolved' || (c.endLine && c.endLine !== c.line)) continue;
      if (isDrifted(c.snippet, changeTextIndex.get(anchorKey(c.side, c.line)))) ids.add(c.id);
    }
    return ids;
  }, [lineComments, changeTextIndex]);

  const tokens = useMemo(() => {
    const language = detectLanguage(path);
    if (!language || !refractor.listLanguages().includes(language)) return undefined;
    try {
      return tokenize(file.hunks, { highlight: true, refractor: refractorAdapter, language });
    } catch {
      return undefined;
    }
  }, [file, path]);

  // Range comments anchor at their last line so the thread sits below the block.
  const commentsByAnchor = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of lineComments) {
      const key = anchorKey(c.side, c.endLine ?? c.line);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [lineComments]);

  // Build a durable anchor (block snippet + surrounding context) for a selection.
  const anchorForSelection = (sel: Selection): AddAnchor => {
    const lines: string[] = [];
    for (let ln = sel.start; ln <= sel.end; ln++) {
      const t = changeTextIndex.get(anchorKey(sel.side, ln));
      if (t !== undefined) lines.push(t);
    }
    return {
      snippet: lines.join('\n'),
      beforeContext: anchorInfo.get(anchorKey(sel.side, sel.start))?.beforeContext ?? [],
      afterContext: anchorInfo.get(anchorKey(sel.side, sel.end))?.afterContext ?? [],
      hunkHeader: anchorInfo.get(anchorKey(sel.side, sel.start))?.hunkHeader ?? '',
    };
  };

  const activeKey = selection ? anchorKey(selection.side, selection.end) : null;

  // Highlight the selected lines via react-diff-view's selectedChanges.
  const selectedChanges = useMemo(() => {
    if (!selection) return [];
    const keys: string[] = [];
    for (let ln = selection.start; ln <= selection.end; ln++) {
      const k = changeKeyIndex.get(anchorKey(selection.side, ln));
      if (k) keys.push(k);
    }
    return keys;
  }, [selection, changeKeyIndex]);

  const widgets = useMemo(() => {
    const result: Record<string, React.ReactNode> = {};
    const anchorsToRender = new Set<string>([
      ...commentsByAnchor.keys(),
      ...(activeKey ? [activeKey] : []),
    ]);

    for (const aKey of anchorsToRender) {
      const changeKey = changeKeyIndex.get(aKey);
      if (!changeKey) continue;
      const [side, lineStr] = aKey.split(':');
      const anchorLine = Number(lineStr);
      const threadComments = commentsByAnchor.get(aKey) ?? [];
      const isActive = activeKey === aKey;
      const isRange = !!selection && selection.start !== selection.end;

      result[changeKey] = (
        <CommentThread
          comments={threadComments}
          driftedIds={driftedIds}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          showComposer={isActive}
          autoFocus={isActive}
          placeholder={
            isActive && isRange && selection
              ? `Comment on lines ${selection.start}–${selection.end}…`
              : undefined
          }
          onReply={() => {
            const c0 = threadComments[0];
            const start = c0?.line ?? anchorLine;
            const end = c0?.endLine ?? start;
            setSelection({ side: side as DiffSide, anchor: start, start, end });
          }}
          onCancel={() => setSelection(null)}
          onAdd={(body) => {
            if (selection) {
              const start = Math.min(selection.start, selection.end);
              const end = Math.max(selection.start, selection.end);
              onAdd(
                path,
                selection.side,
                start,
                start === end ? undefined : end,
                anchorForSelection(selection),
                body,
              );
            }
            setSelection(null);
          }}
          onResolve={onResolve}
          onDelete={onDelete}
        />
      );
    }
    return result;
    // anchorForSelection closes over the same indices already in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    commentsByAnchor,
    selection,
    activeKey,
    changeKeyIndex,
    driftedIds,
    selectedIds,
    onToggleSelect,
    path,
    onAdd,
    onResolve,
    onDelete,
  ]);

  const openCount = comments.filter((c) => c.status === 'open').length;

  return (
    <section className="file-diff" id={`file-${path}`}>
      <header className="file-diff-header">
        <span className="file-path">{path}</span>
        {openCount > 0 && <span className="badge">{openCount}</span>}
        <span className="spacer" />
        {collapsedByDefault && (
          <button className="file-comment-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : 'Show diff'}
          </button>
        )}
        <button className="file-comment-toggle" onClick={() => setShowFileComposer((v) => !v)}>
          {showFileComposer ? 'Cancel' : '+ File comment'}
        </button>
      </header>
      {(fileComments.length > 0 || showFileComposer) && (
        <div className="file-comments">
          <CommentThread
            comments={fileComments}
            showComposer={showFileComposer}
            autoFocus={showFileComposer}
            placeholder="Comment on this file…"
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onAdd={(body) => {
              onAddFile(path, body);
              setShowFileComposer(false);
            }}
            onCancel={() => setShowFileComposer(false)}
            onResolve={onResolve}
            onDelete={onDelete}
          />
        </div>
      )}
      {expanded ? (
        <Diff
          viewType={viewType}
          diffType={file.type}
          hunks={file.hunks}
          tokens={tokens}
          widgets={widgets}
          selectedChanges={selectedChanges}
          gutterEvents={{
            onClick: ({ change }) => {
              if (!change) return;
              const a = changeAnchor(change);
              setSelection((prev) => {
                if (shiftHeld.current && prev && prev.side === a.side) {
                  return {
                    side: a.side,
                    anchor: prev.anchor,
                    start: Math.min(prev.anchor, a.line),
                    end: Math.max(prev.anchor, a.line),
                  };
                }
                return { side: a.side, anchor: a.line, start: a.line, end: a.line };
              });
            },
          }}
        >
          {(hunks: FileDiff['hunks']) =>
            hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
          }
        </Diff>
      ) : (
        <button className="diff-collapsed" onClick={() => setExpanded(true)}>
          {collapseReason ?? 'Collapsed'} — click to show diff
        </button>
      )}
    </section>
  );
}
