# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Resizable sidebar: drag the divider between the file list and the diff to shrink/widen it
  (double-click to reset). The width is remembered across reloads.
- A sticky notice at the bottom of the sidebar when a newer version is published, with a
  one-click "Copy update command" (`npm install -g …@latest`).

### Changed

- Decluttered the sidebar filters into a compact row of icon toggles (Commented, Generated,
  one-file/all-files) under the search box.
- The working diff now always includes staged + unstaged changes and untracked files
  (excluding gitignored). Removed the "unstaged + untracked / staged only" toggle.
- PRless's own `.prless/` files (comments.json, review.md) are always excluded from the diff,
  so commenting no longer adds noise to your own review.

## [0.7.0] - 2026-06-16

### Added

- Multi-line range comments: drag across line numbers (or click then shift-click) to select a
  block, and leave one comment for the whole range (rendered as "Lines X–Y" in the export).
- Auto-select a free port: if the chosen port is busy, prless tries the next ones (up to 10)
  and serves on the first free one.
- `prless ls` lists running prless servers (port + folder), and `prless stop <port|all>` stops them.
- When all ports are busy, an interactive menu shows the running servers so you can stop one and
  reuse its port (for the requested folder or the browser picker), or cancel.
- Single-file view: a sidebar toggle to render only the file selected in the sidebar instead
  of all changed files at once, so you don't scroll past everything.
- Keyboard shortcuts for navigation and most toolbar actions (e.g. `j`/`k` next/previous file,
  `mod+]`/`mod+[` split/unified, `/` search, `e` export). Press `?` for a help modal that lists
  and lets you **rebind** any shortcut; custom bindings are saved per browser.
- Syntax theme picker is now a modal with live previews, plus more themes (Tokyo Night,
  Catppuccin Mocha, Gruvbox Dark, Night Owl, Ayu Dark, Solarized Dark). The toolbar button
  shows the current theme name.
- Split/unified view is now an icon toggle with a tooltip.
- Remembers your preferences across reloads: split/unified view, syntax theme, light/dark,
  single-file vs all-files, and the hide-generated / unstaged toggles.

### Fixed

- Clicking a file in the sidebar now puts it in the URL (`#file-<path>`) and scrolls it into
  view, so the link is shareable and survives a reload.
- Reloading a tab with a `#file-<path>` hash scrolls that file into view once the diff has
  loaded (previously the async diff meant the browser couldn't honor the hash on reload).

## [0.6.0] - 2026-06-15

### Added

- Startup check that notifies when a newer version is published, with the update command.
  Best-effort, sends no data, and can be disabled with `PRLESS_NO_UPDATE_CHECK=1`.

### Fixed

- Globally-installed `prless` did nothing: the "invoked directly" check compared the symlinked
  bin path against the resolved module path. It now compares real paths, so the npm global bin
  runs correctly.

### Changed

- CI: bump `actions/checkout` and `actions/setup-node` to v5 (Node 24 runtime) to clear the
  Node 20 deprecation.

## [0.5.0] - 2026-06-14

### Added

- Improved, numbered AI instruction header and a `## Summary` section in the exported review.
- Per-comment selection — tick comments to export just those.
- Cancel/close button (and Esc) on the comment composer; line composers open on click and
  existing threads get an "Add a comment" button.
- Show/hide unstaged + untracked toggle (working mode). Untracked files now render as
  new-file diffs so they're reviewable; turning it off gives a staged-only view.

### Changed

- Decluttered the header: file search and the Commented / Hide-generated filters moved into the
  file-list sidebar.

## [0.4.0] - 2026-06-12

### Added

- Run bare `prless` to start with no repository selected and pick a folder from the native OS
  dialog in the browser; `prless open` with no path now defaults to the current directory.
- Durable comment anchors: comments store surrounding context + the hunk header.
- Comment drift detection — a "code changed" badge when an anchor line no longer matches.
- Orphaned comments: a dedicated UI section and an `## Orphaned Comments` block in the export
  for comments whose anchor is gone.
- File-level comments (a "+ File comment" button per file).
- `.prlessignore` support (gitignore syntax) to hide generated/noisy files.
- Path filters: `prless open . -- <paths>` scopes the review to those paths.
- File search box, a "Commented only" filter, and "Hide generated" toggle.
- Generated and very large files collapse by default with click-to-expand.
- Large-diff warning banner with mitigation hints.

## [0.3.0] - 2026-06-12

### Added

- GitHub Actions CI: typecheck, test, build, and `npm pack --dry-run` on a matrix of
  Ubuntu/macOS/Windows × Node 18/20/22.
- Automated npm release workflow on `v*` tags, publishing with provenance via OIDC
  Trusted Publishing.
- `prless --version` / `-v`.
- Warning (UI banner + exported review note) for untracked files that are not part of the diff.
- `@fastify/helmet` security headers with a same-origin Content-Security-Policy.
- End-to-end test covering the diff → comment → export → resolve workflow.

### Changed

- CLI argument validation: `--port` must be an integer in `1–65535`; clearer error messages.
- API request payloads are validated with `zod`.
- `.prless/comments.json` now uses a versioned `{ version, comments }` envelope and is
  written atomically (temp file + rename). Legacy bare-array files are read transparently.
- Expanded `package.json` metadata for npm (author, keywords, `publishConfig`).

### Fixed

- Port conflicts (`EADDRINUSE`) now print a friendly message suggesting another port instead
  of an unhandled stack trace.
- A corrupted `comments.json` is backed up and the store starts empty, rather than crashing.
