import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Ignore } from 'ignore';
import type { DiffMode, DiffResponse, RefsResponse } from '../shared/types.js';
import { filterDiff } from './ignore.js';

export class GitError extends Error {}

export function createGit(repoRoot: string): SimpleGit {
  return simpleGit({ baseDir: repoRoot });
}

export async function assertGitRepo(git: SimpleGit): Promise<void> {
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new GitError('Not a git repository');
  }
}

export async function getRefs(git: SimpleGit): Promise<RefsResponse> {
  const branchSummary = await git.branchLocal();
  return {
    current: branchSummary.current,
    branches: branchSummary.all,
  };
}

/**
 * List untracked files (respecting .gitignore). These never appear in a
 * `git diff`, so the UI warns the user that they are excluded from the review.
 */
export async function getUntrackedFiles(git: SimpleGit, paths: string[] = []): Promise<string[]> {
  const args = ['ls-files', '--others', '--exclude-standard'];
  if (paths.length) args.push('--', ...paths);
  const out = await git.raw(args);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Heuristic binary check: a NUL byte in the first chunk. */
function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

const MAX_UNTRACKED_BYTES = 1_000_000;

/**
 * Render an untracked file as a synthetic "new file" unified diff so it can be
 * reviewed and commented on. Empty, oversized, and binary files are skipped.
 */
async function syntheticUntrackedDiff(repoRoot: string, file: string): Promise<string> {
  let buf: Buffer;
  try {
    buf = await readFile(path.join(repoRoot, file));
  } catch {
    return '';
  }
  if (buf.length === 0 || buf.length > MAX_UNTRACKED_BYTES || isBinary(buf)) return '';

  const content = buf.toString('utf8');
  const trailingNewline = content.endsWith('\n');
  const lines = (trailingNewline ? content.slice(0, -1) : content).split('\n');
  const body = lines.map((l) => `+${l}`).join('\n');
  const noNewline = trailingNewline ? '' : '\n\\ No newline at end of file';
  return (
    `diff --git a/${file} b/${file}\n` +
    'new file mode 100644\n' +
    'index 0000000..0000000\n' +
    '--- /dev/null\n' +
    `+++ b/${file}\n` +
    `@@ -0,0 +1,${lines.length} @@\n` +
    `${body}${noNewline}\n`
  );
}

export interface DiffParams {
  mode: DiffMode;
  base?: string;
  head?: string;
  ig?: Ignore | null;
  paths?: string[];
  repoRoot?: string; // required to render untracked file contents
  /** Working mode: include unstaged changes + render untracked files (default true). */
  includeUnstaged?: boolean;
}

/**
 * Produce a unified diff for the requested mode.
 * - working: uncommitted changes — staged + unstaged vs HEAD when includeUnstaged,
 *   else staged only. Untracked files are rendered as synthetic new-file diffs
 *   when includeUnstaged (and a repoRoot is given).
 * - staged: staged changes only
 * - compare: `git diff <base> <head>` (two-dot)
 */
export async function getDiff(git: SimpleGit, params: DiffParams): Promise<DiffResponse> {
  const { mode, base, head, ig = null, paths = [], repoRoot, includeUnstaged = true } = params;
  let args: string[];

  switch (mode) {
    case 'staged':
      args = ['--staged'];
      break;
    case 'compare':
      if (!base || !head) {
        throw new GitError('compare mode requires both base and head');
      }
      args = [base, head];
      break;
    case 'working':
    default:
      // Hiding unstaged changes leaves the staged-only diff.
      args = includeUnstaged ? ['HEAD'] : ['--staged'];
      break;
  }

  // Scope the diff to the requested paths (CLI `-- <paths>`), if any.
  if (paths.length) args.push('--', ...paths);

  // Stable, machine-friendly diff output.
  let rawAll = await git.diff(['--no-color', ...args]);

  // Untracked files only matter in working mode.
  let untracked: string[] = [];
  if (mode === 'working') {
    const all = await getUntrackedFiles(git, paths);
    const visible = ig ? all.filter((f) => !ig.ignores(f)) : all;
    if (includeUnstaged && repoRoot) {
      // Render their contents into the diff instead of just warning.
      const synth = (
        await Promise.all(visible.map((f) => syntheticUntrackedDiff(repoRoot, f)))
      ).filter((s) => s.length > 0);
      if (synth.length) {
        if (rawAll && !rawAll.endsWith('\n')) rawAll += '\n';
        rawAll += synth.join('');
      }
    } else {
      // Staged-only (or no repoRoot to read): note them as not shown.
      untracked = visible;
    }
  }

  const { raw, ignored } = filterDiff(rawAll, ig);
  return { mode, base, head, raw, untracked, ignored };
}
