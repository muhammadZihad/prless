import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Comment } from '../shared/types.js';

const HEADER = `# Code Review — action required

You are addressing review comments on this repository. For each comment below,
make the requested change in the referenced file, then briefly note what you changed.
Line numbers refer to the indicated side of the diff ("new" = current file contents,
"old" = the version before the change).
`;

/** A markdown note listing untracked files left out of the review, or '' if none. */
function untrackedNote(untracked: string[]): string {
  if (untracked.length === 0) return '';
  const list = untracked.map((f) => `> - \`${f}\``).join('\n');
  return (
    `\n> **Note:** ${untracked.length} untracked ` +
    `${untracked.length === 1 ? 'file was' : 'files were'} not included in this review ` +
    `and may also need attention:\n${list}\n`
  );
}

/**
 * An open comment is orphaned when its snippet can no longer be found anywhere
 * in the current diff — the code it referenced has moved or been removed.
 * Comments without a snippet (or when no diff is supplied) are never orphaned.
 */
function isOrphaned(c: Comment, rawDiff?: string): boolean {
  const snippet = c.snippet.trim();
  if (!snippet || rawDiff === undefined) return false;
  return !rawDiff.includes(snippet);
}

/** Render the orphaned-comments section, or '' when there are none. */
function renderOrphans(orphaned: Comment[]): string {
  if (orphaned.length === 0) return '';
  const items = orphaned
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map((c) => {
      const snippet = c.snippet.trim();
      const context = snippet ? ` \`${snippet}\`` : '';
      const body = c.body.trim().replace(/\n/g, '\n    ');
      return `- **${c.file}** (line ${c.line}, ${c.side}):${context}\n  → ${body}`;
    });
  return (
    '## Orphaned Comments\n\n' +
    'These comments could not be matched to the current diff — the code they referenced ' +
    'may have moved or been removed. Review them manually.\n\n' +
    items.join('\n\n')
  );
}

/**
 * Render open comments into a deterministic, agent-friendly markdown document,
 * grouped by file and ordered by line. When `rawDiff` is supplied, comments
 * whose snippet is no longer present are split into an Orphaned section.
 * Pure function for easy testing.
 */
export function renderReviewMarkdown(
  comments: Comment[],
  untracked: string[] = [],
  rawDiff?: string,
): string {
  const open = comments.filter((c) => c.status === 'open');
  const note = untrackedNote(untracked);

  if (open.length === 0) {
    return `${HEADER}${note}\n_No open comments._\n`;
  }

  const attached = open.filter((c) => !isOrphaned(c, rawDiff));
  const orphaned = open.filter((c) => isOrphaned(c, rawDiff));

  const byFile = new Map<string, Comment[]>();
  for (const c of attached) {
    const bucket = byFile.get(c.file) ?? [];
    bucket.push(c);
    byFile.set(c.file, bucket);
  }

  const sections: string[] = [];
  for (const file of [...byFile.keys()].sort()) {
    const lines = byFile
      .get(file)!
      .slice()
      .sort((a, b) => a.line - b.line || a.createdAt.localeCompare(b.createdAt));

    const items = lines.map((c) => {
      const body = c.body.trim().replace(/\n/g, '\n    ');
      if (c.scope === 'file') {
        return `- **File comment:**\n  → ${body}`;
      }
      const snippet = c.snippet.trim();
      const context = snippet ? ` \`${snippet}\`` : '';
      return `- **Line ${c.line} (${c.side}):**${context}\n  → ${body}`;
    });

    sections.push(`## ${file}\n\n${items.join('\n\n')}`);
  }

  const orphanSection = renderOrphans(orphaned);
  if (orphanSection) sections.push(orphanSection);

  return `${HEADER}${note}\n${sections.join('\n\n')}\n`;
}

export async function exportReview(
  repoRoot: string,
  comments: Comment[],
  untracked: string[] = [],
  rawDiff?: string,
): Promise<{ path: string; count: number; content: string }> {
  const dir = path.join(repoRoot, '.prless');
  const file = path.join(dir, 'review.md');
  const content = renderReviewMarkdown(comments, untracked, rawDiff);
  await mkdir(dir, { recursive: true });
  await writeFile(file, content, 'utf8');
  return { path: file, count: comments.filter((c) => c.status === 'open').length, content };
}
