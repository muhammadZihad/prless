#!/usr/bin/env node
import path from 'node:path';
import net from 'node:net';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { buildServer } from './index.js';
import { assertGitRepo, createGit, GitError } from './git.js';
import { checkForUpdate } from './update.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; name: string };

/** Best-effort, non-blocking notice when a newer version is on npm. */
function notifyIfOutdated(): void {
  checkForUpdate(pkg.version)
    .then((latest) => {
      if (latest) {
        console.log(`\nprless: a new version is available — ${pkg.version} → ${latest}`);
        console.log(`  update with: npm install -g ${pkg.name}@latest`);
      }
    })
    .catch(() => {
      /* update checks are best-effort */
    });
}

/** A user-facing CLI error: printed as a clean message, no stack trace. */
export class CliError extends Error {}

interface ServeFlags {
  dev: boolean;
  port: number;
  noOpen: boolean;
  paths: string[];
}

interface OpenOptions extends ServeFlags {
  repoRoot: string;
}

const USAGE = `prless — local code review with agent-agnostic AI handoff

Usage:
  prless                     Start with no repo and pick a folder in the browser
  prless open [repository]   Review a git repository (defaults to the current directory)
  prless help                Show this help
  prless --version           Show the installed version

Options:
  --port <n>     Port to serve on, 1-65535 (default 4100, or $PRLESS_PORT)
  --no-open      Do not launch a browser automatically
  --dev          Internal: run the API only (UI served by the Vite dev server)
  -- <paths…>    Limit the review to the given paths (everything after --)

Examples:
  prless
  prless open .
  prless open ~/projects/my-app
  prless open ./my-app --port 4200
  prless open . -- src app tests
`;

/** Validate a port value, throwing a CliError on anything outside 1-65535. */
export function parsePort(value: string | undefined): number {
  const port = Number(value);
  if (
    value === undefined ||
    value.trim() === '' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new CliError(`Invalid port "${value ?? ''}". Use a number between 1 and 65535.`);
  }
  return port;
}

export function parseFlags(rest: string[]): ServeFlags & { repoArg?: string } {
  // Everything after a bare `--` is a list of paths to scope the review to.
  const sep = rest.indexOf('--');
  const paths = sep === -1 ? [] : rest.slice(sep + 1).filter((p) => p.length > 0);
  const args = sep === -1 ? rest : rest.slice(0, sep);

  let repoArg: string | undefined;
  let dev = false;
  let noOpen = false;
  let port = parsePort(process.env.PRLESS_PORT ?? '4100');

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dev') dev = true;
    else if (a === '--no-open') noOpen = true;
    else if (a === '--port') port = parsePort(args[++i]);
    else if (!a.startsWith('-') && repoArg === undefined) repoArg = a;
  }

  return { dev, noOpen, port, paths, repoArg };
}

export function parseOpenArgs(rest: string[]): OpenOptions {
  const { repoArg, ...flags } = parseFlags(rest);
  return {
    // No path means the current directory; path.resolve normalises per-platform.
    repoRoot: path.resolve(repoArg ?? '.'),
    ...flags,
  };
}

const MAX_PORT_ATTEMPTS = 10;

/** Resolve true if a port can be bound on 127.0.0.1. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/** First free port in [start, start+MAX_PORT_ATTEMPTS), or null if all are taken. */
async function findFreePort(start: number): Promise<number | null> {
  for (let port = start; port < start + MAX_PORT_ATTEMPTS; port++) {
    if (await portFree(port)) return port;
  }
  return null;
}

/** Listen, then report and open the browser. Shared by repo and no-repo modes. */
async function serve(
  app: Awaited<ReturnType<typeof buildServer>>,
  flags: ServeFlags,
  repoRoot?: string,
): Promise<void> {
  const port = await findFreePort(flags.port);
  if (port === null) {
    throw new CliError(
      `Ports ${flags.port}–${flags.port + MAX_PORT_ATTEMPTS - 1} are all in use.\n\n` +
        `Close another prless (or whatever is using them), or pick a port:\n` +
        `  prless --port <number>`,
    );
  }

  try {
    await app.listen({ port, host: '127.0.0.1' });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      // Lost a race for the port between probing and listening.
      throw new CliError(`Port ${port} was taken just before starting. Try again.`);
    }
    throw err;
  }

  const url = flags.dev ? `http://localhost:5174` : `http://localhost:${port}`;
  if (repoRoot) console.log(`prless: reviewing ${repoRoot}`);
  else console.log('prless: no repository selected — choose a project in the browser');
  if (port !== flags.port) console.log(`prless: port ${flags.port} was busy, using ${port}`);
  console.log(`prless: serving ${flags.dev ? 'API' : 'UI'} on http://localhost:${port}`);
  if (flags.dev) console.log(`prless: open the Vite dev server at ${url}`);

  if (!flags.dev && !flags.noOpen) {
    await open(url).catch(() => {
      // Launching a browser is best-effort and varies by platform.
      console.log(`prless: open ${url} in your browser`);
    });
  }

  // Tell the user (once, in the background) if a newer version is published.
  notifyIfOutdated();
}

async function runOpen(opts: OpenOptions): Promise<void> {
  const git = createGit(opts.repoRoot);
  try {
    await assertGitRepo(git);
  } catch (err) {
    if (err instanceof GitError) {
      throw new CliError(`prless: ${opts.repoRoot} is not a git repository.`);
    }
    throw err;
  }

  const app = await buildServer({ repoRoot: opts.repoRoot, dev: opts.dev, paths: opts.paths });
  await serve(app, opts, opts.repoRoot);
}

/** Start with no repo selected; the user picks one in the browser. */
async function runNoRepo(flags: ServeFlags): Promise<void> {
  const app = await buildServer({ dev: flags.dev, paths: flags.paths });
  await serve(app, flags);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);

  switch (command) {
    case 'open':
      await runOpen(parseOpenArgs(rest));
      break;
    case 'version':
    case '--version':
    case '-v':
      console.log(pkg.version);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      break;
    case undefined:
      // Bare `prless`: start with no repo and pick a folder in the browser.
      await runNoRepo(parseFlags([]));
      break;
    default:
      if (command.startsWith('-')) {
        // `prless --port 4200` etc. — no-repo mode with options.
        await runNoRepo(parseFlags(argv));
        break;
      }
      console.error(`prless: unknown command "${command}"\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

// Only run as a CLI when invoked directly, not when imported (e.g. in tests).
// Compare real paths so a globally-installed symlinked bin still matches its
// resolved module path (argv[1] is the symlink; import.meta.url is the target).
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

const invokedDirectly = isInvokedDirectly();

if (invokedDirectly) {
  main().catch((err) => {
    if (err instanceof CliError) {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });
}
