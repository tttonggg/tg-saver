import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

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

// Files that must live inside dist/ for "Load unpacked" to work.
// manifest.json references content-script.js, popup/*, icons/*, _locales/* — all
// resolved relative to the manifest itself, so the manifest + these assets must
// be staged into dist/ alongside the bundled JS.
const STATIC_ASSETS = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  '_locales',
  'icons',
];

async function stageStatic() {
  await mkdir('dist/popup', { recursive: true });
  for (const asset of STATIC_ASSETS) {
    if (!existsSync(asset)) continue;
    await cp(asset, `dist/${asset}`, { recursive: true });
  }
}

async function clean() {
  if (existsSync('dist')) await rm('dist', { recursive: true, force: true });
}

if (watch) {
  await clean();
  await stageStatic();
  const ctx = await esbuild.context(contentOptions);
  await ctx.watch();
  const popupCtx = await esbuild.context(popupOptions);
  await popupCtx.watch();
  console.log('[tg-saver] watching... (static assets staged once; restart to re-stage)');
} else {
  await clean();
  await Promise.all([
    esbuild.build(contentOptions),
    esbuild.build(popupOptions),
    stageStatic(),
  ]);
  console.log('[tg-saver] build complete; load dist/ as unpacked extension');
}
