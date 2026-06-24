import { agentCommand } from '../../src/server/export.js';

/** The command to run in the terminal: the user's setting, else the generic default. */
export function resolveAgentCommand(setting: string | undefined): string {
  const trimmed = setting?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : agentCommand('generic');
}
