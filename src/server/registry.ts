import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A running prless server, recorded so other invocations can list/stop it. */
export interface Instance {
  port: number;
  repoRoot: string | null;
  name: string;
  pid: number;
  startedAt: string; // ISO
}

/** Registry dir (overridable for tests). One <port>.json file per instance. */
function registryDir(): string {
  return process.env.PRLESS_REGISTRY_DIR ?? path.join(os.tmpdir(), 'prless-instances');
}

function fileFor(port: number): string {
  return path.join(registryDir(), `${port}.json`);
}

/** Whether a pid is still running (EPERM means it exists but isn't ours). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function register(inst: Instance): void {
  try {
    mkdirSync(registryDir(), { recursive: true });
    writeFileSync(fileFor(inst.port), `${JSON.stringify(inst)}\n`, 'utf8');
  } catch {
    // The registry is a convenience; never let it break startup.
  }
}

export function deregister(port: number): void {
  try {
    unlinkSync(fileFor(port));
  } catch {
    // already gone
  }
}

/** All live instances, pruning any whose process has exited. */
export function list(): Instance[] {
  let entries: string[];
  try {
    entries = readdirSync(registryDir());
  } catch {
    return [];
  }
  const live: Instance[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const full = path.join(registryDir(), entry);
    try {
      const inst = JSON.parse(readFileSync(full, 'utf8')) as Instance;
      if (isAlive(inst.pid)) live.push(inst);
      else unlinkSync(full); // prune dead
    } catch {
      // ignore corrupt/locked entry
    }
  }
  return live.sort((a, b) => a.port - b.port);
}

export function find(port: number): Instance | null {
  return list().find((i) => i.port === port) ?? null;
}

/** Ask the instance to shut down (its SIGTERM handler frees the port). */
export function stop(inst: Instance): void {
  try {
    process.kill(inst.pid, 'SIGTERM');
  } catch {
    // process already gone
  }
  deregister(inst.port);
}
