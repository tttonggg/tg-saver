// src/ui/selectorUtils.js
// Small shared helper so silentViewer and buttonInjector agree on selector typing.

/** Coerce a contract selector entry (string | string[]) to a flat array. */
export function arrayifySels(entry) {
  return Array.isArray(entry) ? entry : [entry];
}
