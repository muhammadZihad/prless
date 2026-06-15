# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
