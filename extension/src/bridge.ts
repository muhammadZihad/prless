import type { ActiveRepo } from '../../src/server/session.js';
import { GitError } from '../../src/server/git.js';
import {
  ValidationError,
  createCommentOp,
  deleteCommentOp,
  getChangeTokenOp,
  getDiffOp,
  getRefsOp,
  listCommentsOp,
  patchCommentOp,
  runExportOp,
} from '../../src/server/engine-ops.js';

export interface BridgeDeps {
  getRepo(): ActiveRepo | null;
  pickRepo(): Promise<{ repoRoot: string; name: string } | null>;
  paths: string[];
  now(): string;
  copyToClipboard(text: string): Promise<void>;
}

export type RpcResponse = { id: number; ok: boolean; data?: unknown; error?: string };

class NoRepoError extends Error {}

export async function handleMessage(
  msg: { id: number; op: string; payload?: any },
  deps: BridgeDeps,
): Promise<RpcResponse> {
  try {
    return { id: msg.id, ok: true, data: await dispatch(msg.op, msg.payload, deps) };
  } catch (err) {
    return { id: msg.id, ok: false, error: errorMessage(err) };
  }
}

async function dispatch(op: string, payload: any, deps: BridgeDeps): Promise<unknown> {
  // Session-level ops that don't require an active repo.
  if (op === 'repo.get') {
    const r = deps.getRepo();
    return r ? { repoRoot: r.repoRoot, name: r.name } : { repoRoot: null, name: null };
  }
  if (op === 'repo.pick') return deps.pickRepo();
  // The npm update check is meaningless in the webview; the Marketplace updates the extension.
  if (op === 'update.get') return { current: '', latest: null, name: '' };

  const repo = deps.getRepo();
  if (!repo) throw new NoRepoError('No repository selected.');

  switch (op) {
    case 'refs.get':
      return getRefsOp(repo);
    case 'diff.get':
      return getDiffOp(repo, deps.paths, payload);
    case 'changes.token':
      return getChangeTokenOp(repo, deps.paths);
    case 'comments.list':
      return listCommentsOp(repo);
    case 'comments.create':
      return createCommentOp(repo, payload);
    case 'comments.patch':
      return patchCommentOp(repo, payload.id, payload.patch);
    case 'comments.delete': {
      const ok = await deleteCommentOp(repo, payload.id);
      if (!ok) throw new Error('comment not found');
      return null;
    }
    case 'export.run': {
      const res = await runExportOp(repo, deps.paths, payload, deps.now());
      await deps.copyToClipboard(res.content);
      return res;
    }
    default:
      throw new Error(`unknown op: ${op}`);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof NoRepoError || err instanceof ValidationError || err instanceof GitError) {
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
