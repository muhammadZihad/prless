import type { FastifyInstance } from 'fastify';
import type { SimpleGit } from 'simple-git';
import type {
  CommentPatch,
  DiffMode,
  NewComment,
} from '../shared/types.js';
import { CommentStore } from './comments.js';
import { exportReview } from './export.js';
import { getDiff, getRefs, getUntrackedFiles, GitError } from './git.js';

export interface ApiContext {
  repoRoot: string;
  git: SimpleGit;
  store: CommentStore;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
): Promise<void> {
  app.get('/api/refs', async () => {
    return getRefs(ctx.git);
  });

  app.get('/api/diff', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const mode = (q.mode ?? 'working') as DiffMode;
    try {
      return await getDiff(ctx.git, mode, q.base, q.head);
    } catch (err) {
      if (err instanceof GitError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/api/comments', async () => {
    return ctx.store.list();
  });

  app.post('/api/comments', async (request, reply) => {
    const body = request.body as Partial<NewComment>;
    if (!body || !body.file || typeof body.line !== 'number' || !body.side || !body.body) {
      return reply.code(400).send({ error: 'file, line, side and body are required' });
    }
    const created = await ctx.store.add({
      file: body.file,
      line: body.line,
      side: body.side,
      body: body.body,
      snippet: body.snippet,
    });
    return reply.code(201).send(created);
  });

  app.patch('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = request.body as CommentPatch;
    const updated = await ctx.store.patch(id, patch);
    if (!updated) {
      return reply.code(404).send({ error: 'comment not found' });
    }
    return updated;
  });

  app.delete('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await ctx.store.remove(id);
    if (!ok) {
      return reply.code(404).send({ error: 'comment not found' });
    }
    return reply.code(204).send();
  });

  app.post('/api/export', async () => {
    const comments = await ctx.store.list();
    const untracked = await getUntrackedFiles(ctx.git);
    const result = await exportReview(ctx.repoRoot, comments, untracked);
    return result;
  });
}
