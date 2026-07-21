// src/ui/buttonInjector.js
// Attaches a download button to a message.
//
// Two attach strategies (revised 2026-07-21 after live-DOM diagnosis):
//   Strategy A (preferred): inside the message footer (.MessageMeta) next to the
//     timestamp — matches Telegram's own UI grammar. Used when footer exists.
//   Strategy B (fallback): overlay on the media's parent element via absolute
//     positioning. Used when no footer is found (most photo/video-only messages).
//     This is the strategy the working tgdwn userscript uses for everything.
//
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

  // Step 1: try footer (Strategy A)
  let host = pickFirst(messageEl, platform.selectors.messageFooter);
  let strategy = 'footer';

  // Step 2: if no footer, overlay on a media parent (Strategy B)
  if (!host) {
    const firstItem = grouped.kind === 'album' ? grouped.items[0] : grouped.item;
    const mediaEl = firstItem?.nodeRef?.deref();
    if (mediaEl) {
      // Walk up to the nearest positioned-or-positionable container.
      // The userscript uses mediaEl.parentElement; we do the same but also
      // ensure the host can be positioned.
      host = mediaEl.parentElement;
      if (host && getComputedStyle(host).position === 'static') {
        host.classList.add('tg-saver-overlay-host');
      }
      strategy = 'overlay';
    }
  }

  if (!host) {
    log.warn('no footer and no media parent to attach to; skipping');
    return;
  }
  if (host.querySelector('.tg-saver-btn')) return; // idempotent

  const btn = document.createElement('button');
  btn.className = 'tg-saver-btn' + (strategy === 'overlay' ? ' tg-saver-btn-overlay' : '');
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

  host.appendChild(btn);
}

async function handleClick({ btn, grouped, platform, settings }) {
  const items = grouped.kind === 'album' ? grouped.items : [grouped.item];
  setState(btn, 'resolving');

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let rawSrc = item.rawSrc;

      // Album items typically need the viewer to load full-res.
      if (grouped.kind === 'album' && looksLikeThumbnail(rawSrc)) {
        if (settings.silentMode) {
          prepareSilentViewer({ platform });
          platform.nativeViewerOpen(item.messageRef?.deref(), item.nodeRef?.deref());
          const captured = await captureFromSilentViewer({ platform });
          if (captured) rawSrc = captured;
        } else {
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
