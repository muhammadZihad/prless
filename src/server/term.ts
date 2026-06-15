import os from 'node:os';
import path from 'node:path';

const tty = !!process.stdout.isTTY;
const style = (code: string) => (s: string | number) =>
  tty ? `\x1b[${code}m${s}\x1b[0m` : String(s);

export const bold = style('1');
export const dim = style('2');
export const cyan = style('36');
export const green = style('32');
export const red = style('31');
export const yellow = style('33');

/** Replace the home dir with ~, and show a friendly label for no-repo servers. */
export function tildify(p: string | null): string {
  if (!p) return '(folder picker)';
  const home = os.homedir();
  if (p === home) return '~';
  return p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

/** Compact "12s / 5m / 3h / 2d" since an ISO timestamp. */
export function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
