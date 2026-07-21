// src/index.js
// tg-saver content script entry point.
// Detects the active Telegram Web frontend and boots the scanner/UI.
// Further wiring lands in Phase 5 / Task 5.4.

import { detectPlatform } from './platforms/detect.js';
import { getPlatform } from './platforms/index.js';

function boot() {
  const name = detectPlatform();
  if (!name) {
    console.log('[tg-saver] not a supported Telegram Web frontend; staying dormant.');
    return;
  }
  const platform = getPlatform(name);
  console.log(`[tg-saver] booting for ${name}`);
  // Phase 5: start scanner with this platform.
  // Phase 6: wire UI.
  return platform;
}

boot();
