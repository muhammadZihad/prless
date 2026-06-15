import { afterEach, describe, expect, it } from 'vitest';
import { checkForUpdate, isNewer } from './update.js';

describe('isNewer', () => {
  it('compares semver major.minor.patch', () => {
    expect(isNewer('0.6.0', '0.5.0')).toBe(true);
    expect(isNewer('0.5.1', '0.5.0')).toBe(true);
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    expect(isNewer('0.5.0', '0.5.0')).toBe(false);
    expect(isNewer('0.4.0', '0.5.0')).toBe(false);
  });

  it('ignores a leading v and prerelease suffix', () => {
    expect(isNewer('v0.6.0', '0.5.0')).toBe(true);
    expect(isNewer('0.6.0-beta.1', '0.6.0')).toBe(false);
  });
});

describe('checkForUpdate', () => {
  const original = process.env.PRLESS_NO_UPDATE_CHECK;
  afterEach(() => {
    if (original === undefined) delete process.env.PRLESS_NO_UPDATE_CHECK;
    else process.env.PRLESS_NO_UPDATE_CHECK = original;
  });

  it('short-circuits to null when disabled (no network call)', async () => {
    process.env.PRLESS_NO_UPDATE_CHECK = '1';
    expect(await checkForUpdate('0.0.1')).toBeNull();
  });
});
