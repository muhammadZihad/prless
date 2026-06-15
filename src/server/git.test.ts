import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertGitRepo, createGit, getDiff, getRefs, getUntrackedFiles } from './git.js';

describe('git layer', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'prless-git-'));
    const git = createGit(dir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await writeFile(path.join(dir, 'a.ts'), 'const a = 1;\n');
    await git.add('.');
    await git.commit('init');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a git repo', async () => {
    await expect(assertGitRepo(createGit(dir))).resolves.toBeUndefined();
  });

  it('lists refs including the current branch', async () => {
    const refs = await getRefs(createGit(dir));
    expect(refs.current).toBeTruthy();
    expect(refs.branches).toContain(refs.current);
  });

  it('produces a working-tree diff for uncommitted changes', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const a = 2;\n');
    const res = await getDiff(createGit(dir), { mode: 'working', repoRoot: dir });
    expect(res.raw).toContain('a.ts');
    expect(res.raw).toContain('-const a = 1;');
    expect(res.raw).toContain('+const a = 2;');
  });

  it('lists untracked files (excluding gitignored)', async () => {
    await writeFile(path.join(dir, 'new.ts'), 'export const n = 1;\n');
    await writeFile(path.join(dir, '.gitignore'), 'ignored.ts\n');
    await writeFile(path.join(dir, 'ignored.ts'), 'secret\n');
    const untracked = await getUntrackedFiles(createGit(dir));
    expect(untracked).toContain('new.ts');
    expect(untracked).not.toContain('ignored.ts');
  });

  it('scopes the diff to the given paths', async () => {
    const git = createGit(dir);
    await writeFile(path.join(dir, 'a.ts'), 'const a = 2;\n');
    await writeFile(path.join(dir, 'b.ts'), 'const b = 2;\n');
    await git.add('.');
    await git.commit('add b');
    await writeFile(path.join(dir, 'a.ts'), 'const a = 3;\n');
    await writeFile(path.join(dir, 'b.ts'), 'const b = 3;\n');

    const scoped = await getDiff(createGit(dir), {
      mode: 'working',
      repoRoot: dir,
      paths: ['a.ts'],
    });
    expect(scoped.raw).toContain('a.ts');
    expect(scoped.raw).not.toContain('b.ts');
  });

  it('always renders untracked file contents in working mode', async () => {
    await writeFile(path.join(dir, 'new.ts'), 'export const n = 1;\n');
    const res = await getDiff(createGit(dir), { mode: 'working', repoRoot: dir });
    // Rendered as a synthetic new-file diff.
    expect(res.raw).toContain('new.ts');
    expect(res.raw).toContain('+export const n = 1;');
  });
});
