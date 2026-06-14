import { useMemo, useState } from 'react';
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
  buildChangeKeyIndex,
  buildChangeTextIndex,
  changeAnchor,
  changeContext,
  changeText,
  filePath,
  isDrifted,
  type ChangeContext,
  type FileDiff,
} from '../diffUtils';
import { CommentThread } from './CommentThread';

export interface AddAnchor extends ChangeContext {
  snippet: string;
}

interface Props {
  file: FileDiff;
  viewType: 'unified' | 'split';
  comments: Comment[];
  onAdd: (file: string, side: DiffSide, line: number, anchor: AddAnchor, body: string) => void;
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
  // The line the user clicked, with the context captured for a durable anchor.
  const [activeAnchor, setActiveAnchor] = useState<{ key: string; anchor: AddAnchor } | null>(
    null,
  );
  const [showFileComposer, setShowFileComposer] = useState(false);
  // Collapse generated/large files, but never hide one that has comments.
  const [expanded, setExpanded] = useState(!collapsedByDefault || comments.length > 0);

  // File-scoped comments render at the header; line comments anchor to the diff.
  const fileComments = useMemo(() => comments.filter((c) => c.scope === 'file'), [comments]);
  const lineComments = useMemo(() => comments.filter((c) => c.scope !== 'file'), [comments]);

  const changeKeyIndex = useMemo(() => buildChangeKeyIndex(file), [file]);
  const changeTextIndex = useMemo(() => buildChangeTextIndex(file), [file]);

  // Open comments whose anchor line text no longer matches their stored snippet.
  const driftedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of lineComments) {
      if (c.status === 'resolved') continue;
      if (isDrifted(c.snippet, changeTextIndex.get(anchorKey(c.side, c.line)))) ids.add(c.id);
    }
    return ids;
  }, [lineComments, changeTextIndex]);

  // Syntax-highlight the diff with refractor when we recognise the language.
  // Token colors come from the active [data-code-theme] (see code-themes.css).
  const tokens = useMemo(() => {
    const language = detectLanguage(path);
    if (!language || !refractor.listLanguages().includes(language)) return undefined;
    try {
      return tokenize(file.hunks, { highlight: true, refractor: refractorAdapter, language });
    } catch {
      return undefined;
    }
  }, [file, path]);

  const commentsByAnchor = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of lineComments) {
      const key = anchorKey(c.side, c.line);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [lineComments]);

  const widgets = useMemo(() => {
    const result: Record<string, React.ReactNode> = {};
    const anchorsToRender = new Set<string>([
      ...commentsByAnchor.keys(),
      ...(activeAnchor ? [activeAnchor.key] : []),
    ]);

    for (const aKey of anchorsToRender) {
      const changeKey = changeKeyIndex.get(aKey);
      if (!changeKey) continue;
      const [side, lineStr] = aKey.split(':');
      const line = Number(lineStr);
      const threadComments = commentsByAnchor.get(aKey) ?? [];

      result[changeKey] = (
        <CommentThread
          comments={threadComments}
          driftedIds={driftedIds}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          autoFocus={activeAnchor?.key === aKey}
          onAdd={(body) =>
            onAdd(
              path,
              side as DiffSide,
              line,
              activeAnchor?.anchor ?? {
                snippet: '',
                beforeContext: [],
                afterContext: [],
                hunkHeader: '',
              },
              body,
            )
          }
          onResolve={onResolve}
          onDelete={onDelete}
        />
      );
    }
    return result;
  }, [
    commentsByAnchor,
    activeAnchor,
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
          gutterEvents={{
            onClick: ({ change }) => {
              if (!change) return;
              const anchor = changeAnchor(change);
              setActiveAnchor({
                key: anchorKey(anchor.side, anchor.line),
                anchor: { snippet: changeText(change), ...changeContext(file, change) },
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
