# PRless

A local, GitHub-style code review tool with an agent-agnostic AI handoff. Review a local
git diff in the browser, leave inline comments anchored to specific lines, then export the
comments to a file that any CLI coding agent (Claude Code, Codex, …) can read and act on.

## Install

Requires **Node.js 18+**. One command on every platform — macOS, Linux, and Windows:

```bash
npm install -g @muhammad_zihad/prless
```

That puts a `prless` command on your PATH (on Windows, npm generates the `.cmd`/PowerShell
shims automatically). Prefer not to install globally? Run it on demand with `npx`:

```bash
npx @muhammad_zihad/prless open .
```

### From source

```bash
git clone https://github.com/muhammadZihad/prless.git && cd prless
npm install        # builds automatically via the prepare script
npm link           # makes `prless` available globally
```

## Use

```bash
prless open .                  # review the git repo in the current directory
prless open ~/projects/my-app  # review a repo by path
prless open ./my-app --port 4200
prless help                    # show usage
```

Works on macOS, Linux, and Windows. This starts a local server and opens the UI in your
browser. You can:

- **Pick a diff source** — working tree vs HEAD, staged vs HEAD, or compare two branches.
- **Comment inline** — click a line's gutter to leave a comment (⌘/Ctrl+Enter to submit).
- **Resolve / delete** comments; toggle split / unified view.
- **Switch the app theme** — light or dark (defaults to your OS setting, remembered per browser).
- **Choose a syntax theme** — Auto, GitHub Light/Dark, One Dark, Dracula, Nord, Monokai,
  Solarized Light. The diff renders as a self-contained editor surface, so any code theme
  looks right regardless of the app theme.
- **Export for AI** — writes open comments to `.prless/review.md`.

Typography uses Geist (UI) and JetBrains Mono (code), bundled locally so it works offline.

Comments persist in `.prless/comments.json` in the repo (gitignore the `.prless/` folder).

## Hand off to an agent

After exporting, run your agent in the repo and point it at the file:

```bash
claude   # then: "address the comments in .prless/review.md"
# or
codex "address the comments in .prless/review.md"
```

`review.md` lists each open comment grouped by file, with the target line, side, and the
requested change — no API keys or MCP required.

## Develop

```bash
npm run dev        # Vite UI on :5174 (proxying /api) + API on :4100 with reload
npm test           # vitest (git, comments, export)
npm run typecheck
```

## Layout

```
src/
  shared/types.ts        # types shared by server + web
  server/                # Fastify API + CLI (git diff, comment store, review.md export)
  web/                   # React + Vite UI (react-diff-view)
```

## Scope

Local, single-user. No GitHub PR ingestion, no auth/DB, no MCP — handoff is the exported
file. These are deliberate non-goals and can be layered on later.
