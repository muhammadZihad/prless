import * as vscode from 'vscode';
import { RepoSession, type ActiveRepo } from '../../src/server/session.js';
import { createGit } from '../../src/server/git.js';
import { handleMessage, type BridgeDeps } from './bridge.js';
import { getHtml } from './html.js';
import { resolveAgentCommand } from './agent.js';

let panel: vscode.WebviewPanel | undefined;
const session = new RepoSession();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('prless.review', () => openReview(context)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('prless.sendToAgent', () => {
      const setting = vscode.workspace.getConfiguration('prless').get<string>('agentCommand');
      const command = resolveAgentCommand(setting);
      const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('PRless');
      terminal.show();
      terminal.sendText(command, false);
    }),
  );
}

function openReview(context: vscode.ExtensionContext): void {
  // Default the repo to the first workspace folder.
  if (!session.current) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) session.setRepo(folder.uri.fsPath);
  }

  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
    return;
  }

  const mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
  panel = vscode.window.createWebviewPanel('prless.review', 'PRless', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [mediaUri],
  });
  // Brand the editor tab with the PRless logo instead of the generic file icon.
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icons', 'prless.svg');

  const webview = panel.webview;
  const nonce = makeNonce();
  webview.html = getHtml({
    scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'webview.js')).toString(),
    styleUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'webview.css')).toString(),
    cspSource: webview.cspSource,
    nonce,
  });

  const deps = makeDeps();
  webview.onDidReceiveMessage(async (msg: { id: number; op: string; payload?: unknown }) => {
    const response = await handleMessage(msg, deps);
    void webview.postMessage(response);
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function makeDeps(): BridgeDeps {
  return {
    getRepo: () => session.current,
    pickRepo: pickRepo,
    paths: [],
    now: () => new Date().toISOString(),
    copyToClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
  };
}

/** VS Code equivalent of the CLI folder picker: workspace folder pick or open dialog. */
async function pickRepo(): Promise<{ repoRoot: string; name: string } | null> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  let chosen: string | undefined;

  if (folders.length > 1) {
    const pick = await vscode.window.showWorkspaceFolderPick();
    chosen = pick?.uri.fsPath;
  } else if (folders.length === 1) {
    chosen = folders[0].uri.fsPath;
  }

  if (!chosen) {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select a project folder',
    });
    chosen = uris?.[0]?.fsPath;
  }

  if (!chosen) return null; // cancelled

  if (!(await createGit(chosen).checkIsRepo())) {
    void vscode.window.showErrorMessage(`${chosen} is not a git repository.`);
    return null;
  }

  const repo: ActiveRepo = session.setRepo(chosen);
  return { repoRoot: repo.repoRoot, name: repo.name };
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function deactivate(): void {
  // no-op
}
