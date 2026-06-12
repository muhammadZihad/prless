import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError, parseOpenArgs, parsePort } from './cli.js';

describe('parsePort', () => {
  it('accepts a valid port', () => {
    expect(parsePort('4100')).toBe(4100);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
  });

  it('rejects out-of-range, non-integer, empty, and missing values', () => {
    for (const bad of ['0', '65536', '-1', 'abc', '12.5', '', '   ', undefined]) {
      expect(() => parsePort(bad)).toThrow(CliError);
    }
  });
});

describe('parseOpenArgs', () => {
  const original = process.env.PRLESS_PORT;

  beforeEach(() => {
    delete process.env.PRLESS_PORT;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PRLESS_PORT;
    else process.env.PRLESS_PORT = original;
  });

  it('resolves the repo path and applies defaults', () => {
    const opts = parseOpenArgs(['.']);
    expect(opts.repoRoot).toBe(path.resolve('.'));
    expect(opts.port).toBe(4100);
    expect(opts.dev).toBe(false);
    expect(opts.noOpen).toBe(false);
  });

  it('parses flags', () => {
    const opts = parseOpenArgs(['.', '--port', '4200', '--no-open']);
    expect(opts.port).toBe(4200);
    expect(opts.noOpen).toBe(true);
  });

  it('honours PRLESS_PORT when no --port is given', () => {
    process.env.PRLESS_PORT = '5000';
    expect(parseOpenArgs(['.']).port).toBe(5000);
  });

  it('rejects an invalid --port', () => {
    expect(() => parseOpenArgs(['.', '--port', 'nope'])).toThrow(CliError);
    expect(() => parseOpenArgs(['.', '--port'])).toThrow(CliError);
  });

  it('requires a repository path', () => {
    expect(() => parseOpenArgs([])).toThrow(CliError);
    expect(() => parseOpenArgs(['--no-open'])).toThrow(CliError);
  });
});
