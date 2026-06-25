import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepoSession, type ActiveRepo } from './session.js';
import {
  ValidationError,
  createCommentOp,
  listCommentsOp,
  runExportOp,
} from './engine-ops.js';

let dir: string;
let repo: ActiveRepo;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'prless-ops-'));
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
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('engine-ops', () => {
  it('creates and lists a comment', async () => {
    const created = await createCommentOp(repo, {
      file: 'a.txt',
      line: 1,
      side: 'new',
      body: 'please fix',
    });
    expect(created.id).toBeTruthy();
    const list = await listCommentsOp(repo);
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe('please fix');
  });

  it('throws ValidationError on bad comment input', async () => {
    await expect(createCommentOp(repo, { file: '', body: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('exports open comments to review.md and returns content', async () => {
    await createCommentOp(repo, { file: 'a.txt', line: 1, side: 'new', body: 'please fix' });
    const res = await runExportOp(repo, [], {}, '2026-06-24T00:00:00.000Z');
    expect(res.count).toBe(1);
    expect(res.content).toContain('please fix');
    expect(res.path).toContain(path.join('.prless', 'review.md'));
  });
});
