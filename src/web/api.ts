import type {
  Comment,
  CommentPatch,
  DiffMode,
  DiffResponse,
  ExportResponse,
  NewComment,
  RefsResponse,
} from '../shared/types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export interface RepoInfo {
  repoRoot: string | null;
  name: string | null;
}

export const api = {
  async getRepo(): Promise<RepoInfo> {
    return json(await fetch('/api/repo'));
  },

  /** Open the native folder dialog. Returns the chosen repo, or null if cancelled. */
  async pickRepo(): Promise<RepoInfo | null> {
    const res = await fetch('/api/repo/pick', { method: 'POST' });
    if (res.status === 409) return null; // user cancelled the dialog
    return json(res);
  },

  async getRefs(): Promise<RefsResponse> {
    return json(await fetch('/api/refs'));
  },

  async getDiff(mode: DiffMode, base?: string, head?: string): Promise<DiffResponse> {
    const params = new URLSearchParams({ mode });
    if (base) params.set('base', base);
    if (head) params.set('head', head);
    return json(await fetch(`/api/diff?${params.toString()}`));
  },

  async getComments(): Promise<Comment[]> {
    return json(await fetch('/api/comments'));
  },

  async addComment(input: NewComment): Promise<Comment> {
    return json(
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async patchComment(id: string, patch: CommentPatch): Promise<Comment> {
    return json(
      await fetch(`/api/comments/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    );
  },

  async deleteComment(id: string): Promise<void> {
    const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  },

  async exportReview(): Promise<ExportResponse> {
    return json(await fetch('/api/export', { method: 'POST' }));
  },
};
