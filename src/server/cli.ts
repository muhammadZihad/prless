#!/usr/bin/env node
import path from 'node:path';
import open from 'open';
import { buildServer } from './index.js';
import { assertGitRepo, createGit, GitError } from './git.js';

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

Options (for "open"):
  --port <n>     Port to serve on (default 4100, or $PRLESS_PORT)
  --no-open      Do not launch a browser automatically
  --dev          Internal: run the API only (UI served by the Vite dev server)

Examples:
  prless open .
  prless open ~/projects/my-app
  prless open ./my-app --port 4200
`;

function parseOpenArgs(rest: string[]): OpenOptions {
  let repoArg: string | undefined;
  let dev = false;
  let noOpen = false;
  let port = Number(process.env.PRLESS_PORT ?? 4100);

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--dev') dev = true;
    else if (a === '--no-open') noOpen = true;
    else if (a === '--port') port = Number(rest[++i]);
    else if (!a.startsWith('-') && repoArg === undefined) repoArg = a;
  }

  if (repoArg === undefined) {
    console.error('prless: "open" requires a repository path (use "." for the current directory).\n');
    console.error(USAGE);
    process.exit(1);
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
      console.error(`prless: ${opts.repoRoot} is not a git repository.`);
      process.exit(1);
    }
    throw err;
  }

  const app = await buildServer({ repoRoot: opts.repoRoot, dev: opts.dev });
  await app.listen({ port: opts.port, host: '127.0.0.1' });

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
