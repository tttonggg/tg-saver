// src/platforms/contract.js
// JSDoc typedefs and the selector-lookup helper shared by WebA and WebK modules.
// Both platform modules export this same shape.

/**
 * @typedef {Object} Platform
 * @property {'weba'|'webk'} name
 * @property {Object<string, string|string[]>} selectors
 * @property {(messageEl: Element) => boolean} isAlbum
 * @property {(messageEl: Element) => Iterable<Element>} iterMedia
 * @property {(mediaNode: Element) => { url: string, type: string, mime?: string } | null} extractUrl
 * @property {(messageEl: Element, mediaNode: Element) => void} nativeViewerOpen
 */

/** Resolve a selector entry (string or array) to the first live match under root. */
export function pickSelector(root, entry) {
  const list = Array.isArray(entry) ? entry : [entry];
  for (const sel of list) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
