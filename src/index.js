// src/index.js
import { detectPlatform } from './platforms/detect.js';
import { getPlatform } from './platforms/index.js';
import { loadSettings } from './settings/store.js';
import { setDebugEnabled } from './utils/logger.js';
import { startScanner } from './scanner/observer.js';
import { attachButton } from './ui/buttonInjector.js';

async function boot() {
  const name = detectPlatform();
  if (!name) {
    console.log('[tg-saver] not a supported Telegram Web frontend; staying dormant.');
    return;
  }
  const platform = getPlatform(name);
  let settings = await loadSettings();
  setDebugEnabled(settings.debug);

  console.log(`[tg-saver] booting for ${name}`);
  startScanner({
    platform,
    getSettings: () => settings,
    onDiscover: (messageEl, grouped) => {
      attachButton({ messageEl, grouped, platform, settings });
    },
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.debug) setDebugEnabled(changes.debug.newValue);
    if (changes.includeStickers) settings.includeStickers = changes.includeStickers.newValue;
    if (changes.streamEnabled) settings.streamEnabled = changes.streamEnabled.newValue;
    if (changes.silentMode) settings.silentMode = changes.silentMode.newValue;
  });
}

boot();
