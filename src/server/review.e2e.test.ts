import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from './index.js';
import { createGit } from './git.js';

/**
 * End-to-end coverage of the real review workflow over a temporary git repo,
 * driven through the HTTP API via fastify's inject() (no real socket needed).
 */
describe('review workflow (e2e)', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'prless-e2e-'));
    const git = createGit(dir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await writeFile(path.join(dir, 'a.ts'), 'const a = 1;\n');
    await git.add('.');
    await git.commit('init');

    // dev:true skips static-file serving; API routes are still registered.
    app = await buildServer({ repoRoot: dir, dev: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function reviewMd(): Promise<string> {
    return readFile(path.join(dir, '.prless', 'review.md'), 'utf8');
  }

  it('diffs a working-tree change, comments, and exports it', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const a = 2;\n');

    const diff = await app.inject({ method: 'GET', url: '/api/diff?mode=working' });
    expect(diff.statusCode).toBe(200);
    expect(diff.json().raw).toContain('+const a = 2;');

    const created = await app.inject({
      method: 'POST',
      url: '/api/comments',
      payload: { file: 'a.ts', line: 1, side: 'new', body: 'use a constant name', snippet: 'const a = 2;' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const exported = await app.inject({ method: 'POST', url: '/api/export' });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().count).toBe(1);

    const md = await reviewMd();
    expect(md).toContain('## a.ts');
    expect(md).toContain('use a constant name');

    // Resolving excludes the comment from a re-export.
    const resolved = await app.inject({
      method: 'PATCH',
      url: `/api/comments/${id}`,
      payload: { status: 'resolved' },
    });
    expect(resolved.statusCode).toBe(200);

    const reexport = await app.inject({ method: 'POST', url: '/api/export' });
    expect(reexport.json().count).toBe(0);
    expect(await reviewMd()).not.toContain('use a constant name');
  });

  it('serves staged and compare diffs', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const a = 3;\n');
    const git = createGit(dir);
    await git.add('.');

    const staged = await app.inject({ method: 'GET', url: '/api/diff?mode=staged' });
    expect(staged.statusCode).toBe(200);
    expect(staged.json().raw).toContain('+const a = 3;');

    await git.commit('second');
    const compare = await app.inject({
      method: 'GET',
      url: '/api/diff?mode=compare&base=HEAD~1&head=HEAD',
    });
    expect(compare.statusCode).toBe(200);
    expect(compare.json().raw).toContain('+const a = 3;');
  });

  it('reports an empty diff when there are no changes', async () => {
    const diff = await app.inject({ method: 'GET', url: '/api/diff?mode=working' });
    expect(diff.statusCode).toBe(200);
    expect(diff.json().raw.trim()).toBe('');
  });

  it('flags untracked files in the diff and the export note', async () => {
    await writeFile(path.join(dir, 'new.ts'), 'export const n = 1;\n');

    const diff = await app.inject({ method: 'GET', url: '/api/diff?mode=working' });
    expect(diff.json().untracked).toContain('new.ts');

    await app.inject({
      method: 'POST',
      url: '/api/comments',
      payload: { file: 'a.ts', line: 1, side: 'new', body: 'note' },
    });
    await app.inject({ method: 'POST', url: '/api/export' });
    expect(await reviewMd()).toContain('`new.ts`');
  });

  it('hides files matched by .prlessignore from the diff', async () => {
    const git = createGit(dir);
    await writeFile(path.join(dir, 'bundle.min.js'), 'a\n');
    await git.add('.');
    await git.commit('add bundle');
    await writeFile(path.join(dir, 'bundle.min.js'), 'b\n');
    await writeFile(path.join(dir, 'a.ts'), 'const a = 9;\n');
    await writeFile(path.join(dir, '.prlessignore'), '*.min.js\n');

    const diff = await app.inject({ method: 'GET', url: '/api/diff?mode=working' });
    const body = diff.json();
    expect(body.raw).toContain('a.ts');
    expect(body.raw).not.toContain('bundle.min.js');
    expect(body.ignored).toContain('bundle.min.js');
  });

  it('rejects an invalid comment payload with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/comments',
      payload: { file: '', line: 0, side: 'up', body: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('no-repo mode (e2e)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({ dev: true }); // no repoRoot
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports no repo selected', async () => {
    const repo = await app.inject({ method: 'GET', url: '/api/repo' });
    expect(repo.statusCode).toBe(200);
    expect(repo.json()).toEqual({ repoRoot: null, name: null });
  });

  it('returns 409 from repo-dependent endpoints', async () => {
    for (const url of ['/api/refs', '/api/diff', '/api/comments']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(409);
    }
    const exp = await app.inject({ method: 'POST', url: '/api/export' });
    expect(exp.statusCode).toBe(409);
  });
});
