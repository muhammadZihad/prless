import path from 'node:path';
import type { SimpleGit } from 'simple-git';
import { CommentStore } from './comments.js';
import { createGit } from './git.js';

export interface ActiveRepo {
  repoRoot: string;
  name: string;
  git: SimpleGit;
  store: CommentStore;
}

/**
 * Holds the repository currently being reviewed. The repo can be set at startup
 * (`prless open <path>`) or chosen later at runtime (`prless` → folder picker),
 * so it lives behind a small mutable session rather than being baked into the
 * server at build time.
 */
export class RepoSession {
  current: ActiveRepo | null = null;

  setRepo(repoRoot: string): ActiveRepo {
    const resolved = path.resolve(repoRoot);
    this.current = {
      repoRoot: resolved,
      name: path.basename(resolved),
      git: createGit(resolved),
      store: new CommentStore(resolved),
    };
    return this.current;
  }
}
