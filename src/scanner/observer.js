// src/scanner/observer.js
// Single MutationObserver per chat. Watches the scroll root for added/mutated
// message bubbles, classifies each media node, and hands REAL items to the
// (Phase 6) button injector. For now, hands them to an onDiscover callback.

import { debounce, safeQueryAll } from '../utils/dom.js';
import { classifyMediaNode } from './classify.js';
import { buildMediaItem } from './mediaItem.js';
import { groupIntoAlbum } from './albumResolver.js';
import { log } from '../utils/logger.js';

const DEBOUNCE_MS = 100;

/**
 * @param {Object} args
 * @param {import('../platforms/contract.js').Platform} args.platform
 * @param {() => { includeStickers: boolean }} args.getSettings
 * @param {(messageEl: Element, albumOrSingle: Object) => void} args.onDiscover
 */
export function startScanner({ platform, getSettings, onDiscover }) {
  const scrollRoot = safeQueryAll(document, platform.selectors.scrollRoot)[0];
  if (!scrollRoot) {
    log.warn('scroll root not found; scanner idle');
    return { stop() {} };
  }

  const seen = new WeakSet();

  function scanBubble(bubble) {
    if (seen.has(bubble)) return;
    const mediaNodes = platform.iterMedia(bubble);
    const settings = getSettings();
    const items = [];
    for (const node of mediaNodes) {
      const tier = classifyMediaNode(node, platform, settings);
      if (tier !== 'REAL') continue;
      const item = buildMediaItem(node, bubble, platform);
      if (item) items.push(item);
    }
    if (items.length === 0) { seen.add(bubble); return; }
    const grouped = groupIntoAlbum(items, bubble, platform);
    onDiscover(bubble, grouped);
    seen.add(bubble);
  }

  function scanAll() {
    const bubbles = safeQueryAll(scrollRoot, platform.selectors.messageBubble);
    for (const b of bubbles) scanBubble(b);
  }

  const debouncedScan = debounce(scanAll, DEBOUNCE_MS);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType !== 1) continue;
        if (added.matches?.(firstSelector(platform.selectors.messageBubble))) {
          scanBubble(added);
        } else {
          debouncedScan();
        }
      }
    }
  });

  observer.observe(scrollRoot, { childList: true, subtree: true });
  scanAll();
  log.info(`scanner started on ${platform.name}; initial bubbles scanned`);

  return {
    stop() { observer.disconnect(); },
  };
}

function firstSelector(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}
