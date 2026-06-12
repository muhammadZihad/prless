#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import open from 'open';
import { buildServer } from './index.js';
import { assertGitRepo, createGit, GitError } from './git.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

/** A user-facing CLI error: printed as a clean message, no stack trace. */
export class CliError extends Error {}

interface OpenOptions {
  repoRoot: string;
  dev: boolean;
  port: number;
  noOpen: boolean;
}

const USAGE = `prless — local code review with agent-agnostic AI handoff

Usage:
  prless open <repository>   Review a git repository at the given path
  prless open .              Review the git repository in the current directory
  prless help                Show this help
  prless --version           Show the installed version

Options (for "open"):
  --port <n>     Port to serve on, 1-65535 (default 4100, or $PRLESS_PORT)
  --no-open      Do not launch a browser automatically
  --dev          Internal: run the API only (UI served by the Vite dev server)

Examples:
  prless open .
  prless open ~/projects/my-app
  prless open ./my-app --port 4200
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

export function parseOpenArgs(rest: string[]): OpenOptions {
  let repoArg: string | undefined;
  let dev = false;
  let noOpen = false;
  let port = parsePort(process.env.PRLESS_PORT ?? '4100');

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--dev') dev = true;
    else if (a === '--no-open') noOpen = true;
    else if (a === '--port') port = parsePort(rest[++i]);
    else if (!a.startsWith('-') && repoArg === undefined) repoArg = a;
  }

  if (repoArg === undefined) {
    throw new CliError(
      'prless: "open" requires a repository path (use "." for the current directory).',
    );
  }

  return {
    // path.resolve normalises against cwd on every platform (mac/linux/windows).
    repoRoot: path.resolve(repoArg),
    dev,
    noOpen,
    port,
  };
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

  const app = await buildServer({ repoRoot: opts.repoRoot, dev: opts.dev });
  try {
    await app.listen({ port: opts.port, host: '127.0.0.1' });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new CliError(
        `Port ${opts.port} is already in use.\n\nTry:\n  prless open . --port ${opts.port + 1}`,
      );
    }
    throw err;
  }

  const url = opts.dev ? `http://localhost:5174` : `http://localhost:${opts.port}`;
  console.log(`prless: reviewing ${opts.repoRoot}`);
  console.log(`prless: serving ${opts.dev ? 'API' : 'UI'} on http://localhost:${opts.port}`);
  if (opts.dev) console.log(`prless: open the Vite dev server at ${url}`);

  if (!opts.dev && !opts.noOpen) {
    await open(url).catch(() => {
      // Launching a browser is best-effort and varies by platform.
      console.log(`prless: open ${url} in your browser`);
    });
  }
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
    case undefined:
      console.log(USAGE);
      break;
    default:
      console.error(`prless: unknown command "${command}"\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

// Only run as a CLI when invoked directly, not when imported (e.g. in tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

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
