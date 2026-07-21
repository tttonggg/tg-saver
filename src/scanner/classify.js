// src/scanner/classify.js
// Decides what a media node is. Returns one of:
// REAL | THUMBNAIL | PROFILE_PIC | EMOJI | STICKER | UI_CHROME

import { closestMatching } from '../utils/dom.js';

const SMALL_PX = 48;

/**
 * @param {Element} node
 * @param {import('../platforms/contract.js').Platform} platform
 * @param {{ includeStickers?: boolean }} settings
 * @returns {'REAL'|'THUMBNAIL'|'PROFILE_PIC'|'EMOJI'|'STICKER'|'UI_CHROME'}
 */
export function classifyMediaNode(node, platform, settings = {}) {
  const sels = platform.selectors;

  if (closestMatching(node, arrayify(sels.avatar))) return 'PROFILE_PIC';
  if (closestMatching(node, arrayify(sels.emoji))) return 'EMOJI';
  if (closestMatching(node, arrayify(sels.albumThumb))) return 'THUMBNAIL';
  if (closestMatching(node, arrayify(sels.iconSprite))) return 'UI_CHROME';

  const stickerEl = closestMatching(node, arrayify(sels.sticker));
  if (stickerEl) return settings.includeStickers ? 'REAL' : 'STICKER';

  // Data-attribute heuristic: explicit media id → REAL even if no context matched.
  if (node.dataset?.photoId || node.dataset?.documentId) return 'REAL';

  // Size heuristic (last resort).
  const rect = node.getBoundingClientRect?.();
  if (rect && Math.max(rect.width, rect.height) < SMALL_PX) {
    // Tiny media inside a text-like container is almost always emoji/icon chrome.
    return 'UI_CHROME';
  }

  return 'REAL';
}

function arrayify(x) { return Array.isArray(x) ? x : [x]; }
