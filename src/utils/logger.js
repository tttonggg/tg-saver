// src/utils/logger.js
// Leveled logger. All methods no-op unless settings.debug is true.
// Re-reads the flag live via the getter so the popup toggle takes effect without reload.

let _debug = false;

export function setDebugEnabled(v) { _debug = !!v; }
export function isDebugEnabled() { return _debug; }

export const log = {
  info: (...args) => { if (_debug) console.log('[tg-saver]', ...args); },
  warn: (...args) => { if (_debug) console.warn('[tg-saver]', ...args); },
  error: (...args) => { console.error('[tg-saver]', ...args); }, // errors always surface
};
