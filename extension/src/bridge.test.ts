import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoSession, type ActiveRepo } from '../../src/server/session.js';
import { handleMessage, type BridgeDeps } from './bridge.js';

let dir: string;
let repo: ActiveRepo;
let deps: BridgeDeps;
let clipboard: string[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'prless-bridge-'));
  const { simpleGit } = await import('simple-git');
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  await git.add('.');
  await git.commit('init');
  await writeFile(path.join(dir, 'a.txt'), 'hello world\n');
  repo = new RepoSession().setRepo(dir);
  clipboard = [];
  deps = {
    getRepo: () => repo,
    pickRepo: vi.fn(async () => ({ repoRoot: repo.repoRoot, name: repo.name })),
    paths: [],
    now: () => '2026-06-24T00:00:00.000Z',
    copyToClipboard: async (t: string) => {
      clipboard.push(t);
    },
  };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('handleMessage', () => {
  it('returns repo info for repo.get', async () => {
    const res = await handleMessage({ id: 1, op: 'repo.get' }, deps);
    expect(res).toEqual({ id: 1, ok: true, data: { repoRoot: repo.repoRoot, name: repo.name } });
  });

  it('creates then lists comments', async () => {
    await handleMessage(
      { id: 2, op: 'comments.create', payload: { file: 'a.txt', line: 1, side: 'new', body: 'fix' } },
      deps,
    );
    const res = await handleMessage({ id: 3, op: 'comments.list' }, deps);
    expect(res.ok).toBe(true);
    expect((res.data as unknown[]).length).toBe(1);
  });

  it('export.run copies the review content to the clipboard', async () => {
    await handleMessage(
      { id: 4, op: 'comments.create', payload: { file: 'a.txt', line: 1, side: 'new', body: 'fix' } },
      deps,
    );
    const res = await handleMessage({ id: 5, op: 'export.run', payload: {} }, deps);
    expect(res.ok).toBe(true);
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0]).toContain('fix');
  });

  it('maps validation failure to ok:false', async () => {
    const res = await handleMessage({ id: 6, op: 'comments.create', payload: { file: '', body: '' } }, deps);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('errors with no repository selected', async () => {
    const noRepo: BridgeDeps = { ...deps, getRepo: () => null };
    const res = await handleMessage({ id: 7, op: 'refs.get' }, noRepo);
    expect(res).toEqual({ id: 7, ok: false, error: 'No repository selected.' });
  });

  it('rejects an unknown op', async () => {
    const res = await handleMessage({ id: 8, op: 'bogus.op' }, deps);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('unknown op');
  });
});
