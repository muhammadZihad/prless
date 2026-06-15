import { createRequire } from 'node:module';

const REGISTRY_URL = 'https://registry.npmjs.org/@muhammad_zihad%2Fprless/latest';

const pkg = createRequire(import.meta.url)('../../package.json') as {
  version: string;
  name: string;
};

export const VERSION = pkg.version;
export const PACKAGE_NAME = pkg.name;

/** True when version `a` is strictly newer than `b` (compares major.minor.patch). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('-')[0] // ignore prerelease suffix
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * Best-effort check of the npm registry for a newer published version. Returns
 * the newer version string, or null (no update / offline / opted out). Never
 * throws and never blocks for long. The only network call PRless makes; it
 * sends no data and is disabled by PRLESS_NO_UPDATE_CHECK.
 */
export async function checkForUpdate(current: string): Promise<string | null> {
  if (process.env.PRLESS_NO_UPDATE_CHECK) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version && isNewer(data.version, current) ? data.version : null;
  } catch {
    return null;
  }
}
