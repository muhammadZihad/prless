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
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

export function DiffView({ file, viewType, comments, onAdd, onResolve, onDelete }: Props) {
  const path = filePath(file);
  // The line the user clicked, with the context captured for a durable anchor.
  const [activeAnchor, setActiveAnchor] = useState<{ key: string; anchor: AddAnchor } | null>(
    null,
  );

  const changeKeyIndex = useMemo(() => buildChangeKeyIndex(file), [file]);
  const changeTextIndex = useMemo(() => buildChangeTextIndex(file), [file]);

  // Open comments whose anchor line text no longer matches their stored snippet.
  const driftedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of comments) {
      if (c.status === 'resolved') continue;
      if (isDrifted(c.snippet, changeTextIndex.get(anchorKey(c.side, c.line)))) ids.add(c.id);
    }
    return ids;
  }, [comments, changeTextIndex]);

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
    for (const c of comments) {
      const key = anchorKey(c.side, c.line);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [comments]);

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
  }, [commentsByAnchor, activeAnchor, changeKeyIndex, driftedIds, path, onAdd, onResolve, onDelete]);

  const openCount = comments.filter((c) => c.status === 'open').length;

  return (
    <section className="file-diff" id={`file-${path}`}>
      <header className="file-diff-header">
        <span className="file-path">{path}</span>
        {openCount > 0 && <span className="badge">{openCount}</span>}
      </header>
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
    </section>
  );
}
