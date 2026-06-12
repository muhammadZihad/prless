import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { CommentStore } from './comments.js';
import { createGit } from './git.js';
import { registerApiRoutes } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  repoRoot: string;
  dev: boolean;
}

export async function buildServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const git = createGit(opts.repoRoot);
  const store = new CommentStore(opts.repoRoot);

  await registerApiRoutes(app, { repoRoot: opts.repoRoot, git, store });

  // In dev, Vite serves the UI and proxies /api here. In a built install we
  // serve the compiled web assets ourselves so the CLI is a single process.
  if (!opts.dev) {
    const webRoot = path.join(__dirname, '..', 'web');
    if (existsSync(webRoot)) {
      await app.register(fastifyStatic, { root: webRoot });
      // SPA fallback for any non-API route.
      app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api')) {
          return reply.code(404).send({ error: 'not found' });
        }
        return reply.sendFile('index.html');
      });
    }
  }

  return app;
}
