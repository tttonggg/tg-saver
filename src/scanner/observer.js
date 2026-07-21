// src/scanner/observer.js
// Watches the chat for media messages and hands REAL items to onDiscover.
//
// Two discovery mechanisms (revised 2026-07-21 after live-DOM diagnosis):
//   1. MutationObserver — fires on added/mutated bubbles. Fast, but fragile:
//      misses media if Telegram re-renders outside the observed subtree or
//      the observer gets disconnected.
//   2. Polling fallback — re-scans every POLL_INTERVAL_MS. Belt-and-suspenders
//      approach borrowed from the working tgdwn userscript, which uses pure
//      polling and is dramatically more reliable in practice.
//
// Also: chat scroll root may not exist at boot (Telegram renders the chat
// asynchronously). Retry finding it instead of giving up forever.

import { debounce, safeQueryAll } from '../utils/dom.js';
import { classifyMediaNode } from './classify.js';
import { buildMediaItem } from './mediaItem.js';
import { groupIntoAlbum } from './albumResolver.js';
import { log } from '../utils/logger.js';

const DEBOUNCE_MS = 100;
const POLL_INTERVAL_MS = 3000;
const SCROLL_ROOT_RETRY_MS = 1000;
const SCROLL_ROOT_MAX_RETRIES = 20; // ~20s

/**
 * @param {Object} args
 * @param {import('../platforms/contract.js').Platform} args.platform
 * @param {() => { includeStickers: boolean }} args.getSettings
 * @param {(messageEl: Element, albumOrSingle: Object) => void} args.onDiscover
 */
export function startScanner({ platform, getSettings, onDiscover }) {
  let observer = null;
  let pollTimer = null;
  let scrollRootRetry = 0;
  let stopped = false;

  const seen = new WeakSet();          // bubbles we've already handed to onDiscover
  const scannedEmpty = new WeakSet();  // bubbles we've scanned but found nothing in (yet)

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
    if (items.length === 0) { scannedEmpty.add(bubble); return; }
    const grouped = groupIntoAlbum(items, bubble, platform);
    onDiscover(bubble, grouped);
    seen.add(bubble);
  }

  function scanAll() {
    if (stopped) return;
    const root = findScrollRoot();
    if (!root) return;
    const bubbles = safeQueryAll(root, platform.selectors.messageBubble);
    for (const b of bubbles) scanBubble(b);
  }

  function findScrollRoot() {
    return safeQueryAll(document, platform.selectors.scrollRoot)[0] || null;
  }

  function attach(root) {
    const debouncedScan = debounce(scanAll, DEBOUNCE_MS);

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added.nodeType !== 1) continue;
          if (added.matches?.(firstSelector(platform.selectors.messageBubble))) {
            scanBubble(added);
          } else {
            debouncedScan();
          }
        }
        if (m.type === 'attributes' && m.target?.closest?.(firstSelector(platform.selectors.messageBubble))) {
          const bubble = m.target.closest(firstSelector(platform.selectors.messageBubble));
          if (bubble && !seen.has(bubble)) scanBubble(bubble);
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    scanAll();

    // Polling fallback: covers cases the observer misses (re-renders outside the
    // subtree, observer disconnects, SPA navigations, lazy-loaded media).
    pollTimer = setInterval(scanAll, POLL_INTERVAL_MS);

    log.info(`scanner started on ${platform.name}; observer + ${POLL_INTERVAL_MS}ms polling`);
  }

  // Boot: try to find scroll root, retry if not yet rendered.
  function tryBoot() {
    if (stopped) return;
    const root = findScrollRoot();
    if (root) {
      attach(root);
      return;
    }
    scrollRootRetry++;
    if (scrollRootRetry > SCROLL_ROOT_MAX_RETRIES) {
      log.warn(`scroll root not found after ${SCROLL_ROOT_MAX_RETRIES} retries; giving up`);
      return;
    }
    setTimeout(tryBoot, SCROLL_ROOT_RETRY_MS);
  }
  tryBoot();

  return {
    stop() {
      stopped = true;
      observer?.disconnect();
      if (pollTimer) clearInterval(pollTimer);
    },
  };
}

function firstSelector(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}
