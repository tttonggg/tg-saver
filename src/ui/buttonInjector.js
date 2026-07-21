// src/ui/buttonInjector.js
// Attaches one download button to a message footer.
// For a single item: one click = one download.
// For an album: one click = sequential queue of all items (silent or normal).

import { safeQueryAll, pickFirst } from '../utils/dom.js';
import { injectStyles } from './styles.js';
import { setState } from './progressBadge.js';
import { download } from '../downloader/index.js';
import { captureFromSilentViewer } from './silentViewer.js';
import { log } from '../utils/logger.js';

let _seq = 0;

/**
 * @param {Object} args
 * @param {Element} args.messageEl
 * @param {Object} args.grouped       // single | album | empty
 * @param {import('../platforms/contract.js').Platform} args.platform
 * @param {{ silentMode: boolean, streamEnabled: boolean }} args.settings
 */
export function attachButton({ messageEl, grouped, platform, settings }) {
  if (grouped.kind === 'empty') return;
  injectStyles(document);

  const footer = pickFirst(messageEl, platform.selectors.messageFooter);
  if (!footer) { log.warn('no footer to attach to'); return; }
  if (footer.querySelector('.tg-saver-btn')) return; // idempotent

  const btn = document.createElement('button');
  btn.className = 'tg-saver-btn';
  btn.type = 'button';
  btn.id = `tg-saver-btn-${++_seq}`;
  setState(btn, 'idle');
  btn.title = grouped.kind === 'album'
    ? `Download album (${grouped.items.length} items)`
    : 'Download';

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await handleClick({ btn, grouped, platform, settings });
  });

  footer.appendChild(btn);
}

async function handleClick({ btn, grouped, platform, settings }) {
  const items = grouped.kind === 'album' ? grouped.items : [grouped.item];
  setState(btn, 'resolving');

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let rawSrc = item.rawSrc;

      // Album items typically need the viewer to load full-res. Silent mode
      // hides the viewer; otherwise we let it open normally.
      if (grouped.kind === 'album' && looksLikeThumbnail(rawSrc)) {
        if (settings.silentMode) {
          platform.nativeViewerOpen(item.messageRef?.deref(), item.nodeRef?.deref());
          const captured = await captureFromSilentViewer({ platform });
          if (captured) rawSrc = captured;
        } else {
          // Normal mode: Telegram's viewer opens; we wait for its src.
          const captured = await waitForViewerUrl({ platform });
          if (captured) rawSrc = captured;
        }
      }

      setState(btn, 'downloading', 0);
      await download({
        rawSrc,
        item,
        streamEnabled: settings.streamEnabled,
        onProgress: (pct) => setState(btn, 'downloading', pct),
      });
    }
    setState(btn, 'done');
    setTimeout(() => setState(btn, 'idle'), 1500);
  } catch (err) {
    log.error('download failed:', err);
    setState(btn, 'error');
  }
}

function looksLikeThumbnail(src) {
  // Heuristic: album thumbs are typically blob: URLs of low-res variants.
  // The real URL arrives via the viewer. We treat any album item as needing
  // resolution unless its src clearly points at a full asset.
  return src?.startsWith('blob:');
}

function waitForViewerUrl({ platform, timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    const viewers = safeQueryAll(document, platform.selectors.mediaViewer);
    const viewer = viewers[0];
    if (!viewer) return resolve(null);

    const observer = new MutationObserver(() => {
      const media = viewer.querySelector('img, video');
      const src = media?.src || media?.getAttribute('src');
      if (src) { observer.disconnect(); resolve(src); }
    });
    observer.observe(viewer, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}
