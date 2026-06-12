import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ignore from 'ignore';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filterDiff, loadIgnore } from './ignore.js';

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  'diff --git a/dist/bundle.min.js b/dist/bundle.min.js',
  'index 333..444 100644',
  '--- a/dist/bundle.min.js',
  '+++ b/dist/bundle.min.js',
  '@@ -1 +1 @@',
  '-x',
  '+y',
  '',
].join('\n');

describe('loadIgnore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'prless-ign-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when .prlessignore is absent', async () => {
    expect(await loadIgnore(dir)).toBeNull();
  });

  it('matches gitignore-style patterns', async () => {
    await writeFile(path.join(dir, '.prlessignore'), 'dist/\n*.min.js\n# comment\n\npackage-lock.json\n');
    const ig = await loadIgnore(dir);
    expect(ig).not.toBeNull();
    expect(ig!.ignores('dist/bundle.js')).toBe(true);
    expect(ig!.ignores('a/b/c.min.js')).toBe(true);
    expect(ig!.ignores('package-lock.json')).toBe(true);
    expect(ig!.ignores('src/a.ts')).toBe(false);
  });
});

describe('filterDiff', () => {
  it('drops ignored file sections and reports them', () => {
    const ig = ignore().add(['dist/', '*.min.js']);
    const { raw, ignored } = filterDiff(RAW, ig);
    expect(ignored).toEqual(['dist/bundle.min.js']);
    expect(raw).toContain('src/a.ts');
    expect(raw).not.toContain('dist/bundle.min.js');
  });

  it('is a no-op without an ignore matcher', () => {
    const { raw, ignored } = filterDiff(RAW, null);
    expect(ignored).toEqual([]);
    expect(raw).toBe(RAW);
  });
});
