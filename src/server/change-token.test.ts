import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGit, getChangeToken } from './git.js';

describe('getChangeToken', () => {
  let dir: string;

  const token = () => getChangeToken(createGit(dir), { repoRoot: dir });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'prless-token-'));
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

  it('is stable when nothing changes', async () => {
    expect(await token()).toBe(await token());
  });

  it('changes when an already-modified file is edited again', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const a = 22;\n');
    const t1 = await token();
    await writeFile(path.join(dir, 'a.ts'), 'const a = 3333;\n');
    expect(await token()).not.toBe(t1);
  });

  it('changes when a file is added', async () => {
    const before = await token();
    await writeFile(path.join(dir, 'b.ts'), 'export const b = 2;\n');
    expect(await token()).not.toBe(before);
  });

  it('changes when a file is removed', async () => {
    const before = await token();
    await rm(path.join(dir, 'a.ts'));
    expect(await token()).not.toBe(before);
  });

  it('changes when a file is staged', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const a = 2;\n');
    const unstaged = await token();
    await createGit(dir).add('a.ts');
    expect(await token()).not.toBe(unstaged);
  });

  it('changes when HEAD moves (commit)', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const a = 2;\n');
    const git = createGit(dir);
    await git.add('.');
    const beforeCommit = await token();
    await git.commit('second');
    expect(await token()).not.toBe(beforeCommit);
  });

  it('ignores changes under .prless/ (PRless’s own data dir)', async () => {
    const before = await token();
    await mkdir(path.join(dir, '.prless'), { recursive: true });
    await writeFile(path.join(dir, '.prless', 'comments.json'), '{"version":1,"comments":[]}\n');
    expect(await token()).toBe(before);
  });
});
