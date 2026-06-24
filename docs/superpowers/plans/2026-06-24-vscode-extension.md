# PRless VS Code Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a VS Code extension that runs the existing PRless React UI inside a Webview, backed by the existing review engine running in the extension host — full feature parity with the CLI/web product.

**Architecture:** Three layers, two reused. (1) The framework-agnostic engine (`src/server/{git,comments,export,ignore,session}.ts`, `src/shared/types.ts`) is funneled through a new transport-agnostic `src/server/engine-ops.ts` that **both** the Fastify routes and the extension call. (2) `src/web/api.ts` becomes a `Transport` abstraction: an HTTP impl (existing CLI/web) and a `postMessage` RPC impl (webview) — no React component changes. (3) A new `extension/` package activates in VS Code, opens an editor-area `WebviewPanel` loading the built React bundle, and runs an RPC bridge that maps webview messages to engine-ops calls.

**Tech Stack:** TypeScript (strict), Node ESM (`"type": "module"`, NodeNext `.js` import specifiers), Fastify (unchanged CLI), React 18 + Vite (`react-diff-view`), VS Code Extension API, esbuild (host bundle), Vitest.

## Global Constraints

- **Node floor:** `>=18` (matches `package.json` `engines`). VS Code `engines.vscode`: `^1.85.0`.
- **Module system:** ESM everywhere in `src/`; server/shared modules import siblings with explicit `.js` specifiers (NodeNext). New `src/server/engine-ops.ts` follows this.
- **The CLI product's behavior must not change.** `routes.ts` is refactored to delegate to `engine-ops.ts`, but every endpoint's status code, payload, and error message stay identical. `src/server/review.e2e.test.ts` is the guardrail — it must stay green.
- **The React UI changes in exactly one file** (`src/web/api.ts`) plus a one-line guard in `src/web/clipboard.ts`. No component edits.
- **Tests:** Vitest, files named `*.test.ts`, `environment: 'node'`. Existing config globs `src/**/*.test.ts`; we extend it to also glob `extension/**/*.test.ts`.
- **Extension host bundle is CJS** (`external: ['vscode']`); the ESM engine is bundled in via esbuild with a `.js`→`.ts` resolve plugin.
- **`.prless/` stays the gitignored source of truth** — `comments.json` (store) and `review.md` (export) are written exactly as today.

---

### Task 1: Extract `engine-ops.ts` and refactor `routes.ts`

Pull the per-operation logic out of `routes.ts` into a transport-agnostic module that validates input (via the existing Zod schemas) and throws typed errors. Then make `routes.ts` a thin HTTP adapter over it. No behavior change.

**Files:**
- Create: `src/server/engine-ops.ts`
- Create: `src/server/engine-ops.test.ts`
- Modify: `src/server/routes.ts` (replace the per-route bodies with `engine-ops` calls)

**Interfaces:**
- Consumes: `ActiveRepo` from `./session.js`; `getDiff`, `getRefs`, `GitError` from `./git.js`; `loadIgnore` from `./ignore.js`; `exportReview` from `./export.js`; the Zod schemas + `formatZodError` from `./schemas.js`.
- Produces (used by Task 5's bridge and by `routes.ts`):
  - `class ValidationError extends Error`
  - `getRefsOp(repo: ActiveRepo): Promise<RefsResponse>`
  - `getDiffOp(repo: ActiveRepo, paths: string[], query: unknown): Promise<DiffResponse>`
  - `listCommentsOp(repo: ActiveRepo): Promise<Comment[]>`
  - `createCommentOp(repo: ActiveRepo, body: unknown): Promise<Comment>`
  - `patchCommentOp(repo: ActiveRepo, id: string, body: unknown): Promise<Comment | null>`
  - `deleteCommentOp(repo: ActiveRepo, id: string): Promise<boolean>`
  - `runExportOp(repo: ActiveRepo, paths: string[], body: unknown, now: string): Promise<ExportResponse>`

- [ ] **Step 1: Write the failing test**

Create `src/server/engine-ops.test.ts`. This sets up a real temp git repo (mirroring the style of the existing comment/git tests) and exercises the ops directly.

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepoSession, type ActiveRepo } from './session.js';
import {
  ValidationError,
  createCommentOp,
  listCommentsOp,
  runExportOp,
} from './engine-ops.js';

let dir: string;
let repo: ActiveRepo;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'prless-ops-'));
  const { simpleGit } = await import('simple-git');
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  await git.add('.');
  await git.commit('init');
  await writeFile(path.join(dir, 'a.txt'), 'hello world\n');
  repo = new RepoSession().setRepo(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('engine-ops', () => {
  it('creates and lists a comment', async () => {
    const created = await createCommentOp(repo, {
      file: 'a.txt',
      line: 1,
      side: 'new',
      body: 'please fix',
    });
    expect(created.id).toBeTruthy();
    const list = await listCommentsOp(repo);
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe('please fix');
  });

  it('throws ValidationError on bad comment input', async () => {
    await expect(createCommentOp(repo, { file: '', body: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('exports open comments to review.md and returns content', async () => {
    await createCommentOp(repo, { file: 'a.txt', line: 1, side: 'new', body: 'please fix' });
    const res = await runExportOp(repo, [], {}, '2026-06-24T00:00:00.000Z');
    expect(res.count).toBe(1);
    expect(res.content).toContain('please fix');
    expect(res.path).toContain(path.join('.prless', 'review.md'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/engine-ops.test.ts`
Expected: FAIL — cannot resolve `./engine-ops.js` (module not found).

- [ ] **Step 3: Write `src/server/engine-ops.ts`**

```ts
import type {
  Comment,
  DiffResponse,
  ExportResponse,
  RefsResponse,
} from '../shared/types.js';
import { exportReview } from './export.js';
import { getDiff, getRefs } from './git.js';
import { loadIgnore } from './ignore.js';
import {
  CreateCommentSchema,
  DiffQuerySchema,
  ExportOptionsSchema,
  PatchCommentSchema,
  formatZodError,
} from './schemas.js';
import type { ActiveRepo } from './session.js';

/** Thrown when input fails Zod validation. Transports map this to HTTP 400. */
export class ValidationError extends Error {}

export async function getRefsOp(repo: ActiveRepo): Promise<RefsResponse> {
  return getRefs(repo.git);
}

export async function getDiffOp(
  repo: ActiveRepo,
  paths: string[],
  query: unknown,
): Promise<DiffResponse> {
  const parsed = DiffQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  const { mode, base, head } = parsed.data;
  const ig = await loadIgnore(repo.repoRoot);
  return getDiff(repo.git, { mode, base, head, ig, paths, repoRoot: repo.repoRoot });
}

export async function listCommentsOp(repo: ActiveRepo): Promise<Comment[]> {
  return repo.store.list();
}

export async function createCommentOp(repo: ActiveRepo, body: unknown): Promise<Comment> {
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  return repo.store.add(parsed.data);
}

export async function patchCommentOp(
  repo: ActiveRepo,
  id: string,
  body: unknown,
): Promise<Comment | null> {
  const parsed = PatchCommentSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  return repo.store.patch(id, parsed.data);
}

export async function deleteCommentOp(repo: ActiveRepo, id: string): Promise<boolean> {
  return repo.store.remove(id);
}

export async function runExportOp(
  repo: ActiveRepo,
  paths: string[],
  body: unknown,
  now: string,
): Promise<ExportResponse> {
  const parsed = ExportOptionsSchema.safeParse(body ?? {});
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  const ig = await loadIgnore(repo.repoRoot);
  const all = await repo.store.list();
  // Don't export comments on files hidden by .prlessignore.
  const comments = ig ? all.filter((c) => !ig.ignores(c.file)) : all;
  // Use the working-tree diff as the reference for orphan detection.
  const diff = await getDiff(repo.git, {
    mode: 'working',
    ig,
    paths,
    repoRoot: repo.repoRoot,
  });
  return exportReview(repo.repoRoot, comments, { options: parsed.data, rawDiff: diff.raw }, now);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/engine-ops.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `src/server/routes.ts` to delegate to engine-ops**

Replace the whole file with this thin adapter. `requireRepo` (409) and the per-route status codes (201/204/404) are preserved; `ValidationError` and `GitError` both map to 400, exactly as the inline `safeParse`/`GitError` handling did before.

```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import { GitError, createGit } from './git.js';
import { pickFolder, PickerUnavailableError } from './picker.js';
import { checkForUpdate, PACKAGE_NAME, VERSION } from './update.js';
import {
  ValidationError,
  createCommentOp,
  deleteCommentOp,
  getDiffOp,
  getRefsOp,
  listCommentsOp,
  patchCommentOp,
  runExportOp,
} from './engine-ops.js';
import type { ActiveRepo, RepoSession } from './session.js';

export interface ApiContext {
  session: RepoSession;
  paths: string[]; // limit the review to these paths (CLI `-- <paths>`)
}

export async function registerApiRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  /** Resolve the active repo, or send a 409 and return null when none is selected. */
  const requireRepo = (reply: FastifyReply): ActiveRepo | null => {
    if (!ctx.session.current) {
      reply.code(409).send({ error: 'No repository selected.' });
      return null;
    }
    return ctx.session.current;
  };

  /** Map engine-ops errors to the same HTTP codes the inline handlers used. */
  const sendError = (reply: FastifyReply, err: unknown): FastifyReply => {
    if (err instanceof ValidationError || err instanceof GitError) {
      return reply.code(400).send({ error: err.message });
    }
    throw err;
  };

  app.get('/api/repo', async () => {
    const repo = ctx.session.current;
    return repo ? { repoRoot: repo.repoRoot, name: repo.name } : { repoRoot: null, name: null };
  });

  app.get('/api/update', async () => {
    const latest = await checkForUpdate(VERSION); // null if up to date / offline / opted out
    return { current: VERSION, latest, name: PACKAGE_NAME };
  });

  app.post('/api/repo/pick', async (_request, reply) => {
    let folder: string | null;
    try {
      folder = await pickFolder();
    } catch (err) {
      if (err instanceof PickerUnavailableError) {
        return reply.code(501).send({ error: err.message });
      }
      throw err;
    }
    if (!folder) return reply.code(409).send({ error: 'No folder selected.' });

    const git = createGit(folder);
    if (!(await git.checkIsRepo())) {
      return reply.code(400).send({ error: `${folder} is not a git repository.` });
    }
    const repo = ctx.session.setRepo(folder);
    return { repoRoot: repo.repoRoot, name: repo.name };
  });

  app.get('/api/refs', async (_request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    return getRefsOp(repo);
  });

  app.get('/api/diff', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    try {
      return await getDiffOp(repo, ctx.paths, request.query ?? {});
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/comments', async (_request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    return listCommentsOp(repo);
  });

  app.post('/api/comments', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    try {
      const created = await createCommentOp(repo, request.body);
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/comments/:id', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const { id } = request.params as { id: string };
    try {
      const updated = await patchCommentOp(repo, id, request.body);
      if (!updated) return reply.code(404).send({ error: 'comment not found' });
      return updated;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/comments/:id', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const { id } = request.params as { id: string };
    const ok = await deleteCommentOp(repo, id);
    if (!ok) return reply.code(404).send({ error: 'comment not found' });
    return reply.code(204).send();
  });

  app.post('/api/export', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    try {
      return await runExportOp(repo, ctx.paths, request.body ?? {}, new Date().toISOString());
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
```

- [ ] **Step 6: Run the full server suite + typecheck to confirm no regression**

Run: `npm test && npm run typecheck`
Expected: PASS — including `src/server/review.e2e.test.ts` (the HTTP behavior guardrail) and the new `engine-ops.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/server/engine-ops.ts src/server/engine-ops.test.ts src/server/routes.ts
git commit -m "refactor: extract transport-agnostic engine-ops from routes"
```

---

### Task 2: Transport abstraction in `src/web/api.ts`

Make the `api` object delegate to a `Transport`. Two impls: `HttpTransport` (existing fetch behavior) and an `RpcClient` (postMessage). The exported `api` surface is byte-for-byte identical, so no component changes. Add a one-line webview guard to `clipboard.ts`.

**Files:**
- Modify: `src/web/api.ts` (full rewrite, same exports)
- Create: `src/web/api.test.ts`
- Modify: `src/web/clipboard.ts` (webview guard)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface Transport { request<T>(op: string, payload?: unknown): Promise<T>; }`
  - `class RpcClient implements Transport` — constructor `(post: (msg: RpcRequest) => void)`, method `receive(msg: RpcResponse): void`.
  - `type RpcRequest = { id: number; op: string; payload?: unknown }`
  - `type RpcResponse = { id: number; ok: boolean; data?: unknown; error?: string }`
  - The op strings the bridge (Task 5) must implement: `repo.get`, `repo.pick`, `update.get`, `refs.get`, `diff.get`, `comments.list`, `comments.create`, `comments.patch`, `comments.delete`, `export.run`.

- [ ] **Step 1: Write the failing test**

Create `src/web/api.test.ts`. Tests the pure `RpcClient` correlation and the `HttpTransport` URL/method mapping (with a stubbed global `fetch`).

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTransport, RpcClient } from './api';

describe('RpcClient', () => {
  it('correlates a response to its request by id', async () => {
    const sent: unknown[] = [];
    const client = new RpcClient((msg) => sent.push(msg));
    const p = client.request<{ ok: boolean }>('diff.get', { mode: 'working' });
    expect(sent).toHaveLength(1);
    const id = (sent[0] as { id: number }).id;
    client.receive({ id, ok: true, data: { ok: true } });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('rejects when the response is not ok', async () => {
    const sent: { id: number }[] = [];
    const client = new RpcClient((msg) => sent.push(msg as { id: number }));
    const p = client.request('comments.create', {});
    client.receive({ id: sent[0].id, ok: false, error: 'file: required' });
    await expect(p).rejects.toThrow('file: required');
  });

  it('ignores responses with an unknown id', async () => {
    const client = new RpcClient(() => {});
    expect(() => client.receive({ id: 999, ok: true, data: null })).not.toThrow();
  });
});

describe('HttpTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('builds the diff query string', async () => {
    const fetchMock = stubFetch(200, { mode: 'compare', raw: '', ignored: [] });
    const t = new HttpTransport();
    await t.request('diff.get', { mode: 'compare', base: 'main', head: 'dev' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/diff?mode=compare&base=main&head=dev');
  });

  it('POSTs JSON for comments.create', async () => {
    const fetchMock = stubFetch(201, { id: '1' });
    const t = new HttpTransport();
    await t.request('comments.create', { file: 'a.txt', body: 'x' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/comments');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ file: 'a.txt', body: 'x' });
  });

  it('returns null when repo.pick is cancelled (409)', async () => {
    stubFetch(409, { error: 'No folder selected.' });
    const t = new HttpTransport();
    await expect(t.request('repo.pick')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/web/api.test.ts`
Expected: FAIL — `HttpTransport` / `RpcClient` are not exported.

- [ ] **Step 3: Rewrite `src/web/api.ts`**

```ts
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

const transport: Transport = createTransport();

export const api = {
  getRepo: () => transport.request<RepoInfo>('repo.get'),
  getUpdate: () => transport.request<UpdateInfo>('update.get'),
  pickRepo: () => transport.request<RepoInfo | null>('repo.pick'),
  getRefs: () => transport.request<RefsResponse>('refs.get'),
  getDiff: (mode: DiffMode, base?: string, head?: string) =>
    transport.request<DiffResponse>('diff.get', { mode, base, head }),
  getComments: () => transport.request<Comment[]>('comments.list'),
  addComment: (input: NewComment) => transport.request<Comment>('comments.create', input),
  patchComment: (id: string, patch: CommentPatch) =>
    transport.request<Comment>('comments.patch', { id, patch }),
  deleteComment: (id: string) => transport.request<void>('comments.delete', { id }),
  exportReview: (options: ExportOptions = {}) =>
    transport.request<ExportResponse>('export.run', options),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/web/api.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the webview clipboard guard in `src/web/clipboard.ts`**

In the webview, `navigator.clipboard` is restricted, so the extension host writes the clipboard during `export.run` (Task 5). Short-circuit here so `App.tsx`'s success toast is accurate. Add this block immediately after the `if (!text) return false;` line:

```ts
  // Inside the VS Code webview the extension host writes the clipboard
  // (webview clipboard access is restricted), so report success here.
  if (typeof (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function') {
    return true;
  }
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: PASS — no regression; `App.tsx` still compiles unchanged against the new `api`.

- [ ] **Step 7: Commit**

```bash
git add src/web/api.ts src/web/api.test.ts src/web/clipboard.ts
git commit -m "feat(web): pluggable api transport (http + vscode rpc)"
```

---

### Task 3: Webview build target

Add a Vite build that emits a single IIFE bundle + CSS for the webview into `extension/media`. The extension provides its own HTML (Task 6), so the emitted `index.html` is ignored.

**Files:**
- Create: `vite.config.webview.ts`
- Create: `extension/.gitignore`
- Modify: `package.json` (add `build:webview` script)

**Interfaces:**
- Produces: `extension/media/webview.js`, `extension/media/webview.css`, and font assets under `extension/media/assets/` — consumed by Task 6's `getHtml`.

- [ ] **Step 1: Create `vite.config.webview.ts`**

`base: './'` keeps asset URLs relative; the IIFE single-file output gives the extension stable filenames (`webview.js` / `webview.css`) to reference, while fonts keep hashed names so multiple `.woff2` files don't collide.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the same src/web React app for the VS Code webview: a single IIFE
// bundle with stable names, emitted into the extension's media folder.
export default defineConfig({
  root: 'src/web',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../extension/media',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'webview.js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css') ? 'webview.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
```

- [ ] **Step 2: Add the `build:webview` script to root `package.json`**

In the `"scripts"` block add:

```json
    "build:webview": "vite build --config vite.config.webview.ts",
```

- [ ] **Step 3: Create `extension/.gitignore`**

```gitignore
media/
dist/
*.vsix
```

- [ ] **Step 4: Run the build and verify the artifacts exist**

Run: `npm run build:webview && ls extension/media/webview.js extension/media/webview.css`
Expected: both files listed (exit 0). The build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add vite.config.webview.ts extension/.gitignore package.json
git commit -m "build: vite webview target -> extension/media"
```

---

### Task 4: Extension scaffold + build pipeline

Create the extension manifest, its tsconfig, the esbuild host bundler (with the `.js`→`.ts` resolver so the ESM engine bundles into a CJS extension), and a minimal `activate()` that registers the `prless.review` command. This task's deliverable is a green typecheck + a produced `extension/dist/extension.js`.

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `esbuild.extension.mjs`
- Create: `extension/src/extension.ts` (minimal; expanded in Task 6)
- Modify: `package.json` (root: add `esbuild`, `@types/vscode`, `@vscode/vsce` devDeps + scripts)

**Interfaces:**
- Produces: `extension/dist/extension.js` (CJS, `vscode` external) — the VS Code entry point (`main`).

- [ ] **Step 1: Create `extension/package.json`**

```json
{
  "name": "prless-vscode",
  "displayName": "PRless",
  "description": "PR-style local code review with agent-agnostic AI handoff",
  "version": "0.1.0",
  "publisher": "muhammad-zihad",
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["SCM Providers", "Other"],
  "main": "./dist/extension.js",
  "activationEvents": [],
  "contributes": {
    "commands": [
      { "command": "prless.review", "title": "Review Changes", "category": "PRless" },
      { "command": "prless.sendToAgent", "title": "Send Review to Agent Terminal", "category": "PRless" }
    ],
    "menus": {
      "scm/title": [{ "command": "prless.review", "group": "navigation" }]
    },
    "configuration": {
      "title": "PRless",
      "properties": {
        "prless.agentCommand": {
          "type": "string",
          "default": "",
          "description": "Command run in the integrated terminal by 'Send Review to Agent Terminal'. When empty, a default is derived (e.g. claude/codex). Example: claude \"address .prless/review.md\""
        },
        "prless.defaultDiffMode": {
          "type": "string",
          "enum": ["working", "staged", "compare"],
          "default": "working",
          "description": "Diff mode the review opens with."
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create `extension/tsconfig.json`**

`noEmit` typecheck only — esbuild does the bundling. Importing `engine-ops` pulls the server graph into the typecheck automatically.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node", "vscode"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `esbuild.extension.mjs`**

The resolve plugin maps relative `./x.js` specifiers to `./x.ts` so esbuild can bundle the NodeNext-style ESM engine source directly.

```js
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Resolve NodeNext-style `./foo.js` imports to the real `./foo.ts` source. */
const resolveTsJs = {
  name: 'resolve-ts-js',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer || !args.path.startsWith('.')) return undefined;
      const candidate = path.resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
      return existsSync(candidate) ? { path: candidate } : undefined;
    });
  },
};

await build({
  entryPoints: ['extension/src/extension.ts'],
  outfile: 'extension/dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  plugins: [resolveTsJs],
});
```

- [ ] **Step 4: Create a minimal `extension/src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('prless.review', () => {
      vscode.window.showInformationMessage('PRless: review panel coming online…');
    }),
  );
}

export function deactivate(): void {
  // no-op
}
```

- [ ] **Step 5: Add root devDeps and scripts**

Run: `npm install -D esbuild @types/vscode @vscode/vsce`

Then add to root `package.json` `"scripts"`:

```json
    "typecheck:ext": "tsc -p extension/tsconfig.json --noEmit",
    "build:ext-host": "node esbuild.extension.mjs",
    "build:ext": "npm run build:webview && npm run build:ext-host",
    "package:ext": "npm run build:ext && cd extension && vsce package --no-dependencies",
```

- [ ] **Step 6: Typecheck and build the host bundle**

Run: `npm run typecheck:ext && npm run build:ext-host && ls extension/dist/extension.js`
Expected: typecheck passes; `extension/dist/extension.js` exists.

- [ ] **Step 7: Commit**

```bash
git add extension/package.json extension/tsconfig.json esbuild.extension.mjs extension/src/extension.ts package.json package-lock.json
git commit -m "feat(ext): extension scaffold + esbuild host bundle"
```

---

### Task 5: RPC bridge (`bridge.ts`)

The pure dispatch layer mirroring `routes.ts`: webview message → engine-op → response envelope. No `vscode` import — all environment behavior is injected, so it's unit-testable with Vitest.

**Files:**
- Create: `extension/src/bridge.ts`
- Create: `extension/src/bridge.test.ts`
- Modify: `vitest.config.ts` (extend `include` to cover `extension/`)

**Interfaces:**
- Consumes: engine-ops + `ValidationError` from `../../src/server/engine-ops.js`; `GitError` from `../../src/server/git.js`; `ActiveRepo` from `../../src/server/session.js`.
- Produces (used by Task 6's `extension.ts`):
  - `interface BridgeDeps { getRepo(): ActiveRepo | null; pickRepo(): Promise<{ repoRoot: string; name: string } | null>; paths: string[]; now(): string; copyToClipboard(text: string): Promise<void>; }`
  - `handleMessage(msg: { id: number; op: string; payload?: unknown }, deps: BridgeDeps): Promise<RpcResponse>` where `RpcResponse = { id: number; ok: boolean; data?: unknown; error?: string }`.

- [ ] **Step 1: Extend `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts (which roots the web app at src/web) so tests
// run from the project root and pick up the server + extension suites.
export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.test.ts', 'extension/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `extension/src/bridge.test.ts`. Uses a real temp git repo + real engine-ops (integration-style, like the server e2e test) and stubbed environment deps.

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoSession, type ActiveRepo } from '../../src/server/session.js';
import { handleMessage, type BridgeDeps } from './bridge.js';

let dir: string;
let repo: ActiveRepo;
let deps: BridgeDeps;
let clipboard: string[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'prless-bridge-'));
  const { simpleGit } = await import('simple-git');
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  await git.add('.');
  await git.commit('init');
  await writeFile(path.join(dir, 'a.txt'), 'hello world\n');
  repo = new RepoSession().setRepo(dir);
  clipboard = [];
  deps = {
    getRepo: () => repo,
    pickRepo: vi.fn(async () => ({ repoRoot: repo.repoRoot, name: repo.name })),
    paths: [],
    now: () => '2026-06-24T00:00:00.000Z',
    copyToClipboard: async (t: string) => {
      clipboard.push(t);
    },
  };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('handleMessage', () => {
  it('returns repo info for repo.get', async () => {
    const res = await handleMessage({ id: 1, op: 'repo.get' }, deps);
    expect(res).toEqual({ id: 1, ok: true, data: { repoRoot: repo.repoRoot, name: repo.name } });
  });

  it('creates then lists comments', async () => {
    await handleMessage(
      { id: 2, op: 'comments.create', payload: { file: 'a.txt', line: 1, side: 'new', body: 'fix' } },
      deps,
    );
    const res = await handleMessage({ id: 3, op: 'comments.list' }, deps);
    expect(res.ok).toBe(true);
    expect((res.data as unknown[]).length).toBe(1);
  });

  it('export.run copies the review content to the clipboard', async () => {
    await handleMessage(
      { id: 4, op: 'comments.create', payload: { file: 'a.txt', line: 1, side: 'new', body: 'fix' } },
      deps,
    );
    const res = await handleMessage({ id: 5, op: 'export.run', payload: {} }, deps);
    expect(res.ok).toBe(true);
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0]).toContain('fix');
  });

  it('maps validation failure to ok:false', async () => {
    const res = await handleMessage({ id: 6, op: 'comments.create', payload: { file: '', body: '' } }, deps);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('errors with no repository selected', async () => {
    const noRepo: BridgeDeps = { ...deps, getRepo: () => null };
    const res = await handleMessage({ id: 7, op: 'refs.get' }, noRepo);
    expect(res).toEqual({ id: 7, ok: false, error: 'No repository selected.' });
  });

  it('rejects an unknown op', async () => {
    const res = await handleMessage({ id: 8, op: 'bogus.op' }, deps);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('unknown op');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run extension/src/bridge.test.ts`
Expected: FAIL — cannot resolve `./bridge.js`.

- [ ] **Step 4: Write `extension/src/bridge.ts`**

```ts
import type { ActiveRepo } from '../../src/server/session.js';
import { GitError } from '../../src/server/git.js';
import {
  ValidationError,
  createCommentOp,
  deleteCommentOp,
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run extension/src/bridge.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck the extension + full suite**

Run: `npm run typecheck:ext && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add extension/src/bridge.ts extension/src/bridge.test.ts vitest.config.ts
git commit -m "feat(ext): rpc bridge mapping webview messages to engine-ops"
```

---

### Task 6: Wire the extension host — webview panel, RPC handler, repo session

Expand `extension.ts` to open the editor-area `WebviewPanel`, build the CSP'd HTML referencing the built bundle, wire `onDidReceiveMessage` to `handleMessage`, resolve the repo from the workspace, and implement `pickRepo` + clipboard via the VS Code API. The HTML builder is factored into a pure function with its own unit test; the panel/runtime wiring is verified by a manual Extension Development Host smoke test.

**Files:**
- Create: `extension/src/html.ts` (pure `getHtml`)
- Create: `extension/src/html.test.ts`
- Modify: `extension/src/extension.ts`

**Interfaces:**
- Consumes: `handleMessage`, `BridgeDeps` from `./bridge.js`; `RepoSession` from `../../src/server/session.js`; `createGit` from `../../src/server/git.js`.
- Produces: `getHtml(opts: { scriptUri: string; styleUri: string; cspSource: string; nonce: string }): string`.

- [ ] **Step 1: Write the failing test for `getHtml`**

Create `extension/src/html.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getHtml } from './html.js';

describe('getHtml', () => {
  const html = getHtml({
    scriptUri: 'vscode-resource://media/webview.js',
    styleUri: 'vscode-resource://media/webview.css',
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
  });

  it('locks scripts to the nonce', () => {
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('nonce="abc123"');
  });

  it('references the built bundle and stylesheet', () => {
    expect(html).toContain('vscode-resource://media/webview.js');
    expect(html).toContain('vscode-resource://media/webview.css');
  });

  it('allows styles and fonts from the webview source', () => {
    expect(html).toContain('vscode-resource:');
    expect(html).toContain('<div id="root">');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run extension/src/html.test.ts`
Expected: FAIL — cannot resolve `./html.js`.

- [ ] **Step 3: Write `extension/src/html.ts`**

The web app mounts on `#root` (matches `src/web/index.html`). Styles use `'unsafe-inline'` (React inline style attributes) consistent with the server's existing CSP.

```ts
export interface HtmlOptions {
  scriptUri: string;
  styleUri: string;
  cspSource: string;
  nonce: string;
}

export function getHtml({ scriptUri, styleUri, cspSource, nonce }: HtmlOptions): string {
  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `connect-src 'none'`,
  ].join('; ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>PRless</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run extension/src/html.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewrite `extension/src/extension.ts` to open the panel and serve RPC**

```ts
import * as vscode from 'vscode';
import { RepoSession, type ActiveRepo } from '../../src/server/session.js';
import { createGit } from '../../src/server/git.js';
import { handleMessage, type BridgeDeps } from './bridge.js';
import { getHtml } from './html.js';

let panel: vscode.WebviewPanel | undefined;
const session = new RepoSession();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('prless.review', () => openReview(context)),
  );
}

function openReview(context: vscode.ExtensionContext): void {
  // Default the repo to the first workspace folder.
  if (!session.current) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) session.setRepo(folder.uri.fsPath);
  }

  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
    return;
  }

  const mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
  panel = vscode.window.createWebviewPanel('prless.review', 'PRless', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [mediaUri],
  });

  const webview = panel.webview;
  const nonce = makeNonce();
  webview.html = getHtml({
    scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'webview.js')).toString(),
    styleUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'webview.css')).toString(),
    cspSource: webview.cspSource,
    nonce,
  });

  const deps = makeDeps();
  webview.onDidReceiveMessage(async (msg: { id: number; op: string; payload?: unknown }) => {
    const response = await handleMessage(msg, deps);
    void webview.postMessage(response);
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function makeDeps(): BridgeDeps {
  return {
    getRepo: () => session.current,
    pickRepo: pickRepo,
    paths: [],
    now: () => new Date().toISOString(),
    copyToClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
  };
}

/** VS Code equivalent of the CLI folder picker: workspace folder pick or open dialog. */
async function pickRepo(): Promise<{ repoRoot: string; name: string } | null> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  let chosen: string | undefined;

  if (folders.length > 1) {
    const pick = await vscode.window.showWorkspaceFolderPick();
    chosen = pick?.uri.fsPath;
  } else if (folders.length === 1) {
    chosen = folders[0].uri.fsPath;
  }

  if (!chosen) {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select a project folder',
    });
    chosen = uris?.[0]?.fsPath;
  }

  if (!chosen) return null; // cancelled

  if (!(await createGit(chosen).checkIsRepo())) {
    void vscode.window.showErrorMessage(`${chosen} is not a git repository.`);
    return null;
  }

  const repo: ActiveRepo = session.setRepo(chosen);
  return { repoRoot: repo.repoRoot, name: repo.name };
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function deactivate(): void {
  // no-op
}
```

- [ ] **Step 6: Typecheck and build the full extension**

Run: `npm run typecheck:ext && npm run build:ext`
Expected: typecheck passes; `extension/media/webview.js`, `extension/media/webview.css`, and `extension/dist/extension.js` are all present.

- [ ] **Step 7: Manual smoke test in the Extension Development Host**

This is the runtime verification (the panel/webview cannot be unit-tested). Perform it and confirm each line:

1. Open the repo in VS Code. Create `.vscode/launch.json` if absent with an "Extensions" config pointing `--extensionDevelopmentPath` at the `extension/` folder, then press **F5** (or run `code --extensionDevelopmentPath=$PWD/extension .`).
2. In the dev host, make an edit to a tracked file so there's a working-tree diff.
3. Run **PRless: Review Changes** from the Command Palette. Expected: a "PRless" editor tab opens, the diff renders, and the file list is populated.
4. Click a line gutter, add a comment, save it. Expected: the comment appears; `.prless/comments.json` is created in the repo.
5. Click **Export for AI**. Expected: success toast ("copied to your clipboard"); `.prless/review.md` is written; pasting (Cmd/Ctrl+V) elsewhere yields the review prompt.

- [ ] **Step 8: Commit**

```bash
git add extension/src/html.ts extension/src/html.test.ts extension/src/extension.ts
git commit -m "feat(ext): webview panel + rpc host wiring + repo picker"
```

---

### Task 7: `sendToAgent` command + agent-command helper

Add the optional convenience: open the integrated terminal and run a configurable agent command against `.prless/review.md`. Factor the command resolution into a pure, tested helper.

**Files:**
- Create: `extension/src/agent.ts`
- Create: `extension/src/agent.test.ts`
- Modify: `extension/src/extension.ts` (register `prless.sendToAgent`)

**Interfaces:**
- Consumes: `agentCommand` from `../../src/server/export.js` (the existing per-profile command builder).
- Produces: `resolveAgentCommand(setting: string | undefined): string` — returns the trimmed user setting if non-empty, else the generic default (`agentCommand('generic')`).

- [ ] **Step 1: Write the failing test**

Create `extension/src/agent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveAgentCommand } from './agent.js';

describe('resolveAgentCommand', () => {
  it('prefers a non-empty user setting', () => {
    expect(resolveAgentCommand('claude "go"')).toBe('claude "go"');
  });

  it('trims whitespace-only settings to the default', () => {
    expect(resolveAgentCommand('   ')).toBe('Address the review comments in .prless/review.md');
  });

  it('falls back to the default when unset', () => {
    expect(resolveAgentCommand(undefined)).toBe(
      'Address the review comments in .prless/review.md',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run extension/src/agent.test.ts`
Expected: FAIL — cannot resolve `./agent.js`.

- [ ] **Step 3: Write `extension/src/agent.ts`**

```ts
import { agentCommand } from '../../src/server/export.js';

/** The command to run in the terminal: the user's setting, else the generic default. */
export function resolveAgentCommand(setting: string | undefined): string {
  const trimmed = setting?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : agentCommand('generic');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run extension/src/agent.test.ts`
Expected: PASS (3 tests). (`agentCommand('generic')` returns `Address the review comments in .prless/review.md` — see `src/server/export.ts`.)

- [ ] **Step 5: Register `prless.sendToAgent` in `extension.ts`**

Add `resolveAgentCommand` to the imports:

```ts
import { resolveAgentCommand } from './agent.js';
```

Then, inside `activate()`, add a second registration alongside `prless.review`:

```ts
  context.subscriptions.push(
    vscode.commands.registerCommand('prless.sendToAgent', () => {
      const setting = vscode.workspace.getConfiguration('prless').get<string>('agentCommand');
      const command = resolveAgentCommand(setting);
      const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('PRless');
      terminal.show();
      terminal.sendText(command, false);
    }),
  );
```

- [ ] **Step 6: Typecheck, test, build**

Run: `npm run typecheck:ext && npm test && npm run build:ext-host`
Expected: PASS; bundle rebuilt.

- [ ] **Step 7: Commit**

```bash
git add extension/src/agent.ts extension/src/agent.test.ts extension/src/extension.ts
git commit -m "feat(ext): send-to-agent terminal command"
```

---

### Task 8: Packaging, CI, and docs

Make the extension packageable and keep CI green. Add `.vscodeignore`, extend CI to typecheck + build the extension, ignore build output at the repo root, and document the extension.

**Files:**
- Create: `extension/.vscodeignore`
- Create: `extension/README.md`
- Modify: `.gitignore` (ignore extension build output)
- Modify: `.github/workflows/ci.yml` (add extension typecheck + build)
- Modify: `CHANGELOG.md`

**Interfaces:** none (release/infra task).

- [ ] **Step 1: Create `extension/.vscodeignore`**

Ships only the bundled output + manifest. Source, tests, tsconfig, and node_modules are excluded (everything is bundled into `dist/`).

```
src/**
**/*.test.ts
tsconfig.json
.gitignore
node_modules/**
**/*.map
```

- [ ] **Step 2: Create `extension/README.md`**

```markdown
# PRless for VS Code

PR-style local code review, inside the editor. Review your working-tree, staged,
or branch-compare diff; leave inline, range, and whole-file comments; then export
the open comments to `.prless/review.md` (and your clipboard) for any AI agent.

## Usage

1. Open a git repository in VS Code.
2. Run **PRless: Review Changes** from the Command Palette (or the Source Control title bar).
3. Comment on the diff, then click **Export for AI** — the prompt is copied to your
   clipboard and written to `.prless/review.md`.
4. Optionally run **PRless: Send Review to Agent Terminal** to run your configured
   agent command (`prless.agentCommand`) against the exported review.

Everything stays local. Comments persist in `.prless/comments.json`; add `.prless/`
to your `.gitignore` to keep them out of commits.
```

- [ ] **Step 3: Add extension build output to root `.gitignore`**

Append:

```gitignore
extension/dist/
extension/media/
extension/*.vsix
```

- [ ] **Step 4: Extend CI** — add steps to `.github/workflows/ci.yml` after the existing **Build** step:

```yaml
      - name: Typecheck extension
        run: npm run typecheck:ext

      - name: Build extension
        run: npm run build:ext
```

- [ ] **Step 5: Add a CHANGELOG entry**

Add a new top section under the title in `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added

- VS Code extension (`extension/`): review local diffs and export comments for AI
  agents without leaving the editor. Reuses the web UI in a webview backed by the
  shared review engine.
```

- [ ] **Step 6: Verify the whole pipeline + package**

Run: `npm run typecheck && npm run typecheck:ext && npm test && npm run build && npm run package:ext`
Expected: all pass; a `prless-vscode-0.1.0.vsix` is produced in `extension/`.

- [ ] **Step 7: Commit**

```bash
git add extension/.vscodeignore extension/README.md .gitignore .github/workflows/ci.yml CHANGELOG.md
git commit -m "chore(ext): packaging, CI, and docs for the VS Code extension"
```

---

## Deferred (explicit non-goals for v1)

These are intentionally out of scope to keep v1 tight; each is a clean follow-up. Called out so a reviewer knows they were considered, not missed:

- **Activity Bar view container** (the spec listed it as a secondary entry point). v1 ships the Command Palette + Source Control title button only. Adding a `viewsContainers` + webview-view entry is additive and needs a PNG/SVG container icon.
- **`prless.export` command.** The in-webview **Export for AI** button already drives `export.run`; a palette command duplicating it is deferred.
- **Marketplace `icon` (128×128 PNG) + publisher verification** — packaging polish, not needed to build/run the `.vsix` locally.
- **`@vscode/test-electron` end-to-end test** of the live panel. v1 relies on the manual smoke test (Task 6, Step 7) plus the pure-unit coverage of bridge/html/agent/transport.
- **Webview state via `getState`/`setState`.** v1 uses `retainContextWhenHidden`; settings still persist through the web app's existing `localStorage`.

## Self-Review

- **Spec coverage:** Architecture 3-layer split → Tasks 1, 2, 6. Engine-ops → Task 1. Transport abstraction → Task 2. Webview build → Task 3. Extension scaffold/build (esbuild CJS, ESM bundling) → Task 4. RPC protocol (full op table) → Tasks 2+5. Repo selection (workspace pick + open dialog + `checkIsRepo`) → Task 6. AI handoff (`.prless/` unchanged, clipboard via host, optional terminal) → Tasks 5+7. Contributions (commands, scm/title, settings) → Tasks 4+7. Webview placement (editor-area panel) → Task 6. Testing → tests in Tasks 1,2,5,6,7. Risks (ESM↔CJS, CSP/nonce, clipboard, multi-root) → Tasks 4,6,2,6. Activity Bar entry point is the one spec item intentionally deferred (documented above).
- **Placeholder scan:** none — every code step contains complete, runnable code; the only non-code verification is the explicitly-scoped manual smoke test in Task 6.
- **Type consistency:** op strings are identical across `HttpTransport` (Task 2), the bridge `dispatch` switch (Task 5), and the engine-ops names (Task 1). `BridgeDeps`, `RpcResponse`, and `getHtml`'s `HtmlOptions` are defined once and consumed unchanged. `resolveAgentCommand` and `agentCommand('generic')` match the real `src/server/export.ts` output.
