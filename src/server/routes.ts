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
