import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Resolve NodeNext-style `./foo.js` imports to the real `./foo.ts` source. */
const resolveTsJs = {
  name: 'resolve-ts-js',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer || !args.path.startsWith('.')) return undefined;
      const candidate = path.resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
      return existsSync(candidate) ? { path: candidate } : undefined;
    });
  },
};

await build({
  entryPoints: ['extension/src/extension.ts'],
  outfile: 'extension/dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  plugins: [resolveTsJs],
});
