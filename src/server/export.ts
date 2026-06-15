import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Comment, ExportFormat, ExportOptions, ExportProfile } from '../shared/types.js';

const TITLE = '# Code Review — action required';

const BASE_INSTRUCTIONS = `You are addressing line-anchored review comments exported from PRless.

For each comment below:
1. Locate the file, then find the referenced line or the nearby snippet.
2. Apply the requested change.
3. Preserve existing behavior unless the comment explicitly asks for a behavior change.
4. Do not remove or reformat unrelated code.
5. After making the changes, summarize what you changed and flag any comment you could not apply.`;

const PROFILE_INTRO: Record<ExportProfile, string> = {
  generic: '',
  claude: 'Claude Code: work through every comment below and apply each change.\n\n',
  codex: 'Codex: work through every comment below and apply each change.\n\n',
  cursor: 'Cursor: work through every comment below and apply each change.\n\n',
};

/** Shell command that hands the exported review to a given agent. */
export function agentCommand(profile: ExportProfile, reviewPath = '.prless/review.md'): string {
  const instruction = `Address the review comments in ${reviewPath}`;
  switch (profile) {
    case 'claude':
      return `claude "${instruction}"`;
    case 'codex':
      return `codex "${instruction}"`;
    case 'cursor':
      return `cursor --prompt "${instruction}"`;
    default:
      return instruction;
  }
}

function header(profile: ExportProfile): string {
  return `${TITLE}\n\n${PROFILE_INTRO[profile]}${BASE_INSTRUCTIONS}\n`;
}

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
  // For a multi-line range the snippet is joined with newlines, which never
  // appears verbatim in a +/- prefixed diff — check the first line's presence.
  const firstLine = snippet.split('\n')[0].trim();
  return firstLine.length > 0 && !rawDiff.includes(firstLine);
}

export interface RenderContext {
  options?: ExportOptions;
  untracked?: string[];
  rawDiff?: string;
}

interface Selection {
  exported: Comment[];
  resolvedExcluded: number;
}

/** Apply commentIds + includeResolved filters to the comment pool. */
function selectComments(comments: Comment[], options: ExportOptions): Selection {
  let pool = comments;
  if (options.commentIds && options.commentIds.length) {
    const ids = new Set(options.commentIds);
    pool = pool.filter((c) => ids.has(c.id));
  }
  const includeResolved = options.includeResolved ?? false;
  if (includeResolved) {
    return { exported: pool, resolvedExcluded: 0 };
  }
  return {
    exported: pool.filter((c) => c.status === 'open'),
    resolvedExcluded: pool.filter((c) => c.status === 'resolved').length,
  };
}

/** Group comments by file (sorted), each file's comments ordered by line. */
function groupByFile(comments: Comment[]): Map<string, Comment[]> {
  const byFile = new Map<string, Comment[]>();
  for (const c of comments) {
    const bucket = byFile.get(c.file) ?? [];
    bucket.push(c);
    byFile.set(c.file, bucket);
  }
  const sorted = new Map<string, Comment[]>();
  for (const file of [...byFile.keys()].sort()) {
    sorted.set(
      file,
      byFile
        .get(file)!
        .slice()
        .sort((a, b) => a.line - b.line || a.createdAt.localeCompare(b.createdAt)),
    );
  }
  return sorted;
}

function renderSummary(
  open: number,
  resolvedExcluded: number,
  files: number,
  orphaned: number,
): string {
  return [
    '## Summary',
    '',
    `- Comments to address: ${open}`,
    `- Resolved (excluded): ${resolvedExcluded}`,
    `- Files with comments: ${files}`,
    `- Orphaned comments: ${orphaned}`,
  ].join('\n');
}

/** "Line 12" or "Lines 12–18" for a range. */
function lineLabel(c: Comment): string {
  return c.endLine && c.endLine !== c.line ? `Lines ${c.line}–${c.endLine}` : `Line ${c.line}`;
}

function renderItem(c: Comment, checklist: boolean): string {
  const bullet = checklist ? '- [ ]' : '-';
  const body = c.body.trim().replace(/\n/g, '\n    ');
  if (c.scope === 'file') {
    return `${bullet} **File comment:** ${body}`;
  }
  const snippet = c.snippet.trim();
  // A range snippet is multi-line; keep the marker compact and indent it.
  const context = snippet ? (snippet.includes('\n') ? '' : ` \`${snippet}\``) : '';
  return `${bullet} **${lineLabel(c)} (${c.side}):**${context}\n  → ${body}`;
}

function renderOrphans(orphaned: Comment[], checklist: boolean): string {
  if (orphaned.length === 0) return '';
  const items = orphaned
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map((c) => {
      const bullet = checklist ? '- [ ]' : '-';
      const snippet = c.snippet.trim();
      const context = snippet && !snippet.includes('\n') ? ` \`${snippet}\`` : '';
      const body = c.body.trim().replace(/\n/g, '\n    ');
      return `${bullet} **${c.file}** (${lineLabel(c).toLowerCase()}, ${c.side}):${context}\n  → ${body}`;
    });
  return (
    '## Orphaned Comments\n\n' +
    'These comments could not be matched to the current diff — the code they referenced ' +
    'may have moved or been removed. Review them manually.\n\n' +
    items.join('\n\n')
  );
}

/**
 * Render review comments into a deterministic, agent-friendly markdown document
 * (or checklist), grouped by file. Pure function for easy testing.
 */
export function renderReviewMarkdown(comments: Comment[], ctx: RenderContext = {}): string {
  const options = ctx.options ?? {};
  const profile = options.profile ?? 'generic';
  const checklist = options.format === 'checklist';
  const { exported, resolvedExcluded } = selectComments(comments, options);
  const note = untrackedNote(ctx.untracked ?? []);

  if (exported.length === 0) {
    return `${header(profile)}${note}\n_No comments to address._\n`;
  }

  const attached = exported.filter((c) => !isOrphaned(c, ctx.rawDiff));
  const orphaned = exported.filter((c) => isOrphaned(c, ctx.rawDiff));
  const byFile = groupByFile(attached);

  const sections: string[] = [
    renderSummary(exported.length, resolvedExcluded, byFile.size, orphaned.length),
  ];
  for (const [file, lines] of byFile) {
    sections.push(`## ${file}\n\n${lines.map((c) => renderItem(c, checklist)).join('\n\n')}`);
  }
  const orphanSection = renderOrphans(orphaned, checklist);
  if (orphanSection) sections.push(orphanSection);

  return `${header(profile)}${note}\n${sections.join('\n\n')}\n`;
}

/** Build the structured JSON export object. `generatedAt` is injected for testability. */
export function buildReviewJson(
  comments: Comment[],
  ctx: RenderContext = {},
  generatedAt = '',
): Record<string, unknown> {
  const options = ctx.options ?? {};
  const { exported, resolvedExcluded } = selectComments(comments, options);
  const attached = exported.filter((c) => !isOrphaned(c, ctx.rawDiff));
  const orphaned = exported.filter((c) => isOrphaned(c, ctx.rawDiff));
  const byFile = groupByFile(attached);

  const toJson = (c: Comment) => ({
    id: c.id,
    file: c.file,
    line: c.line,
    ...(c.endLine && c.endLine !== c.line ? { endLine: c.endLine } : {}),
    side: c.side,
    scope: c.scope ?? 'line',
    snippet: c.snippet,
    body: c.body,
    status: c.status,
  });

  return {
    version: 1,
    generatedAt,
    profile: options.profile ?? 'generic',
    summary: {
      open: exported.length,
      resolvedExcluded,
      files: byFile.size,
      orphaned: orphaned.length,
    },
    // Deterministic order: grouped by file, then line.
    comments: [...byFile.values()].flat().map(toJson),
    orphaned: orphaned
      .slice()
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
      .map(toJson),
  };
}

function fileNameFor(format: ExportFormat): string {
  return format === 'json' ? 'review.json' : 'review.md';
}

export async function exportReview(
  repoRoot: string,
  comments: Comment[],
  ctx: RenderContext = {},
  generatedAt = '',
): Promise<{ path: string; count: number; format: ExportFormat; content: string }> {
  const options = ctx.options ?? {};
  const format: ExportFormat = options.format ?? 'markdown';
  const dir = path.join(repoRoot, '.prless');
  const file = path.join(dir, fileNameFor(format));

  const content =
    format === 'json'
      ? `${JSON.stringify(buildReviewJson(comments, ctx, generatedAt), null, 2)}\n`
      : renderReviewMarkdown(comments, ctx);

  await mkdir(dir, { recursive: true });
  await writeFile(file, content, 'utf8');

  const { exported } = selectComments(comments, options);
  return { path: file, count: exported.length, format, content };
}
