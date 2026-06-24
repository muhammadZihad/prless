import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('prless.review', () => {
      vscode.window.showInformationMessage('PRless: review panel coming online…');
    }),
  );
}

export function deactivate(): void {
  // no-op
}
