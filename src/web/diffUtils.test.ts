import { describe, expect, it } from 'vitest';
import { isDrifted } from './diffUtils';

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
