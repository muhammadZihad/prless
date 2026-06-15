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

## Updating

PRless checks npm on startup and tells you when a newer version is published. To update:

```bash
npm install -g @muhammad_zihad/prless@latest
```

(With `npx`, you always get the latest — append `@latest` to be sure: `npx @muhammad_zihad/prless@latest`.)

The update check is a single best-effort request for the latest version number and sends no
data. Disable it by setting `PRLESS_NO_UPDATE_CHECK=1`.

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
prless ls                           # list running prless servers (port + folder)
prless stop 4100                    # stop the server on a port
prless stop all                     # stop every running server
prless help                         # show usage
prless --version                    # show the installed version
```

If a port is busy, prless automatically uses the next free one (up to 10). When all are
taken it shows the running servers so you can stop one and reuse its port, pick a different
folder, or cancel.

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

The exported `review.md` opens with a short summary and groups comments by file. It contains
only unresolved comments. Tick individual comments to **export just those**.

## Local-only & privacy

PRless runs entirely on your machine. It does not send your code, diffs, or comments to
any external server.

- The server binds to `127.0.0.1` only — it is not reachable from your network.
- Everything is stored under `.prless/` in your repo: `comments.json` (your comments) and
  `review.md` (the exported handoff).
- The only outbound request is the startup version check (latest version number from npm,
  no data sent) — disable it with `PRLESS_NO_UPDATE_CHECK=1`.
- The only thing that leaves PRless is what *you* paste into your AI agent.

## Configuration

PRless remembers your preferences per browser — app theme, syntax theme, split/unified view,
single-file vs all-files, and the filter toggles all persist across reloads.

- **App theme** — light or dark, defaults to your OS setting.
- **Syntax theme** — pick from a modal with live previews: Auto plus GitHub Light/Dark, One
  Dark, Dracula, Nord, Monokai, Tokyo Night, Catppuccin Mocha, Gruvbox Dark, Night Owl, Ayu
  Dark, and Solarized Light/Dark. The diff renders as a self-contained editor surface, so any
  code theme looks right regardless of the app theme.
- **View** — split or unified (icon toggle in the toolbar).
- **Keyboard shortcuts** — `j` / `k` to move between files, `mod+]` / `mod+[` for split /
  unified, `/` to search, `f` single-file view, `e` export, and more. Press `?` for a help
  modal that lists every shortcut and lets you rebind them (saved per browser).

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
