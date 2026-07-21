// src/scanner/albumResolver.js
// If the message is an album (per platform.isAlbum), group items into an Album.
// Otherwise return a single-item record.

/**
 * @param {Array} items
 * @param {Element} messageEl
 * @param {import('../platforms/contract.js').Platform} platform
 */
export function groupIntoAlbum(items, messageEl, platform) {
  if (items.length === 0) return { kind: 'empty' };
  if (items.length === 1 || !platform.isAlbum(messageEl)) {
    return { kind: 'single', item: items[0] };
  }
  return { kind: 'album', items };
}
