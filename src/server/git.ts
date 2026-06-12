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

/**
 * Produce a unified diff for the requested mode.
 * - working: all uncommitted changes vs HEAD (staged + unstaged)
 * - staged: staged changes only
 * - compare: `git diff <base> <head>` (two-dot)
 */
export async function getDiff(
  git: SimpleGit,
  mode: DiffMode,
  base?: string,
  head?: string,
  ig?: Ignore | null,
  paths: string[] = [],
): Promise<DiffResponse> {
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
      args = ['HEAD'];
      break;
  }

  // Scope the diff to the requested paths (CLI `-- <paths>`), if any.
  if (paths.length) args.push('--', ...paths);

  // Stable, machine-friendly diff output.
  const rawAll = await git.diff(['--no-color', ...args]);
  const { raw, ignored } = filterDiff(rawAll, ig ?? null);

  // Untracked files only matter when reviewing the working tree — staged and
  // compare modes are explicit about what they include.
  const untrackedAll = mode === 'working' ? await getUntrackedFiles(git, paths) : [];
  const untracked = ig ? untrackedAll.filter((f) => !ig.ignores(f)) : untrackedAll;

  return { mode, base, head, raw, untracked, ignored };
}
