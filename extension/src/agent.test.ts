import { describe, expect, it } from 'vitest';
import { agentCommand } from '../../src/server/export.js';
import { resolveAgentCommand } from './agent.js';

describe('resolveAgentCommand', () => {
  it('prefers a non-empty user setting', () => {
    expect(resolveAgentCommand('claude "go"')).toBe('claude "go"');
  });

  it('trims whitespace-only settings to the default', () => {
    expect(resolveAgentCommand('   ')).toBe(agentCommand('generic'));
  });

  it('falls back to the default when unset', () => {
    expect(resolveAgentCommand(undefined)).toBe(agentCommand('generic'));
  });
});
