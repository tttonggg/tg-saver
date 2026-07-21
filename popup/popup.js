// popup/popup.js
// Reads/writes chrome.storage.local for the four toggles.

const KEYS = ['silentMode', 'streamEnabled', 'includeStickers', 'debug'];
const DEFAULTS = { silentMode: false, streamEnabled: true, includeStickers: false, debug: false };

async function init() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  for (const key of KEYS) {
    const el = document.getElementById(key);
    el.checked = !!stored[key];
    el.addEventListener('change', () => {
      chrome.storage.local.set({ [key]: el.checked });
    });
  }
}

init();
