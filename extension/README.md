# PRless for VS Code

PR-style local code review, inside the editor. Review your working-tree, staged,
or branch-compare diff; leave inline, range, and whole-file comments; then export
the open comments to `.prless/review.md` (and your clipboard) for any AI agent.

## Usage

1. Open a git repository in VS Code.
2. Run **PRless: Review Changes** from the Command Palette (or the Source Control title bar).
3. Comment on the diff, then click **Export for AI** — the prompt is copied to your
   clipboard and written to `.prless/review.md`.
4. Optionally run **PRless: Send Review to Agent Terminal** to run your configured
   agent command (`prless.agentCommand`) against the exported review.

Everything stays local. Comments persist in `.prless/comments.json`; add `.prless/`
to your `.gitignore` to keep them out of commits.
