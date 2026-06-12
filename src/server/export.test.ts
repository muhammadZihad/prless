import { describe, expect, it } from 'vitest';
import { renderReviewMarkdown } from './export.js';
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
  it('renders an empty placeholder when there are no open comments', () => {
    const md = renderReviewMarkdown([comment({ status: 'resolved' })]);
    expect(md).toContain('_No open comments._');
  });

  it('groups open comments by file, sorted by line, with line context', () => {
    const md = renderReviewMarkdown([
      comment({ id: '1', file: 'src/b.ts', line: 5, side: 'new', snippet: 'return x', body: 'guard null' }),
      comment({ id: '2', file: 'src/a.ts', line: 10, side: 'old', snippet: 'let u', body: 'rename u' }),
      comment({ id: '3', file: 'src/a.ts', line: 2, side: 'new', snippet: 'const z=1', body: 'inline this' }),
    ]);

    // Files alphabetical: a.ts before b.ts
    expect(md.indexOf('## src/a.ts')).toBeLessThan(md.indexOf('## src/b.ts'));
    // Within a.ts, line 2 before line 10
    expect(md.indexOf('Line 2 (new)')).toBeLessThan(md.indexOf('Line 10 (old)'));
    expect(md).toContain('`return x`');
    expect(md).toContain('→ guard null');
  });

  it('excludes resolved comments', () => {
    const md = renderReviewMarkdown([
      comment({ id: '1', body: 'keep me', status: 'open' }),
      comment({ id: '2', body: 'drop me', status: 'resolved' }),
    ]);
    expect(md).toContain('keep me');
    expect(md).not.toContain('drop me');
  });

  it('notes untracked files when provided', () => {
    const withNote = renderReviewMarkdown([comment({})], ['src/new.ts']);
    expect(withNote).toContain('1 untracked file was not included');
    expect(withNote).toContain('`src/new.ts`');

    const noNote = renderReviewMarkdown([comment({})]);
    expect(noNote).not.toContain('untracked');
  });
});
