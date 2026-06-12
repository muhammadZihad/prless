<p align="center">
  <img src="src/web/public/icon.svg" width="84" height="84" alt="PRless logo" />
</p>

<h1 align="center">PRless</h1>

<p align="center">
  <strong>PR-style code review without the pull request.</strong><br/>
  Review a local git diff in your browser, comment inline, and hand the notes to an AI agent.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@muhammad_zihad/prless"><img src="https://img.shields.io/npm/v/@muhammad_zihad/prless.svg?color=6d54e0&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@muhammad_zihad/prless"><img src="https://img.shields.io/npm/dm/@muhammad_zihad/prless.svg?color=6d54e0" alt="npm downloads" /></a>
  <img src="https://img.shields.io/node/v/@muhammad_zihad/prless.svg?color=6d54e0" alt="node version" />
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@muhammad_zihad/prless.svg?color=6d54e0" alt="license" /></a>
</p>

<!-- TODO: add a screenshot or short GIF of the diff view + Export for AI here -->

---

## Why PRless?

When you ask an AI agent to fix something, your feedback is usually disconnected from the
code: you describe a change in prose, or push a branch and open a PR just to review it.

PRless gives AI code review the thing human review already has: **comments pinned to exact
lines**. You review a diff like a GitHub PR, leave inline comments, then export them as a
clipboard-ready prompt for Claude Code, Codex, or any CLI agent. No remote, no PR, no API
keys. The whole loop stays on your machine.

## Features

- 🧩 **GitHub-style diff view** for any local git repo (working tree, staged, or branch compare).
- 💬 **Inline comments** anchored to specific lines, with resolve / reopen / delete.
- 🤖 **One-click AI handoff** — copies agent-ready instructions to your clipboard and writes `.prless/review.md`.
- 🎨 **Light & dark themes** plus selectable syntax themes (GitHub, Dracula, Nord, One Dark, Monokai, Solarized).
- 🪶 **Token-savvy** — resolved comments stay on disk but are excluded from the AI export.
- 🖥️ **Cross-platform** — macOS, Linux, and Windows, with bundled offline fonts.

## Installation

Requires **Node.js 18+**.

```bash
npm install -g @muhammad_zihad/prless
```

This adds a `prless` command to your `PATH` (on Windows, npm generates the `.cmd` /
PowerShell shims automatically). Prefer not to install globally? Run it on demand:

```bash
npx @muhammad_zihad/prless open .
```

## Quick start

```bash
cd your-project
prless open .
```

1. Your browser opens with the diff of your uncommitted changes.
2. Click a line's gutter to leave a comment, just like a GitHub PR.
3. Hit **Export for AI** — the instructions are copied to your clipboard. Paste them into
   your agent:

```bash
claude            # then paste, or: "address the comments in .prless/review.md"
# or
codex "address the comments in .prless/review.md"
```

The agent reads each comment, makes the change, and you re-review. That is the whole loop.

## Commands

```bash
prless                              # start with no repo; pick a folder in the browser
prless open                         # review the current directory (same as: prless open .)
prless open ~/projects/my-app       # review a repo by path
prless open . --port 4200           # serve on a custom port (default 4100)
prless open . --no-open             # don't launch a browser automatically
prless open . -- src app tests      # limit the review to specific paths
prless help                         # show usage
prless --version                    # show the installed version
```

| Option | Description |
| --- | --- |
| `--port <n>` | Port to serve on (default `4100`, or `$PRLESS_PORT`). |
| `--no-open` | Skip auto-opening the browser. |
| `-- <paths…>` | Limit the review to the given paths (everything after `--`). |

### Hiding files with `.prlessignore`

Drop a `.prlessignore` file (gitignore syntax) at your repo root to keep generated/noisy
files out of the review:

```gitignore
dist/
build/
coverage/
package-lock.json
*.min.js
```

Matching files are excluded from the diff and the export. The diff view also has a file
search box, a **Commented** filter, and a **Hide generated** toggle; generated and very
large files collapse by default.

## How it works

```
 ┌──────────┐   review    ┌───────────┐   export    ┌─────────────────┐   apply   ┌───────────┐
 │ git diff │ ──────────▶ │  PRless   │ ──────────▶ │ .prless/review.md │ ───────▶ │  AI agent │
 └──────────┘   inline    │  (browser)│  + clipboard │  (open comments)  │          └───────────┘
                comments  └───────────┘              └─────────────────┘
```

- Comments persist in `.prless/comments.json` in your repo. Add `.prless/` to `.gitignore`.
- `.prless/review.md` groups every **open** comment by file, with the target line and the
  requested change. Resolved comments are kept in the JSON but left out of the export, so
  the agent never spends tokens on them.
- The handoff is a plain file plus a clipboard copy, so it works with any agent. No MCP,
  no API keys.

## Local-only & privacy

PRless runs entirely on your machine. It does not send your code, diffs, or comments to
any external server, and it makes no network calls of its own.

- The server binds to `127.0.0.1` only — it is not reachable from your network.
- Everything is stored under `.prless/` in your repo: `comments.json` (your comments) and
  `review.md` (the exported handoff).
- The only thing that leaves PRless is what *you* paste into your AI agent.

## Configuration

- **App theme** — light or dark, defaults to your OS setting and is remembered per browser.
- **Syntax theme** — Auto, GitHub Light/Dark, One Dark, Dracula, Nord, Monokai, or
  Solarized Light. The diff renders as a self-contained editor surface, so any code theme
  looks right regardless of the app theme.
- **View** — split or unified.

## Development

```bash
git clone https://github.com/muhammadZihad/prless.git
cd prless
npm install        # builds automatically via the prepare script

npm run dev        # Vite UI on :5174 (proxying /api) + API on :4100 with reload
npm test           # vitest: cli, git, comments, export, schemas, e2e
npm run typecheck
npm run build      # bundle the web app and compile the server into dist/
```

### Project structure

```
src/
  shared/   # types shared by the server and web app
  server/   # Fastify API + CLI: git diff, comment store, review.md export
  web/      # React + Vite UI (react-diff-view, syntax highlighting, theming)
```

## Scope

PRless is intentionally local and single-user: no GitHub PR ingestion, no accounts, no
database, no MCP. The handoff is the exported file. These are deliberate non-goals that
could be layered on later.

## License

[MIT](./LICENSE) © Muhammad AR Zihad
