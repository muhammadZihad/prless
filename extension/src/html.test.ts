import { describe, expect, it } from 'vitest';
import { getHtml } from './html.js';

describe('getHtml', () => {
  const html = getHtml({
    scriptUri: 'vscode-resource://media/webview.js',
    styleUri: 'vscode-resource://media/webview.css',
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
  });

  it('locks scripts to the nonce', () => {
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('nonce="abc123"');
  });

  it('references the built bundle and stylesheet', () => {
    expect(html).toContain('vscode-resource://media/webview.js');
    expect(html).toContain('vscode-resource://media/webview.css');
  });

  it('allows styles and fonts from the webview source', () => {
    expect(html).toContain('vscode-resource:');
    expect(html).toContain('<div id="root">');
  });
});
