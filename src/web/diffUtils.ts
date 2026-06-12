import { getChangeKey, type ChangeData, type FileData } from 'react-diff-view';
import type { DiffSide } from '../shared/types';

// Re-export the library types under the names the rest of the app uses.
export type Change = ChangeData;
export type FileDiff = FileData;

export interface Anchor {
  side: DiffSide;
  line: number;
}

/** The repo-relative path we attach comments to (prefer the new path). */
export function filePath(file: FileDiff): string {
  return file.type === 'delete' ? file.oldPath : file.newPath;
}

/** Map a diff change to a (side, line) anchor. */
export function changeAnchor(change: Change): Anchor {
  if (change.type === 'delete') {
    return { side: 'old', line: change.lineNumber };
  }
  if (change.type === 'insert') {
    return { side: 'new', line: change.lineNumber };
  }
  // normal (context) line — anchor to the new side.
  return { side: 'new', line: change.newLineNumber };
}

/** Strip the leading +/-/space marker from a change's content. */
export function changeText(change: Change): string {
  return change.content.replace(/^[+\- ]/, '');
}

/**
 * Build an index from "side:line" -> react-diff-view change key for one file,
 * so stored comments (anchored by side+line) can be re-attached as widgets.
 */
export function buildChangeKeyIndex(file: FileDiff): Map<string, string> {
  const index = new Map<string, string>();
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      const anchor = changeAnchor(change);
      index.set(`${anchor.side}:${anchor.line}`, getChangeKey(change));
    }
  }
  return index;
}

export function anchorKey(side: DiffSide, line: number): string {
  return `${side}:${line}`;
}

/** Map "side:line" -> the current text at that anchor, for drift detection. */
export function buildChangeTextIndex(file: FileDiff): Map<string, string> {
  const index = new Map<string, string>();
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      const anchor = changeAnchor(change);
      index.set(`${anchor.side}:${anchor.line}`, changeText(change));
    }
  }
  return index;
}

/**
 * A comment has drifted when its anchor line still exists in the diff but the
 * line's text no longer matches the snippet captured when it was written.
 * Returns false when there's nothing to compare against (no snippet, or the
 * anchor is gone — that's an orphan, handled separately).
 */
export function isDrifted(snippet: string, currentText: string | undefined): boolean {
  if (!snippet.trim() || currentText === undefined) return false;
  return snippet.trim() !== currentText.trim();
}

export interface ChangeContext {
  beforeContext: string[];
  afterContext: string[];
  hunkHeader: string;
}

/**
 * Capture durable anchor context for a change: a few lines above/below and the
 * containing hunk header. Lets a comment be re-located when line numbers shift.
 */
export function changeContext(file: FileDiff, change: Change, n = 3): ChangeContext {
  const key = getChangeKey(change);
  for (const hunk of file.hunks) {
    const idx = hunk.changes.findIndex((c) => getChangeKey(c) === key);
    if (idx === -1) continue;
    return {
      beforeContext: hunk.changes.slice(Math.max(0, idx - n), idx).map(changeText),
      afterContext: hunk.changes.slice(idx + 1, idx + 1 + n).map(changeText),
      hunkHeader: hunk.content,
    };
  }
  return { beforeContext: [], afterContext: [], hunkHeader: '' };
}
