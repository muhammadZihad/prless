# PRless for VS Code

PR-style local code review, inside the editor. Review your working-tree, staged,
or branch-compare diff; leave inline, range, and whole-file comments; then export
the open comments to `.prless/review.md` (and your clipboard) for any AI agent.

## Usage

1. Open a git repository in VS Code.
2. Click the **PRless** icon in the **Source Control** title bar — or run
   **PRless: Review Changes** from the Command Palette — to open the diff in an
   editor tab (badged with the PRless icon).
3. Click a line's gutter to comment, just like a GitHub PR; range and whole-file
   comments work too.
4. Hit **Export for AI** — the prompt is copied to your clipboard and written to
   `.prless/review.md`.
5. Optionally run **PRless: Send Review to Agent Terminal** to run your configured
   agent command (`prless.agentCommand`) against the exported review.

Everything stays local. Comments persist in `.prless/comments.json`; add `.prless/`
to your `.gitignore` to keep them out of commits.

## Build & install from source

Not on the Marketplace yet — build the `.vsix` from the repo root:

```bash
npm install
npm run package:ext            # -> extension/prless-vscode-<version>.vsix
code --install-extension extension/prless-vscode-*.vsix
```

To iterate without installing, launch an Extension Development Host with PRless loaded:

```bash
npm run build:ext              # refresh extension/dist + extension/media
code --extensionDevelopmentPath="$PWD/extension" /path/to/a/git/repo
```
