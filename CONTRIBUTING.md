# Contributing to PRless

Thanks for your interest in improving PRless! This project is intentionally small and
local-first — contributions that keep it focused and dependency-light are especially welcome.

## Development setup

Requires **Node.js 18+**.

```bash
git clone https://github.com/muhammadZihad/prless.git
cd prless
npm install        # builds automatically via the prepare script
npm run dev        # Vite UI on :5174 (proxying /api) + API on :4100 with reload
```

## Checks

Before opening a pull request, make sure all of these pass locally — CI runs the same
steps on Linux, macOS, and Windows across Node 18/20/22:

```bash
npm run typecheck
npm test
npm run build
```

## Pull request guidelines

- Keep PRs focused — one logical change per PR.
- Add or update tests for any behavior you change (`src/**/*.test.ts`).
- Update the README when you change user-facing behavior, and add a `CHANGELOG.md` entry
  under **Unreleased**.
- Avoid introducing network calls. PRless is local-only by design; if a change needs one,
  call it out explicitly in the PR description.
- Match the existing code style (TypeScript, ES modules, no new lint exceptions).

## Project structure

```
src/
  shared/   # types shared by the server and web app
  server/   # Fastify API + CLI: git diff, comment store, review.md export
  web/      # React + Vite UI (react-diff-view, syntax highlighting, theming)
```

## Reporting bugs

Open an issue with the command you ran, what you expected, what happened, and your OS and
Node version.
