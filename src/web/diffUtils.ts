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

const GENERATED_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)(yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)(dist|build|coverage|node_modules|vendor|out)\//,
  /(^|\/)\.prless\//, // PRless's own comments.json / review.md / etc.
  /\.snap$/,
];

/** Heuristic: is this a generated/lockfile/minified path worth collapsing? */
export function isGeneratedFile(path: string): boolean {
  return GENERATED_PATTERNS.some((re) => re.test(path));
}

/** Total added + removed lines in a file diff. */
export function countChanges(file: FileDiff): number {
  let n = 0;
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (change.type === 'insert' || change.type === 'delete') n++;
    }
  }
  return n;
}

/** Aggregate changed-line and file counts across a set of file diffs. */
export function diffStats(files: FileDiff[]): { files: number; changes: number } {
  return {
    files: files.length,
    changes: files.reduce((sum, f) => sum + countChanges(f), 0),
  };
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

export interface AnchorInfo extends ChangeContext {
  snippet: string;
}

/**
 * Build a "side:line" -> durable anchor (snippet + surrounding context + hunk
 * header) map for a file, in a single pass. Used both when a comment is created
 * and when its composer is re-opened. Lets a comment be re-located when line
 * numbers shift.
 */
export function buildAnchorInfo(file: FileDiff, n = 3): Map<string, AnchorInfo> {
  const map = new Map<string, AnchorInfo>();
  for (const hunk of file.hunks) {
    hunk.changes.forEach((change, idx) => {
      const anchor = changeAnchor(change);
      map.set(`${anchor.side}:${anchor.line}`, {
        snippet: changeText(change),
        beforeContext: hunk.changes.slice(Math.max(0, idx - n), idx).map(changeText),
        afterContext: hunk.changes.slice(idx + 1, idx + 1 + n).map(changeText),
        hunkHeader: hunk.content,
      });
    });
  }
  return map;
}
