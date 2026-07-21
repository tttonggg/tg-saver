// src/ui/styles.js
// Stealth styles. Reads Telegram's CSS custom properties so the injected icon
// theme-matches. Falls back to currentColor.

const STYLE_ID = 'tg-saver-styles';

const CSS = `
.tg-saver-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  vertical-align: middle;
  opacity: 0.5;
  color: var(--accent-text-color, var(--color-text, currentColor));
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 120ms ease;
  font-size: 0;
}
.tg-saver-btn:hover { opacity: 1; }
.tg-saver-btn svg { width: 16px; height: 16px; pointer-events: none; }

.tg-saver-btn[data-state="resolving"] svg,
.tg-saver-btn[data-state="downloading"] svg { animation: tg-saver-spin 800ms linear infinite; }
.tg-saver-btn[data-state="done"] svg { animation: none; opacity: 1; }
.tg-saver-btn[data-state="error"] { color: #e53935; opacity: 1; }
.tg-saver-btn[data-state="error"] svg { animation: none; }

.tg-saver-progress {
  display: inline-block;
  margin-left: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-secondary, currentColor);
  opacity: 0.7;
}

/* Overlay variant — used when no footer; button sits on top of the media. */
.tg-saver-overlay-host { position: relative; }
.tg-saver-btn-overlay {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  margin: 0;
  opacity: 0.85;
  background: #2481cc;
  color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  z-index: 1000000;
}
.tg-saver-btn-overlay:hover { opacity: 1; }
.tg-saver-btn-overlay svg { width: 18px; height: 18px; }
.tg-saver-btn-overlay .tg-saver-progress {
  position: absolute;
  bottom: -16px;
  right: 0;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 4px;
  border-radius: 2px;
  opacity: 1;
}

@keyframes tg-saver-spin { to { transform: rotate(360deg); } }
`;

export function injectStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

export const ICON_MARKUP = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.5" fill="currentColor"/></svg>',
};
