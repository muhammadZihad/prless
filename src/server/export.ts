import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Comment } from '../shared/types.js';

const HEADER = `# Code Review — action required

You are addressing review comments on this repository. For each comment below,
make the requested change in the referenced file, then briefly note what you changed.
Line numbers refer to the indicated side of the diff ("new" = current file contents,
"old" = the version before the change).
`;

/**
 * Render open comments into a deterministic, agent-friendly markdown document,
 * grouped by file and ordered by line. Pure function for easy testing.
 */
export function renderReviewMarkdown(comments: Comment[]): string {
  const open = comments.filter((c) => c.status === 'open');

  if (open.length === 0) {
    return `${HEADER}\n_No open comments._\n`;
  }

  const byFile = new Map<string, Comment[]>();
  for (const c of open) {
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
      const snippet = c.snippet.trim();
      const context = snippet ? ` \`${snippet}\`` : '';
      const body = c.body.trim().replace(/\n/g, '\n    ');
      return `- **Line ${c.line} (${c.side}):**${context}\n  → ${body}`;
    });

    sections.push(`## ${file}\n\n${items.join('\n\n')}`);
  }

  return `${HEADER}\n${sections.join('\n\n')}\n`;
}

export async function exportReview(
  repoRoot: string,
  comments: Comment[],
): Promise<{ path: string; count: number; content: string }> {
  const dir = path.join(repoRoot, '.prless');
  const file = path.join(dir, 'review.md');
  const content = renderReviewMarkdown(comments);
  await mkdir(dir, { recursive: true });
  await writeFile(file, content, 'utf8');
  return { path: file, count: comments.filter((c) => c.status === 'open').length, content };
}
