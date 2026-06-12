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
  changeAnchor,
  changeText,
  filePath,
  type FileDiff,
} from '../diffUtils';
import { CommentThread } from './CommentThread';

interface Props {
  file: FileDiff;
  viewType: 'unified' | 'split';
  comments: Comment[];
  onAdd: (file: string, side: DiffSide, line: number, snippet: string, body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

export function DiffView({ file, viewType, comments, onAdd, onResolve, onDelete }: Props) {
  const path = filePath(file);
  // anchorKey -> the change's raw text, so we can store a snippet when commenting.
  const [activeAnchor, setActiveAnchor] = useState<{ key: string; snippet: string } | null>(null);

  const changeKeyIndex = useMemo(() => buildChangeKeyIndex(file), [file]);

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
          autoFocus={activeAnchor?.key === aKey}
          onAdd={(body) =>
            onAdd(path, side as DiffSide, line, activeAnchor?.snippet ?? '', body)
          }
          onResolve={onResolve}
          onDelete={onDelete}
        />
      );
    }
    return result;
  }, [commentsByAnchor, activeAnchor, changeKeyIndex, path, onAdd, onResolve, onDelete]);

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
              snippet: changeText(change),
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
