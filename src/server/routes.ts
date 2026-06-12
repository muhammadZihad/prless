import type { FastifyInstance } from 'fastify';
import type { SimpleGit } from 'simple-git';
import { CommentStore } from './comments.js';
import { exportReview } from './export.js';
import { getDiff, getRefs, GitError } from './git.js';
import { loadIgnore } from './ignore.js';
import {
  CreateCommentSchema,
  DiffQuerySchema,
  PatchCommentSchema,
  formatZodError,
} from './schemas.js';

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
    const parsed = DiffQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const { mode, base, head } = parsed.data;
    try {
      const ig = await loadIgnore(ctx.repoRoot);
      return await getDiff(ctx.git, mode, base, head, ig);
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
    const parsed = CreateCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const created = await ctx.store.add(parsed.data);
    return reply.code(201).send(created);
  });

  app.patch('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = PatchCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const updated = await ctx.store.patch(id, parsed.data);
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
    const ig = await loadIgnore(ctx.repoRoot);
    const all = await ctx.store.list();
    // Don't export comments on files hidden by .prlessignore.
    const comments = ig ? all.filter((c) => !ig.ignores(c.file)) : all;
    // Use the working-tree diff as the reference for untracked + orphan detection.
    const diff = await getDiff(ctx.git, 'working', undefined, undefined, ig);
    const result = await exportReview(ctx.repoRoot, comments, diff.untracked, diff.raw);
    return result;
  });
}
