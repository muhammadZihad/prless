import { simpleGit, type SimpleGit } from 'simple-git';
import type { DiffMode, DiffResponse, RefsResponse } from '../shared/types.js';

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

  // Stable, machine-friendly diff output.
  const raw = await git.diff(['--no-color', ...args]);

  return { mode, base, head, raw };
}
