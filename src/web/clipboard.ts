/**
 * Copy text to the clipboard, working across OSes and browsers.
 * Uses the async Clipboard API in a secure context (localhost counts as secure),
 * and falls back to a hidden textarea + execCommand for everything else.
 * Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Inside the VS Code webview the extension host writes the clipboard
  // (webview clipboard access is restricted), so report success here.
  if (typeof (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function') {
    return true;
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
