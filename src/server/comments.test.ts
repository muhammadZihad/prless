import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommentStore } from './comments.js';

describe('CommentStore', () => {
  let dir: string;
  let store: CommentStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'prless-'));
    store = new CommentStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty list before anything is written', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('adds, persists and round-trips a comment', async () => {
    const created = await store.add({ file: 'a.ts', line: 3, side: 'new', body: 'hi', snippet: 'x' });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('open');

    const reread = await new CommentStore(dir).list();
    expect(reread).toHaveLength(1);
    expect(reread[0].body).toBe('hi');
  });

  it('patches status and body', async () => {
    const created = await store.add({ file: 'a.ts', line: 1, side: 'new', body: 'orig' });
    const patched = await store.patch(created.id, { status: 'resolved', body: 'edited' });
    expect(patched?.status).toBe('resolved');
    expect(patched?.body).toBe('edited');
  });

  it('returns null when patching a missing id', async () => {
    expect(await store.patch('nope', { status: 'resolved' })).toBeNull();
  });

  it('removes a comment', async () => {
    const created = await store.add({ file: 'a.ts', line: 1, side: 'new', body: 'x' });
    expect(await store.remove(created.id)).toBe(true);
    expect(await store.list()).toEqual([]);
    expect(await store.remove(created.id)).toBe(false);
  });
});
