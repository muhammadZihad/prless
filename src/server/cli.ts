#!/usr/bin/env node
import path from 'node:path';
import net from 'node:net';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import open from 'open';
import { buildServer } from './index.js';
import { assertGitRepo, createGit, GitError } from './git.js';
import { checkForUpdate } from './update.js';
import * as registry from './registry.js';
import { bold, cyan, dim, green, red, since, tildify, yellow } from './term.js';

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
  prless ls                  List running prless servers (port + folder)
  prless stop <port|all>     Stop a running prless server
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Ask an instance to stop, then wait (briefly) for its port to free up. */
async function stopAndWait(inst: registry.Instance): Promise<boolean> {
  registry.stop(inst);
  for (let i = 0; i < 30; i++) {
    if (await portFree(inst.port)) return true;
    await delay(100);
  }
  return false;
}

async function assertRepo(repoRoot: string): Promise<void> {
  try {
    await assertGitRepo(createGit(repoRoot));
  } catch (err) {
    if (err instanceof GitError) {
      throw new CliError(`prless: ${repoRoot} is not a git repository.`);
    }
    throw err;
  }
}

type Resolution = { port: number; repoRoot?: string } | null; // null = cancelled

/** Numbered list of running servers (port · folder · age). */
function renderInstances(instances: registry.Instance[], numbered: boolean): string {
  return instances
    .map((inst, i) => {
      const idx = numbered ? dim(`${String(i + 1).padStart(2)}  `) : '';
      return `    ${idx}${cyan(inst.port)}   ${tildify(inst.repoRoot)}   ${dim(since(inst.startedAt))}`;
    })
    .join('\n');
}

/**
 * All ports are busy. Interactively let the user stop a running server and
 * reuse its port (optionally switching to the folder picker), or cancel.
 * Returns the chosen port (+ repoRoot), or null to cancel.
 */
async function resolveConflict(start: number, repoRoot?: string): Promise<Resolution> {
  const instances = registry.list();
  const range = `${start}–${start + MAX_PORT_ATTEMPTS - 1}`;

  if (instances.length === 0) {
    throw new CliError(
      `Ports ${range} are all in use, and none of them are prless.\n` +
        `Free one up, or pick a port:  prless --port <number>`,
    );
  }

  console.log(`\n  ${red('✗')} ${bold(`All ports ${range} are in use by prless.`)}\n`);
  console.log(renderInstances(instances, true));
  console.log('');

  if (!process.stdin.isTTY) {
    throw new CliError(
      `All ports are in use. Stop one with 'prless stop <port>', or pass --port <number>.`,
    );
  }

  const target = repoRoot ? tildify(repoRoot) : 'the folder picker';
  console.log(`  ${bold('Free a port:')}`);
  console.log(`    ${cyan(`1–${instances.length}`)}  stop that server and open ${target} on its port`);
  console.log(`    ${cyan('p')}     stop one and pick a folder in the browser instead`);
  console.log(`    ${cyan('c')}     cancel\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const ans = (await rl.question(`  ${cyan('›')} `)).trim().toLowerCase();
      if (ans === '' || ans === 'c') return null;

      const picker = ans === 'p' || ans.startsWith('p');
      let token = picker ? ans.slice(1).trim() : ans;
      if (picker && token === '') {
        token = (await rl.question(`  stop which server? ${cyan(`1–${instances.length}`)} `)).trim();
      }

      const n = Number(token);
      if (Number.isInteger(n) && n >= 1 && n <= instances.length) {
        const inst = instances[n - 1];
        console.log(`  stopping prless on ${cyan(inst.port)} (${tildify(inst.repoRoot)})…`);
        if (!(await stopAndWait(inst))) {
          console.log(`  ${yellow('!')} port ${inst.port} didn't free up in time — try another.`);
          continue;
        }
        return { port: inst.port, repoRoot: picker ? undefined : repoRoot };
      }
      console.log(`  enter a number 1–${instances.length}, p, or c.`);
    }
  } finally {
    rl.close();
  }
}

/** Find a free port (auto-incrementing); prompt to free one if all are busy. */
async function resolvePort(flags: ServeFlags, repoRoot?: string): Promise<Resolution> {
  const free = await findFreePort(flags.port);
  return free !== null ? { port: free, repoRoot } : resolveConflict(flags.port, repoRoot);
}

/** Record this server in the registry and clean up on exit. */
function registerInstance(port: number, repoRoot?: string): void {
  registry.register({
    port,
    repoRoot: repoRoot ?? null,
    name: repoRoot ? path.basename(repoRoot) : '(no repo)',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
  const cleanup = () => registry.deregister(port);
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      cleanup();
      process.exit(0);
    });
  }
}

/** Listen on a resolved port, register, report, and open the browser. */
async function listenAndServe(
  app: Awaited<ReturnType<typeof buildServer>>,
  flags: ServeFlags,
  port: number,
  repoRoot?: string,
): Promise<void> {
  try {
    await app.listen({ port, host: '127.0.0.1' });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new CliError(`Port ${port} was taken just before starting. Try again.`);
    }
    throw err;
  }

  registerInstance(port, repoRoot);

  const url = flags.dev ? `http://localhost:5174` : `http://localhost:${port}`;
  if (repoRoot) console.log(`prless: reviewing ${repoRoot}`);
  else console.log('prless: no repository selected — choose a project in the browser');
  if (port !== flags.port) console.log(`prless: port ${flags.port} was busy, using ${port}`);
  console.log(`prless: serving ${flags.dev ? 'API' : 'UI'} on http://localhost:${port}`);
  if (flags.dev) console.log(`prless: open the Vite dev server at ${url}`);

  if (!flags.dev && !flags.noOpen) {
    await open(url).catch(() => {
      console.log(`prless: open ${url} in your browser`);
    });
  }

  // Tell the user (once, in the background) if a newer version is published.
  notifyIfOutdated();
}

/** Validate the repo, resolve a port (prompting on conflict), build, and serve. */
async function launch(flags: ServeFlags, repoRoot?: string): Promise<void> {
  if (repoRoot) await assertRepo(repoRoot);

  const resolved = await resolvePort(flags, repoRoot);
  if (resolved === null) {
    console.log('prless: cancelled.');
    return;
  }

  const app = await buildServer({
    repoRoot: resolved.repoRoot,
    dev: flags.dev,
    paths: flags.paths,
  });
  await listenAndServe(app, flags, resolved.port, resolved.repoRoot);
}

function runOpen(opts: OpenOptions): Promise<void> {
  return launch(opts, opts.repoRoot);
}

function runNoRepo(flags: ServeFlags): Promise<void> {
  return launch(flags);
}

/** `prless ls` — show running servers. */
function runList(): void {
  const instances = registry.list();
  if (instances.length === 0) {
    console.log('No prless servers are running.');
    return;
  }
  const n = instances.length;
  console.log(`\n  ${bold(`prless — ${n} server${n === 1 ? '' : 's'} running`)}\n`);
  console.log(`    ${dim('PORT')}   ${dim('FOLDER')}`);
  console.log(renderInstances(instances, false));
  console.log(`\n  ${dim('Stop one:  prless stop <port>   (or: prless stop all)')}\n`);
}

/** `prless stop <port|all>` — stop running servers. */
function runStop(arg: string | undefined): void {
  if (!arg) throw new CliError('Usage: prless stop <port|all>');

  if (arg === 'all') {
    const instances = registry.list();
    if (instances.length === 0) {
      console.log('No prless servers are running.');
      return;
    }
    for (const inst of instances) registry.stop(inst);
    console.log(`${green('✓')} stopped ${instances.length} prless server(s).`);
    return;
  }

  const port = Number(arg);
  if (!Number.isInteger(port)) throw new CliError(`Invalid port "${arg}". Use a number or "all".`);
  const inst = registry.find(port);
  if (!inst) {
    throw new CliError(`No prless server is running on port ${port}. Run 'prless ls' to see what is.`);
  }
  registry.stop(inst);
  console.log(`${green('✓')} stopped prless on port ${port} (${tildify(inst.repoRoot)}).`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);

  switch (command) {
    case 'open':
      await runOpen(parseOpenArgs(rest));
      break;
    case 'ls':
    case 'list':
    case 'ports':
      runList();
      break;
    case 'stop':
    case 'close':
      runStop(rest[0]);
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
