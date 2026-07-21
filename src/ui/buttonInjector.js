// src/ui/buttonInjector.js
// Attaches one download button to a message footer.
// For a single item: one click = one download.
// For an album: one click = sequential queue of all items (silent or normal).

import { pickFirst } from '../utils/dom.js';
import { injectStyles } from './styles.js';
import { setState } from './progressBadge.js';
import { download } from '../downloader/index.js';
import { prepareSilentViewer, captureFromSilentViewer } from './silentViewer.js';
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
    for (const item of items) {
      let rawSrc = item.rawSrc;

      // Album items typically need the viewer to load full-res.
      if (grouped.kind === 'album' && looksLikeThumbnail(rawSrc)) {
        if (settings.silentMode) {
          // CRITICAL: install the hide rule BEFORE opening the viewer, so the
          // viewer never paints. (Spec §3 Stage 0 silent-mode requirement.)
          prepareSilentViewer({ platform });
          platform.nativeViewerOpen(item.messageRef?.deref(), item.nodeRef?.deref());
          const captured = await captureFromSilentViewer({ platform });
          if (captured) rawSrc = captured;
        } else {
          // Normal mode: open the viewer (visible), then capture its src.
          platform.nativeViewerOpen(item.messageRef?.deref(), item.nodeRef?.deref());
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
    let settled = false;
    let observer;
    let timer;

    function finish(value) {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      clearTimeout(timer);
      resolve(value);
    }

    // Viewer may already exist with src set.
    for (const sel of (Array.isArray(platform.selectors.mediaViewer) ? platform.selectors.mediaViewer : [platform.selectors.mediaViewer])) {
      const existing = document.querySelector(sel);
      if (existing) {
        const media = existing.querySelector('img, video');
        const src = media?.src || media?.getAttribute('src');
        if (src) return finish(src);
      }
    }

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          // node might be the viewer or contain it.
          const viewers = [];
          const sels = Array.isArray(platform.selectors.mediaViewer) ? platform.selectors.mediaViewer : [platform.selectors.mediaViewer];
          if (sels.some(s => node.matches?.(s))) viewers.push(node);
          for (const s of sels) {
            const within = node.querySelector?.(s);
            if (within) viewers.push(within);
          }
          for (const v of viewers) {
            const media = v.querySelector?.('img, video') || ((v.tagName === 'IMG' || v.tagName === 'VIDEO') ? v : null);
            const src = media?.src || media?.getAttribute('src');
            if (src) return finish(src);
          }
        }
        if (m.type === 'attributes' && m.target) {
          const media = m.target;
          const src = media.src || media.getAttribute('src');
          if (src && (media.tagName === 'IMG' || media.tagName === 'VIDEO')) return finish(src);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    timer = setTimeout(() => finish(null), timeoutMs);
  });
}
