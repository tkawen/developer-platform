// Bundles with esbuild. Declarations are emitted afterwards by `tsc -p tsconfig.build.json`.
import { build } from 'esbuild';
import { rmSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const banner = `/*! ${pkg.name} v${pkg.version} | MIT | (c) TKAWEN */`;
const common = { bundle: true, target: 'es2020', legalComments: 'none', banner: { js: banner }, logLevel: 'info' };

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

await Promise.all([
  build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js', format: 'esm', platform: 'neutral' }),
  build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.cjs', format: 'cjs', platform: 'node' }),
  build({ ...common, entryPoints: ['src/element.ts'], outfile: 'dist/element.js', format: 'esm', platform: 'browser' }),
  build({
    ...common,
    entryPoints: ['src/browser.ts'],
    outfile: 'dist/tkawen-verify.iife.js',
    format: 'iife',
    globalName: 'TkawenVerify',
    platform: 'browser',
    minify: true,
  }),
]);
