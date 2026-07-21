// src/settings/store.js
// Wrapper around chrome.storage.local. Defaults match the spec's popup.

export const DEFAULTS = Object.freeze({
  silentMode: false,
  streamEnabled: true,
  includeStickers: false,
  debug: false,
});

/**
 * @param {{ get: (keys: Object) => Promise<Object> }} storage
 */
export async function loadSettings(storage = chrome?.storage?.local) {
  if (!storage) return { ...DEFAULTS };
  const stored = await storage.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

/**
 * Merge chrome.storage.onChanged payload into the current settings.
 * @param {Object} current
 * @param {Object<string, { newValue?: any, oldValue?: any }>} changes
 */
export function applyChanges(current, changes) {
  const next = { ...current };
  for (const [key, change] of Object.entries(changes)) {
    if (key in DEFAULTS) next[key] = change.newValue;
  }
  return next;
}
