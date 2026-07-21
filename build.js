import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const contentOptions = {
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/content-script.js',
  target: ['chrome120'],
  legalComments: 'none',
};

/** @type {esbuild.BuildOptions} */
const popupOptions = {
  entryPoints: ['popup/popup.js'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/popup.js',
  target: ['chrome120'],
  legalComments: 'none',
};

if (watch) {
  const ctx = await esbuild.context(contentOptions);
  await ctx.watch();
  const popupCtx = await esbuild.context(popupOptions);
  await popupCtx.watch();
  console.log('[tg-saver] watching...');
} else {
  await esbuild.build(contentOptions);
  await esbuild.build(popupOptions);
  console.log('[tg-saver] build complete');
}
