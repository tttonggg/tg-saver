// src/scanner/classify.js
// Decides what a media node is. Returns one of:
// REAL | THUMBNAIL | PROFILE_PIC | EMOJI | STICKER | UI_CHROME
//
// Strategy (revised 2026-07-21 after live-DOM diagnosis):
//   1. Selector-based filtering for known-decorative contexts (avatar, emoji, sticker, album thumb)
//      — fast path for the common case.
//   2. Size heuristic as the safety net: a rendered element ≥ MEDIA_MIN_PX is almost always real
//      media even when Telegram ships new class names we don't recognize. This is what the
//      working tgdwn userscript relies on and it's dramatically more robust than selector-only.
//   3. Skip the size rule for zero-rect nodes (jsdom, display:none during render).

import { closestMatching } from '../utils/dom.js';

const MEDIA_MIN_PX = 100;

/**
 * @param {Element} node
 * @param {import('../platforms/contract.js').Platform} platform
 * @param {{ includeStickers?: boolean }} settings
 * @returns {'REAL'|'THUMBNAIL'|'PROFILE_PIC'|'EMOJI'|'STICKER'|'UI_CHROME'}
 */
export function classifyMediaNode(node, platform, settings = {}) {
  const sels = platform.selectors;

  // Step 1: Known decorative contexts — fast path.
  if (closestMatching(node, arrayify(sels.avatar))) return 'PROFILE_PIC';
  if (closestMatching(node, arrayify(sels.emoji))) return 'EMOJI';
  if (closestMatching(node, arrayify(sels.albumThumb))) return 'THUMBNAIL';
  if (closestMatching(node, arrayify(sels.iconSprite))) return 'UI_CHROME';

  const stickerEl = closestMatching(node, arrayify(sels.sticker));
  if (stickerEl) return settings.includeStickers ? 'REAL' : 'STICKER';

  // Step 2: Explicit media data-attributes — strong REAL signal.
  if (node.dataset?.photoId || node.dataset?.documentId) return 'REAL';

  // Step 3: Size heuristic — the safety net. A large rendered element is real
  // media even if no selector matched. This protects against Telegram renaming
  // classes (which has already happened once — see git log for v0.1.1).
  const rect = node.getBoundingClientRect?.();
  if (rect && (rect.width > 0 || rect.height > 0)) {
    if (Math.max(rect.width, rect.height) >= MEDIA_MIN_PX) return 'REAL';
    // Small rendered element inside a known text container is chrome.
    return 'UI_CHROME';
  }

  // Zero-rect (jsdom / display:none during render): can't tell, assume REAL
  // and let downstream filter again on the next mutation.
  return 'REAL';
}

function arrayify(x) { return Array.isArray(x) ? x : [x]; }
