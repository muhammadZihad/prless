# Packaging & Publishing

`prless` is distributed as the scoped npm package **`@muhammad_zihad/prless`** (the
installed command is still `prless`). It is scoped because npm's name-similarity filter
rejects the bare name `prless`.

## Publish to npm

The package builds itself on publish (the `prepare` script runs `npm run build`, so the
prebuilt `dist/` is included in the tarball). Runtime deps are only `fastify`,
`@fastify/static`, `open`, and `simple-git` — the whole React/Vite frontend is bundled
into `dist/web` at build time, so it is not shipped as a dependency.

```bash
npm login
npm publish --access public    # scoped packages default to private; this makes it public
```

Verify what ships first with `npm pack --dry-run`.

After publishing, anyone on macOS, Linux, or Windows can install with one command:

```bash
npm install -g @muhammad_zihad/prless
prless open .
```

## Releasing a new version

1. Bump `version` in `package.json`.
2. `npm publish --access public`.
