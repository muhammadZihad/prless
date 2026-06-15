import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

/**
 * Load `.prlessignore` (gitignore syntax) from the repo root. Returns null when
 * the file doesn't exist, so callers can treat ignoring as a no-op.
 */
export async function loadIgnore(repoRoot: string): Promise<Ignore | null> {
  try {
    const content = await readFile(path.join(repoRoot, '.prlessignore'), 'utf8');
    return ignore().add(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Extract the (new) repo-relative path from a `diff --git a/x b/y` section. */
function sectionPath(section: string): string | null {
  const first = section.split('\n', 1)[0];
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(first);
  return m ? m[2] : null;
}

/** PRless's own data dir — never shown in the diff (it changes as you review). */
export function isInternalPath(path: string): boolean {
  return /(^|\/)\.prless\//.test(path);
}

/**
 * Drop whole-file sections from a unified diff: PRless's own `.prless/` files
 * always (silently), plus anything matching `.prlessignore` (reported).
 * Returns the filtered diff text and the list of .prlessignore-matched paths.
 */
export function filterDiff(raw: string, ig: Ignore | null): { raw: string; ignored: string[] } {
  if (!raw.trim()) return { raw, ignored: [] };

  const sections: string[] = [];
  let current = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) sections.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) sections.push(current);

  const kept: string[] = [];
  const ignored: string[] = [];
  for (const section of sections) {
    const p = sectionPath(section);
    if (p && isInternalPath(p)) continue; // always drop, don't report
    if (p && ig?.ignores(p)) ignored.push(p);
    else kept.push(section);
  }
  return { raw: kept.join('\n'), ignored };
}
