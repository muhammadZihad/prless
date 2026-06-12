import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import { registerApiRoutes } from './routes.js';
import { RepoSession } from './session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  repoRoot?: string; // omitted when starting with no repo (folder-picker mode)
  dev: boolean;
  paths?: string[]; // limit the review to these paths (CLI `-- <paths>`)
}

export async function buildServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Basic security headers. The UI is bundled and same-origin, so a tight CSP
  // works; 'unsafe-inline' is needed only for React's inline style attributes.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        // PRless serves over plain http on localhost; don't force https upgrades.
        upgradeInsecureRequests: null,
      },
    },
  });

  const session = new RepoSession();
  if (opts.repoRoot) session.setRepo(opts.repoRoot);

  await registerApiRoutes(app, { session, paths: opts.paths ?? [] });

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
