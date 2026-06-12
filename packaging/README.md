# Packaging & Publishing

`prless` is distributed as the npm package **`prless`** (the installed command
is `prless`). npm is the single source of truth; Homebrew just wraps it.

## 1. Publish to npm

The package builds itself on publish (the `prepare` script runs `npm run build`, so the
prebuilt `dist/` is included in the tarball). Runtime deps are only `fastify`,
`@fastify/static`, `open`, and `simple-git` — the whole React/Vite frontend is bundled
into `dist/web` at build time, so it is not shipped as a dependency.

```bash
npm login
npm publish            # unscoped public package
```

Verify what ships first with `npm pack --dry-run`.

After publishing, anyone on macOS, Linux, or Windows can install with one command:

```bash
npm install -g prless
prless open .
```

## 2. (Optional) Homebrew tap for macOS / Linux

Homebrew has no central listing for brand-new tools, so ship it via your own *tap*.

1. Compute the sha256 of the published tarball:

   ```bash
   curl -sL https://registry.npmjs.org/prless/-/prless-0.1.0.tgz \
     | shasum -a 256
   ```

2. Paste that value into `sha256` in [`homebrew/prless.rb`](homebrew/prless.rb), and
   bump the version in both the `url` and the package on each release.

3. Create a public repo named `homebrew-tap` (the `homebrew-` prefix is required) and put
   `prless.rb` in its root or a `Formula/` directory.

4. Users then install with:

   ```bash
   brew install muhammadZihad/tap/prless
   ```

`brew` pulls in `node` automatically (`depends_on "node"`), so users don't need it
preinstalled.

## Releasing a new version

1. Bump `version` in `package.json`.
2. `npm publish`.
3. Update `url` + `sha256` in the formula and push the tap.
