import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deregister, find, list, register } from './registry.js';

describe('registry', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'prless-reg-'));
    process.env.PRLESS_REGISTRY_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.PRLESS_REGISTRY_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  const inst = (port: number, pid: number) => ({
    port,
    repoRoot: `/repo/${port}`,
    name: String(port),
    pid,
    startedAt: '2026-06-15T00:00:00.000Z',
  });

  it('registers and lists live instances, sorted by port', () => {
    register(inst(4101, process.pid));
    register(inst(4100, process.pid));
    const ports = list().map((i) => i.port);
    expect(ports).toEqual([4100, 4101]);
    expect(find(4100)?.repoRoot).toBe('/repo/4100');
  });

  it('prunes instances whose process is no longer alive', () => {
    register(inst(4100, process.pid)); // alive (this test process)
    register(inst(4101, 2 ** 30)); // a pid that is essentially never alive
    const ports = list().map((i) => i.port);
    expect(ports).toEqual([4100]);
    expect(find(4101)).toBeNull();
  });

  it('deregisters an instance', () => {
    register(inst(4100, process.pid));
    deregister(4100);
    expect(list()).toEqual([]);
  });
});
