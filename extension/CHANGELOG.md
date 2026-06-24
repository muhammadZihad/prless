# Change Log

## 0.1.0

Initial release.

- Review a local git diff (working tree / staged / branch compare) in an editor-tab webview.
- Inline, multi-line range, and whole-file comments with drift ("code changed") and
  orphaned-comment detection.
- One-click **Export for AI**: writes `.prless/review.md` and copies an agent-ready prompt
  to the clipboard; optional **Send Review to Agent Terminal** command runs a configurable
  agent command (`prless.agentCommand`).
- Launch from the Source Control title button or the `PRless: Review Changes` command.
- Everything stays local — comments persist in `.prless/comments.json`.
