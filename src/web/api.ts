import type {
  Comment,
  CommentPatch,
  DiffMode,
  DiffResponse,
  ExportOptions,
  ExportResponse,
  NewComment,
  RefsResponse,
  UpdateInfo,
} from '../shared/types';

export interface RepoInfo {
  repoRoot: string | null;
  name: string | null;
}

export type RpcRequest = { id: number; op: string; payload?: unknown };
export type RpcResponse = { id: number; ok: boolean; data?: unknown; error?: string };

export interface Transport {
  request<T>(op: string, payload?: unknown): Promise<T>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

/** Transport used by the standalone web app / CLI: REST over fetch. */
export class HttpTransport implements Transport {
  async request<T>(op: string, payload?: any): Promise<T> {
    switch (op) {
      case 'repo.get':
        return json<T>(await fetch('/api/repo'));
      case 'update.get':
        return json<T>(await fetch('/api/update'));
      case 'repo.pick': {
        const res = await fetch('/api/repo/pick', { method: 'POST' });
        if (res.status === 409) return null as T; // user cancelled the dialog
        return json<T>(res);
      }
      case 'refs.get':
        return json<T>(await fetch('/api/refs'));
      case 'diff.get': {
        const params = new URLSearchParams({ mode: payload.mode });
        if (payload.base) params.set('base', payload.base);
        if (payload.head) params.set('head', payload.head);
        return json<T>(await fetch(`/api/diff?${params.toString()}`));
      }
      case 'comments.list':
        return json<T>(await fetch('/api/comments'));
      case 'comments.create':
        return json<T>(
          await fetch('/api/comments', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        );
      case 'comments.patch':
        return json<T>(
          await fetch(`/api/comments/${payload.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload.patch),
          }),
        );
      case 'comments.delete': {
        const res = await fetch(`/api/comments/${payload.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return undefined as T;
      }
      case 'export.run':
        return json<T>(
          await fetch('/api/export', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload ?? {}),
          }),
        );
      default:
        throw new Error(`unknown op: ${op}`);
    }
  }
}

/** Transport used inside the VS Code webview: postMessage RPC, id-correlated. */
export class RpcClient implements Transport {
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(private readonly post: (msg: RpcRequest) => void) {}

  request<T>(op: string, payload?: unknown): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.post({ id, op, payload });
    });
  }

  receive(msg: RpcResponse): void {
    if (!msg || typeof msg.id !== 'number') return;
    const entry = this.pending.get(msg.id);
    if (!entry) return; // unknown / stale id
    this.pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.data);
    else entry.reject(new Error(msg.error ?? 'request failed'));
  }
}

// VS Code injects acquireVsCodeApi() into the webview. typeof check never calls it.
declare function acquireVsCodeApi():
  | { postMessage(msg: unknown): void; getState(): unknown; setState(s: unknown): void }
  | undefined;

function createTransport(): Transport {
  if (typeof acquireVsCodeApi === 'function') {
    const vscode = acquireVsCodeApi()!;
    const client = new RpcClient((msg) => vscode.postMessage(msg));
    window.addEventListener('message', (e: MessageEvent) => client.receive(e.data as RpcResponse));
    return client;
  }
  return new HttpTransport();
}

export function createApi(transport: Transport) {
  return {
    getRepo: () => transport.request<RepoInfo>('repo.get'),
    getUpdate: () => transport.request<UpdateInfo>('update.get'),
    pickRepo: () => transport.request<RepoInfo | null>('repo.pick'),
    getRefs: () => transport.request<RefsResponse>('refs.get'),
    getDiff: (mode: DiffMode, base?: string, head?: string) => {
      // Omit empty base/head so both transports send the same payload: the
      // schema's base/head are min(1) optional, and '' (the UI's "unset" value
      // outside compare mode) would otherwise be rejected on the RPC path.
      const payload: { mode: DiffMode; base?: string; head?: string } = { mode };
      if (base) payload.base = base;
      if (head) payload.head = head;
      return transport.request<DiffResponse>('diff.get', payload);
    },
    getComments: () => transport.request<Comment[]>('comments.list'),
    addComment: (input: NewComment) => transport.request<Comment>('comments.create', input),
    patchComment: (id: string, patch: CommentPatch) =>
      transport.request<Comment>('comments.patch', { id, patch }),
    deleteComment: (id: string) => transport.request<void>('comments.delete', { id }),
    exportReview: (options: ExportOptions = {}) =>
      transport.request<ExportResponse>('export.run', options),
  };
}

const transport: Transport = createTransport();

export const api = createApi(transport);
