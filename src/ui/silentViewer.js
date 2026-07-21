// src/ui/silentViewer.js
// Hides Telegram's media viewer with CSS before paint so the user sees nothing
// while we capture the full-res URL it loads.

import { safeQueryAll } from '../utils/dom.js';
import { log } from '../utils/logger.js';

/**
 * Install the silent-hide rule and start watching the viewer for a real src.
 * @param {Object} args
 * @param {import('../platforms/contract.js').Platform} args.platform
 * @param {number} [args.timeoutMs]
 * @returns {Promise<string|null>} resolves with the captured URL or null on timeout
 */
export function captureFromSilentViewer({ platform, timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    injectHideRule(platform);

    const viewers = safeQueryAll(document, platform.selectors.mediaViewer);
    const viewer = viewers[0];
    if (!viewer) {
      log.warn('silent viewer: no viewer element found');
      cleanup();
      resolve(null);
      return;
    }

    const observer = new MutationObserver(() => {
      const media = viewer.querySelector('img, video');
      const src = media?.src || media?.getAttribute('src');
      if (src) {
        observer.disconnect();
        cleanup();
        resolve(src);
      }
    });
    observer.observe(viewer, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

    const timer = setTimeout(() => {
      observer.disconnect();
      cleanup();
      log.warn('silent viewer: timed out');
      resolve(null);
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      removeHideRule();
    }
  });
}

function injectHideRule(platform) {
  const id = 'tg-saver-silent-hide-rule';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  const sels = (Array.isArray(platform.selectors.mediaViewer) ? platform.selectors.mediaViewer : [platform.selectors.mediaViewer])
    .join(', ');
  style.textContent = `${sels} { display: none !important; }`;
  document.head.appendChild(style);
}

function removeHideRule() {
  document.getElementById('tg-saver-silent-hide-rule')?.remove();
}
