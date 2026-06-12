import { describe, expect, it } from 'vitest';
import { CreateCommentSchema, DiffQuerySchema, PatchCommentSchema } from './schemas.js';

describe('DiffQuerySchema', () => {
  it('defaults mode to working', () => {
    const parsed = DiffQuerySchema.parse({});
    expect(parsed.mode).toBe('working');
  });

  it('requires base and head in compare mode', () => {
    expect(DiffQuerySchema.safeParse({ mode: 'compare' }).success).toBe(false);
    expect(
      DiffQuerySchema.safeParse({ mode: 'compare', base: 'main', head: 'dev' }).success,
    ).toBe(true);
  });

  it('rejects an unknown mode', () => {
    expect(DiffQuerySchema.safeParse({ mode: 'sideways' }).success).toBe(false);
  });
});

describe('CreateCommentSchema', () => {
  it('accepts a valid comment', () => {
    const ok = CreateCommentSchema.safeParse({ file: 'a.ts', line: 3, side: 'new', body: 'fix' });
    expect(ok.success).toBe(true);
  });

  it('rejects bad payloads', () => {
    expect(CreateCommentSchema.safeParse({ file: '', line: 3, side: 'new', body: 'x' }).success).toBe(false);
    expect(CreateCommentSchema.safeParse({ file: 'a', line: 0, side: 'new', body: 'x' }).success).toBe(false);
    expect(CreateCommentSchema.safeParse({ file: 'a', line: 1.5, side: 'new', body: 'x' }).success).toBe(false);
    expect(CreateCommentSchema.safeParse({ file: 'a', line: 1, side: 'up', body: 'x' }).success).toBe(false);
    expect(CreateCommentSchema.safeParse({ file: 'a', line: 1, side: 'new', body: '' }).success).toBe(false);
  });
});

describe('PatchCommentSchema', () => {
  it('accepts a status-only or body-only patch', () => {
    expect(PatchCommentSchema.safeParse({ status: 'resolved' }).success).toBe(true);
    expect(PatchCommentSchema.safeParse({ body: 'updated' }).success).toBe(true);
  });

  it('rejects an empty patch and bad status', () => {
    expect(PatchCommentSchema.safeParse({}).success).toBe(false);
    expect(PatchCommentSchema.safeParse({ status: 'done' }).success).toBe(false);
  });
});
