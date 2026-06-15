import type { FastifyInstance, FastifyReply } from 'fastify';
import { exportReview } from './export.js';
import { getDiff, getRefs, GitError } from './git.js';
import { loadIgnore } from './ignore.js';
import { pickFolder, PickerUnavailableError } from './picker.js';
import { checkForUpdate, PACKAGE_NAME, VERSION } from './update.js';
import {
  CreateCommentSchema,
  DiffQuerySchema,
  ExportOptionsSchema,
  PatchCommentSchema,
  formatZodError,
} from './schemas.js';
import type { ActiveRepo, RepoSession } from './session.js';
import { createGit } from './git.js';

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
    return getRefs(repo.git);
  });

  app.get('/api/diff', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const parsed = DiffQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const { mode, base, head } = parsed.data;
    try {
      const ig = await loadIgnore(repo.repoRoot);
      return await getDiff(repo.git, {
        mode,
        base,
        head,
        ig,
        paths: ctx.paths,
        repoRoot: repo.repoRoot,
      });
    } catch (err) {
      if (err instanceof GitError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/api/comments', async (_request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    return repo.store.list();
  });

  app.post('/api/comments', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const parsed = CreateCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const created = await repo.store.add(parsed.data);
    return reply.code(201).send(created);
  });

  app.patch('/api/comments/:id', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const { id } = request.params as { id: string };
    const parsed = PatchCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const updated = await repo.store.patch(id, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: 'comment not found' });
    }
    return updated;
  });

  app.delete('/api/comments/:id', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const { id } = request.params as { id: string };
    const ok = await repo.store.remove(id);
    if (!ok) {
      return reply.code(404).send({ error: 'comment not found' });
    }
    return reply.code(204).send();
  });

  app.post('/api/export', async (request, reply) => {
    const repo = requireRepo(reply);
    if (!repo) return reply;
    const parsed = ExportOptionsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    const ig = await loadIgnore(repo.repoRoot);
    const all = await repo.store.list();
    // Don't export comments on files hidden by .prlessignore.
    const comments = ig ? all.filter((c) => !ig.ignores(c.file)) : all;
    // Use the working-tree diff as the reference for orphan detection.
    const diff = await getDiff(repo.git, {
      mode: 'working',
      ig,
      paths: ctx.paths,
      repoRoot: repo.repoRoot,
    });
    return exportReview(
      repo.repoRoot,
      comments,
      { options: parsed.data, rawDiff: diff.raw },
      new Date().toISOString(),
    );
  });
}
