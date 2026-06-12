import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepoSession } from './session.js';

describe('RepoSession', () => {
  let dirs: string[] = [];

  const tempDir = async () => {
    const d = await mkdtemp(path.join(tmpdir(), 'prless-session-'));
    dirs.push(d);
    return d;
  };

  beforeEach(() => {
    dirs = [];
  });

  afterEach(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('starts with no repo', () => {
    expect(new RepoSession().current).toBeNull();
  });

  it('sets a repo with a resolved path, name, git, and store', async () => {
    const dir = await tempDir();
    const s = new RepoSession();
    const repo = s.setRepo(dir);
    expect(repo.repoRoot).toBe(path.resolve(dir));
    expect(repo.name).toBe(path.basename(dir));
    expect(repo.git).toBeDefined();
    expect(repo.store).toBeDefined();
    expect(s.current).toBe(repo);
  });

  it('switches the active repo', async () => {
    const a = await tempDir();
    const b = await tempDir();
    const s = new RepoSession();
    s.setRepo(a);
    s.setRepo(b);
    expect(s.current?.repoRoot).toBe(path.resolve(b));
  });
});
