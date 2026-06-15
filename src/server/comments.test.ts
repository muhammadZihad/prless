import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('stores a multi-line range comment', async () => {
    const c = await store.add({
      file: 'a.ts',
      line: 12,
      endLine: 18,
      side: 'new',
      body: 'refactor this block',
      snippet: 'line12\nline13',
    });
    expect(c.line).toBe(12);
    expect(c.endLine).toBe(18);

    // A single-line comment (endLine == line) stays single.
    const single = await store.add({ file: 'a.ts', line: 5, endLine: 5, side: 'new', body: 'x' });
    expect(single.endLine).toBeUndefined();
  });

  it('creates a file-scoped comment without a line anchor', async () => {
    const c = await store.add({ file: 'a.ts', body: 'split this module', scope: 'file' });
    expect(c.scope).toBe('file');
    expect(c.line).toBe(0);
    expect(c.snippet).toBe('');
  });

  it('persists durable anchor context', async () => {
    const created = await store.add({
      file: 'a.ts',
      line: 5,
      side: 'new',
      body: 'check this',
      snippet: 'const a = 2;',
      beforeContext: ['line 2', 'line 3', 'line 4'],
      afterContext: ['line 6', 'line 7'],
      hunkHeader: '@@ -1,5 +1,6 @@',
    });
    expect(created.beforeContext).toEqual(['line 2', 'line 3', 'line 4']);
    expect(created.hunkHeader).toBe('@@ -1,5 +1,6 @@');

    const reread = (await new CommentStore(dir).list())[0];
    expect(reread.afterContext).toEqual(['line 6', 'line 7']);
  });

  it('persists a versioned envelope on disk', async () => {
    await store.add({ file: 'a.ts', line: 1, side: 'new', body: 'x' });
    const onDisk = JSON.parse(await readFile(path.join(dir, '.prless', 'comments.json'), 'utf8'));
    expect(onDisk.version).toBe(1);
    expect(Array.isArray(onDisk.comments)).toBe(true);
    expect(onDisk.comments).toHaveLength(1);
  });

  it('reads a legacy bare-array file and upgrades it on next save', async () => {
    const file = path.join(dir, '.prless', 'comments.json');
    await mkdir(path.dirname(file), { recursive: true });
    const legacy = [
      {
        id: 'legacy-1',
        file: 'a.ts',
        line: 2,
        side: 'new',
        snippet: '',
        body: 'old',
        status: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    await writeFile(file, JSON.stringify(legacy), 'utf8');

    expect(await store.list()).toHaveLength(1);

    // A write upgrades the file to the versioned envelope.
    await store.add({ file: 'b.ts', line: 1, side: 'new', body: 'new' });
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.version).toBe(1);
    expect(onDisk.comments).toHaveLength(2);
  });

  it('backs up a corrupted file and starts empty', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = path.join(dir, '.prless', 'comments.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{ this is not valid json', 'utf8');

    expect(await store.list()).toEqual([]);

    const entries = await readdir(path.join(dir, '.prless'));
    expect(entries.some((f) => f.startsWith('comments.corrupted.'))).toBe(true);
    errSpy.mockRestore();
  });
});
