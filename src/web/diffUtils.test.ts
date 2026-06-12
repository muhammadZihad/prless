import { describe, expect, it } from 'vitest';
import { countChanges, diffStats, isDrifted, isGeneratedFile, type FileDiff } from './diffUtils';

describe('isDrifted', () => {
  it('is false when the text still matches', () => {
    expect(isDrifted('const a = 1;', 'const a = 1;')).toBe(false);
    expect(isDrifted('  const a = 1;  ', 'const a = 1;')).toBe(false); // whitespace-insensitive
  });

  it('is true when the anchor line changed', () => {
    expect(isDrifted('const a = 1;', 'const a = 2;')).toBe(true);
  });

  it('is false when there is nothing to compare', () => {
    expect(isDrifted('', 'const a = 1;')).toBe(false); // no snippet
    expect(isDrifted('const a = 1;', undefined)).toBe(false); // anchor gone (orphan, not drift)
  });
});

describe('isGeneratedFile', () => {
  it('flags lockfiles, minified, sourcemaps, and build dirs', () => {
    for (const p of [
      'package-lock.json',
      'frontend/yarn.lock',
      'public/app.min.js',
      'styles.min.css',
      'dist/index.js',
      'build/main.js',
      'coverage/lcov.info',
      'bundle.js.map',
      '__snapshots__/x.snap',
    ]) {
      expect(isGeneratedFile(p)).toBe(true);
    }
  });

  it('does not flag normal source files', () => {
    for (const p of ['src/a.ts', 'lib/util.js', 'README.md', 'app/main.css']) {
      expect(isGeneratedFile(p)).toBe(false);
    }
  });
});

describe('countChanges / diffStats', () => {
  const file = {
    hunks: [{ changes: [{ type: 'insert' }, { type: 'delete' }, { type: 'normal' }] }],
  } as unknown as FileDiff;

  it('counts inserts and deletes only', () => {
    expect(countChanges(file)).toBe(2);
    expect(diffStats([file, file])).toEqual({ files: 2, changes: 4 });
  });
});
