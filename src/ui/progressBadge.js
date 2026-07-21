// src/ui/progressBadge.js
// Per-button state machine. State -> visual.

import { ICON_MARKUP } from './styles.js';

/** @param {HTMLButtonElement} btn */
export function setState(btn, state, progress) {
  btn.dataset.state = state;
  const icon = iconFor(state);
  btn.innerHTML = icon;
  btn.title = tooltipFor(state, progress);

  let progressEl = btn.parentElement?.querySelector('.tg-saver-progress');
  if (state === 'downloading') {
    if (!progressEl) {
      progressEl = document.createElement('span');
      progressEl.className = 'tg-saver-progress';
      btn.parentElement.appendChild(progressEl);
    }
    progressEl.textContent = `${Math.round(progress || 0)}%`;
  } else if (progressEl) {
    progressEl.remove();
  }
}

function iconFor(state) {
  switch (state) {
    case 'resolving':
    case 'downloading': return ICON_MARKUP.spinner;
    case 'done': return ICON_MARKUP.done;
    case 'error': return ICON_MARKUP.error;
    case 'idle':
    default: return ICON_MARKUP.download;
  }
}

function tooltipFor(state, _progress) {
  return ({
    idle: 'Download',
    resolving: 'Resolving…',
    downloading: 'Downloading…',
    done: 'Saved',
    error: 'Failed — click to retry',
  })[state] || 'Download';
}
