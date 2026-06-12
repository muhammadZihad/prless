import { spawn } from 'node:child_process';

export class PickerUnavailableError extends Error {}

/** Run a picker command (no shell) and resolve its trimmed stdout, or '' on cancel. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    child.on('error', reject); // e.g. ENOENT when the tool isn't installed
    child.on('close', () => resolve(out.trim()));
  });
}

/** Try a sequence of Linux dialog tools, falling through on ENOENT. */
async function pickLinux(): Promise<string> {
  const candidates: Array<[string, string[]]> = [
    ['zenity', ['--file-selection', '--directory', '--title=Select a project folder']],
    ['kdialog', ['--getexistingdirectory', process.env.HOME ?? '.']],
  ];
  for (const [cmd, args] of candidates) {
    try {
      return await run(cmd, args);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // try the next tool
      throw err;
    }
  }
  throw new PickerUnavailableError(
    'No folder dialog found. Install zenity or kdialog, or start prless with a path: prless open <path>.',
  );
}

/**
 * Open the OS native folder-selection dialog and return the chosen absolute
 * path, or null if the user cancelled. Throws PickerUnavailableError when no
 * dialog tool is available (e.g. a headless session).
 */
export async function pickFolder(): Promise<string | null> {
  let result: string;
  try {
    if (process.platform === 'darwin') {
      // `choose folder` throws on cancel; the try/on-error returns an empty string.
      result = await run('osascript', [
        '-e',
        'try',
        '-e',
        'POSIX path of (choose folder with prompt "Select a project folder")',
        '-e',
        'on error',
        '-e',
        'return ""',
        '-e',
        'end try',
      ]);
    } else if (process.platform === 'win32') {
      const ps =
        'Add-Type -AssemblyName System.Windows.Forms; ' +
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
        "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }";
      result = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else {
      result = await pickLinux();
    }
  } catch (err) {
    if (err instanceof PickerUnavailableError) throw err;
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PickerUnavailableError('No folder dialog is available on this system.');
    }
    throw err;
  }

  return result.length ? result : null;
}
