// src/ui/silentViewer.js
// Hides Telegram's media viewer with CSS before paint so the user sees nothing
// while we capture the full-res URL it loads.
//
// Two-phase:
//   1. prepareSilentViewer({ platform }) — injects the hide rule BEFORE the caller
//      triggers the viewer. Call this first.
//   2. captureFromSilentViewer({ platform }) — observes document.body (subtree)
//      for the viewer's first media src, regardless of when Telegram creates the
//      viewer element. Removes the hide rule on resolve/timeout.

import { arrayifySels } from './selectorUtils.js';
import { log } from '../utils/logger.js';

const HIDE_RULE_ID = 'tg-saver-silent-hide-rule';

/** Inject the hide rule. Idempotent. Call BEFORE opening the viewer. */
export function prepareSilentViewer({ platform }) {
  if (document.getElementById(HIDE_RULE_ID)) return;
  const style = document.createElement('style');
  style.id = HIDE_RULE_ID;
  const sels = arrayifySels(platform.selectors.mediaViewer).join(', ');
  style.textContent = `${sels} { display: none !important; }`;
  (document.head || document.documentElement).appendChild(style);
}

function removeHideRule() {
  document.getElementById(HIDE_RULE_ID)?.remove();
}

function nodeIsViewer(node, platform) {
  if (node.nodeType !== 1) return false;
  return arrayifySels(platform.selectors.mediaViewer).some(sel => node.matches?.(sel));
}

function mediaSrcIn(node, platform) {
  // The mutated node might be the viewer, contain the viewer, or be the media itself.
  const viewers = [];
  if (nodeIsViewer(node, platform)) viewers.push(node);
  for (const sel of arrayifySels(platform.selectors.mediaViewer)) {
    if (node.querySelector) {
      const within = node.querySelector(sel);
      if (within) viewers.push(within);
    }
  }
  for (const viewer of viewers) {
    const media = viewer.querySelector?.('img, video')
      || ((viewer.tagName === 'IMG' || viewer.tagName === 'VIDEO') ? viewer : null);
    const src = media?.src || media?.getAttribute('src');
    if (src) return src;
  }
  return null;
}

/**
 * Observe document.body for the viewer's first media src. Resolves with the src,
 * or null on timeout. Removes the hide rule in either case.
 * @param {Object} args
 * @param {import('../platforms/contract.js').Platform} args.platform
 * @param {number} [args.timeoutMs]
 * @returns {Promise<string|null>}
 */
export function captureFromSilentViewer({ platform, timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    let settled = false;
    let observer;
    let timer;

    function finish(value) {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      clearTimeout(timer);
      removeHideRule();
      resolve(value);
    }

    // Pre-check: viewer may already exist with its src set.
    for (const sel of arrayifySels(platform.selectors.mediaViewer)) {
      const existing = document.querySelector(sel);
      if (existing) {
        const src = mediaSrcIn(existing, platform);
        if (src) { finish(src); return; }
      }
    }

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          const src = mediaSrcIn(node, platform);
          if (src) return finish(src);
        }
        if (m.type === 'attributes' && m.target) {
          const src = mediaSrcIn(m.target, platform);
          if (src) return finish(src);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    timer = setTimeout(() => {
      log.warn('silent viewer: timed out');
      finish(null);
    }, timeoutMs);
  });
}
