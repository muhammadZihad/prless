import { describe, expect, it } from 'vitest';
import { agentCommand, buildReviewJson, renderReviewMarkdown } from './export.js';
import type { Comment } from '../shared/types.js';

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: 'id',
    file: 'src/a.ts',
    line: 1,
    side: 'new',
    snippet: '',
    body: 'do something',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('renderReviewMarkdown', () => {
  it('renders a placeholder when there are no comments to address', () => {
    const md = renderReviewMarkdown([comment({ status: 'resolved' })]);
    expect(md).toContain('_No comments to address._');
  });

  it('groups open comments by file, sorted by line, with line context', () => {
    const md = renderReviewMarkdown([
      comment({ id: '1', file: 'src/b.ts', line: 5, side: 'new', snippet: 'return x', body: 'guard null' }),
      comment({ id: '2', file: 'src/a.ts', line: 10, side: 'old', snippet: 'let u', body: 'rename u' }),
      comment({ id: '3', file: 'src/a.ts', line: 2, side: 'new', snippet: 'const z=1', body: 'inline this' }),
    ]);

    expect(md.indexOf('## src/a.ts')).toBeLessThan(md.indexOf('## src/b.ts'));
    expect(md.indexOf('Line 2 (new)')).toBeLessThan(md.indexOf('Line 10 (old)'));
    expect(md).toContain('`return x`');
    expect(md).toContain('→ guard null');
  });

  it('excludes resolved comments by default but includes them when asked', () => {
    const comments = [
      comment({ id: '1', body: 'keep me', status: 'open' }),
      comment({ id: '2', body: 'drop me', status: 'resolved' }),
    ];
    const def = renderReviewMarkdown(comments);
    expect(def).toContain('keep me');
    expect(def).not.toContain('drop me');

    const withResolved = renderReviewMarkdown(comments, { options: { includeResolved: true } });
    expect(withResolved).toContain('drop me');
  });

  it('exports only the selected comment ids', () => {
    const md = renderReviewMarkdown(
      [
        comment({ id: 'keep', body: 'selected note' }),
        comment({ id: 'skip', body: 'unselected note' }),
      ],
      { options: { commentIds: ['keep'] } },
    );
    expect(md).toContain('selected note');
    expect(md).not.toContain('unselected note');
  });

  it('includes a summary section with counts', () => {
    const md = renderReviewMarkdown([
      comment({ id: '1', file: 'a.ts' }),
      comment({ id: '2', file: 'b.ts' }),
      comment({ id: '3', status: 'resolved' }),
    ]);
    expect(md).toContain('## Summary');
    expect(md).toContain('Comments to address: 2');
    expect(md).toContain('Resolved (excluded): 1');
    expect(md).toContain('Files with comments: 2');
  });

  it('renders a checklist when format is checklist', () => {
    const md = renderReviewMarkdown([comment({ body: 'tick me' })], {
      options: { format: 'checklist' },
    });
    expect(md).toContain('- [ ] **Line 1 (new):**');
    expect(md).toContain('tick me');
  });

  it('uses a profile-specific intro', () => {
    const claude = renderReviewMarkdown([comment({})], { options: { profile: 'claude' } });
    expect(claude).toContain('Claude Code');
    const generic = renderReviewMarkdown([comment({})]);
    expect(generic).not.toContain('Claude Code');
  });

  it('notes untracked files when provided', () => {
    const withNote = renderReviewMarkdown([comment({})], { untracked: ['src/new.ts'] });
    expect(withNote).toContain('1 untracked file was not included');
    expect(withNote).toContain('`src/new.ts`');
  });

  it('splits comments whose snippet is absent from the diff into an Orphaned section', () => {
    const rawDiff = '+++ b/src/a.ts\n+const present = 1;\n';
    const md = renderReviewMarkdown(
      [
        comment({ id: '1', file: 'src/a.ts', snippet: 'const present = 1;', body: 'attached note' }),
        comment({ id: '2', file: 'src/gone.ts', snippet: 'const removed = 9;', body: 'orphan note' }),
      ],
      { rawDiff },
    );
    const orphanIdx = md.indexOf('## Orphaned Comments');
    expect(orphanIdx).toBeGreaterThan(-1);
    expect(md.indexOf('orphan note')).toBeGreaterThan(orphanIdx);
    expect(md.indexOf('attached note')).toBeLessThan(orphanIdx);
  });

  it('renders a multi-line range as "Lines X–Y"', () => {
    const md = renderReviewMarkdown([
      comment({ line: 12, endLine: 18, side: 'new', body: 'extract a helper' }),
    ]);
    expect(md).toContain('**Lines 12–18 (new):**');
    expect(md).toContain('extract a helper');
  });

  it('renders file-level comments with a marker', () => {
    const md = renderReviewMarkdown([
      comment({ scope: 'file', file: 'src/a.ts', body: 'split this module', snippet: '' }),
    ]);
    expect(md).toContain('**File comment:**');
    expect(md).toContain('split this module');
  });
});

describe('buildReviewJson', () => {
  it('produces a versioned, grouped structure with a summary', () => {
    const json = buildReviewJson(
      [
        comment({ id: '1', file: 'src/b.ts', line: 5, body: 'b note' }),
        comment({ id: '2', file: 'src/a.ts', line: 3, body: 'a note' }),
        comment({ id: '3', status: 'resolved' }),
      ],
      { options: { profile: 'codex' } },
      '2026-06-14T00:00:00.000Z',
    ) as any;

    expect(json.version).toBe(1);
    expect(json.generatedAt).toBe('2026-06-14T00:00:00.000Z');
    expect(json.profile).toBe('codex');
    expect(json.summary).toMatchObject({ open: 2, resolvedExcluded: 1, files: 2 });
    // Ordered by file then line: a.ts before b.ts.
    expect(json.comments.map((c: any) => c.file)).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('agentCommand', () => {
  it('builds an agent-specific command', () => {
    expect(agentCommand('claude')).toContain('claude "Address the review comments in .prless/review.md"');
    expect(agentCommand('codex')).toContain('codex "');
    expect(agentCommand('generic')).toBe('Address the review comments in .prless/review.md');
  });
});
