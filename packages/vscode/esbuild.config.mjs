import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionBuild = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'better-sqlite3'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
};

if (isWatch) {
  const ctx = await esbuild.context(extensionBuild);
  await ctx.watch();
  console.log('[aidev] Extension watching...');
} else {
  await esbuild.build(extensionBuild);
  console.log('[aidev] Build complete.');
}
