# tg-saver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a privacy-first Chrome MV3 extension that downloads media from Telegram Web (both `/a` and `/k`) with stealth UI, streaming large-file support, and zero non-Telegram network calls.

**Architecture:** Single content script in the isolated world (no service worker, no page-context injection). Platform modules isolate WebA vs WebK DOM details behind a shared contract. Scanner observes the chat, classifies media nodes, and injects one footer icon per message. Downloader resolves the URL, streams to disk via the File System Access API (blob fallback), with silent mode for album batches.

**Tech Stack:** Vanilla JS (ES modules), esbuild, `node:test` + `jsdom`-free DOM-fixture approach, ESLint flat config. Chrome MV3, `storage` permission only, host `https://web.telegram.org/*`.

**Spec reference:** [`docs/superpowers/specs/2026-07-21-tg-saver-design.md`](../specs/2026-07-21-tg-saver-design.md)

**Phases (each produces a verifiable milestone):**
- **Phase 1** — Skeleton: manifest, build, smoke load into Chrome
- **Phase 2** — Platform layer: detection + WebA/WebK module contracts
- **Phase 3** — Downloader core: filename, range parsing, URL resolver, queue (pure logic, fully unit-tested)
- **Phase 4** — Download execution: stream + blob writers
- **Phase 5** — Scanner: MutationObserver, classifier, album resolver
- **Phase 6** — UI: button injector, progress badge, stealth styles, silent viewer
- **Phase 7** — Popup + settings store
- **Phase 8** — Polish: i18n, README, smoke checklist, manual test pass

---

## File Map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest; one content script, popup action, storage perm, web.telegram.org host |
| `package.json` | deps (esbuild), scripts (build/build:watch/lint/clean) |
| `eslint.config.js` | flat config, browser globals + chrome globals + module |
| `build.js` | esbuild: `src/index.js` → `dist/content-script.js`, `popup/popup.js` → `dist/popup.js` |
| `src/index.js` | Entry: detect platform, boot scanner, wire UI |
| `src/platforms/detect.js` | `detectPlatform()` returns `'weba'` / `'webk'` / `null` |
| `src/platforms/index.js` | Resolver: platform name → platform module |
| `src/platforms/weba.js` | WebA selectors + helpers |
| `src/platforms/webk.js` | WebK selectors + helpers |
| `src/platforms/contract.js` | JSDoc typedef `Platform` + selector-lookup helper |
| `src/utils/dom.js` | `waitFor`, `debounce`, `closestMatching`, `safeQueryAll` |
| `src/utils/range.js` | `parseContentRange`, `parseContentRangeTotal`, `formatRangeHeader` |
| `src/utils/logger.js` | Leveled logger gated by `settings.debug` |
| `src/settings/store.js` | `chrome.storage.local` wrapper + defaults + `onChanged` fan-out |
| `src/scanner/observer.js` | `MutationObserver` on scroll root; throttle/batch |
| `src/scanner/classify.js` | `classifyMediaNode(node, platform, settings)` → tier string |
| `src/scanner/mediaItem.js` | `buildMediaItem(node, platform)` → `MediaItem` record |
| `src/scanner/albumResolver.js` | `groupIntoAlbum(items, messageEl, platform)` → `Album` or single |
| `src/downloader/resolveUrl.js` | `resolveUrl(rawSrc)` → `{url, size, contentType, suggestedName}` |
| `src/downloader/filename.js` | `buildFilename({item, messageEl, platform})` → string |
| `src/downloader/streamDownload.js` | `streamToDisk({url, filename, onProgress, signal})` |
| `src/downloader/blobDownload.js` | `blobToDisk({url, filename, onProgress, signal})` |
| `src/downloader/queue.js` | `AlbumQueue` class; max-2 parallel album queues |
| `src/ui/buttonInjector.js` | `attachButton(messageEl, albumOrItem, deps)` |
| `src/ui/progressBadge.js` | State machine: idle/hover/resolving/downloading/done/error |
| `src/ui/silentViewer.js` | Hide viewer CSS inject/strip + URL capture |
| `src/ui/styles.js` | Inject stealth `<style>` (theme-var driven) |
| `popup/popup.html` | 4 toggles + help |
| `popup/popup.js` | Read/write `chrome.storage.local` |
| `popup/popup.css` | Minimal styling |
| `_locales/en/messages.json` | `extName`, `extDesc`, `downloadTooltip`, `downloadAlbumTooltip` |
| `tests/fixtures/weba-message.html` | Snapshot of a WebA message bubble |
| `tests/fixtures/webk-message.html` | Snapshot of a WebK message bubble |
| `tests/fixtures/weba-album.html` | Snapshot of a WebA album |
| `tests/fixtures/webk-album.html` | Snapshot of a WebK album |
| `tests/helpers/dom.js` | Load fixture → `Document` with stub `chrome` |
| `tests/unit/filename.test.js` | Filename rules |
| `tests/unit/range.test.js` | Range header parse/format |
| `tests/unit/resolveUrl.test.js` | blob/stream/progressive/direct |
| `tests/unit/classify.test.js` | Each tier + includeStickers toggle |
| `tests/unit/albumResolver.test.js` | Single vs album grouping |
| `tests/unit/queue.test.js` | Sequential in album, ≤2 parallel |
| `tests/fixtures/weba-album.html` | (duplicate above — kept once) |

---

# Phase 1 — Skeleton

**Milestone:** `npm run build` produces `dist/content-script.js`; loading `dist/` as unpacked extension in Chrome shows the extension icon and a "boot" console log on `web.telegram.org`.

### Task 1.1: package.json + tooling

**Files:**
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `.gitignore` (already exists — verify)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "tg-saver",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Privacy-first, no-limits Telegram Web media downloader. Chrome MV3 extension.",
  "license": "MIT",
  "scripts": {
    "build": "node build.js",
    "build:watch": "node build.js --watch",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "node --test tests/unit/"
  },
  "devDependencies": {
    "esbuild": "^0.25.4",
    "eslint": "^9.27.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Write `eslint.config.js`**

```js
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'tests/fixtures/'],
  },
];
```

- [ ] **Step 3: Install deps**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 4: Verify lint passes on empty source**

Run: `npm run lint`
Expected: exits 0 (no files to lint, no errors).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json eslint.config.js
git commit -m "chore: npm + eslint tooling"
```

### Task 1.2: Build script

**Files:**
- Create: `build.js`

- [ ] **Step 1: Write `build.js`**

```js
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const contentOptions = {
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/content-script.js',
  target: ['chrome120'],
  legalComments: 'none',
};

/** @type {esbuild.BuildOptions} */
const popupOptions = {
  entryPoints: ['popup/popup.js'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/popup.js',
  target: ['chrome120'],
  legalComments: 'none',
};

if (watch) {
  const ctx = await esbuild.context(contentOptions);
  await ctx.watch();
  const popupCtx = await esbuild.context(popupOptions);
  await popupCtx.watch();
  console.log('[tg-saver] watching...');
} else {
  await esbuild.build(contentOptions);
  await esbuild.build(popupOptions);
  console.log('[tg-saver] build complete');
}
```

- [ ] **Step 2: Create a stub `src/index.js`**

```js
// tg-saver content script entry point.
// Full boot sequence lands in Phase 2 / Task 5.1.
console.log('[tg-saver] boot stub');
```

- [ ] **Step 3: Create a stub `popup/popup.js`**

```js
// tg-saver popup entry point.
console.log('[tg-saver] popup stub');
```

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: prints `[tg-saver] build complete`; `dist/content-script.js` and `dist/popup.js` exist.

- [ ] **Step 5: Commit**

```bash
git add build.js src/index.js popup/popup.js
git commit -m "build: esbuild setup for content script + popup"
```

### Task 1.3: Manifest + icons + locale

**Files:**
- Create: `manifest.json`
- Create: `_locales/en/messages.json`
- Create: `icons/128.png`, `icons/48.png`, `icons/16.png` (placeholder PNGs — use any 128px PNG; replace before Web Store submission)

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "short_name": "tg-saver",
  "version": "0.1.0",
  "description": "__MSG_extDesc__",
  "default_locale": "en",
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "permissions": ["storage"],
  "host_permissions": ["https://web.telegram.org/*"],
  "content_scripts": [
    {
      "js": ["content-script.js"],
      "matches": ["https://web.telegram.org/*"],
      "run_at": "document_end"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["icons/*"],
      "matches": ["https://web.telegram.org/*"]
    }
  ]
}
```

- [ ] **Step 2: Write `_locales/en/messages.json`**

```json
{
  "extName": {
    "message": "tg-saver — Telegram media downloader",
    "description": "Extension name shown in Chrome."
  },
  "extDesc": {
    "message": "Privacy-first, no-limits Telegram Web media downloader. Local-only, no telemetry, no login.",
    "description": "Shown in the Chrome Web Store and extension list."
  },
  "downloadTooltip": {
    "message": "Download",
    "description": "Hover tooltip on the per-message download icon."
  },
  "downloadAlbumTooltip": {
    "message": "Download album ($count$ items)",
    "description": "Hover tooltip when the message is an album.",
    "placeholders": {
      "count": { "content": "$1", "example": "3" }
    }
  }
}
```

- [ ] **Step 3: Create placeholder icons**

Run:
```bash
mkdir -p icons
# Generate 16/48/128 PNGs using sips from a single 128px source (or create any PNG).
# If no image tool available, create minimal valid PNG files:
for size in 16 48 128; do
  printf '\x89PNG\r\n\x1a\n' > "icons/${size}.png"
done
```
Note: replace these with real artwork before Web Store submission. The header-only files above are valid enough to load but show as blank — fine for dev.

- [ ] **Step 4: Add `dist/` to .gitignore (should already be there — verify)**

Run: `grep -q '^dist/' .gitignore || echo 'dist/' >> .gitignore`

- [ ] **Step 5: Build and sanity-check the dist tree**

Run: `npm run build`
Expected: `dist/content-script.js`, `dist/popup.js` exist.

- [ ] **Step 6: Commit**

```bash
git add manifest.json _locales/ icons/ .gitignore
git commit -m "feat: MV3 manifest, en locale, placeholder icons"
```

### Task 1.4: Manual smoke load

- [ ] **Step 1: Load unpacked**

1. `npm run build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked" → select `/Users/tong/tgdwn/extension/dist/`
5. Navigate to `https://web.telegram.org/a/`
6. Open DevTools → Console

- [ ] **Step 2: Verify boot log**

Expected: console shows `[tg-saver] boot stub`.

- [ ] **Step 3: Verify popup opens**

Click the extension icon in the toolbar.
Expected: popup window opens (blank for now), console shows `[tg-saver] popup stub`.

- [ ] **Step 4: Note any issues; nothing to commit (manual-only).**

---

# Phase 2 — Platform Layer

**Milestone:** `detectPlatform()` correctly identifies `/a`, `/k`, and rejects other paths; `getPlatform('weba')` returns a module matching the contract; unit-tested with URL fixtures.

### Task 2.1: DOM utilities

**Files:**
- Create: `src/utils/dom.js`
- Test: `tests/unit/dom.test.js`

- [ ] **Step 1: Write the failing test for `debounce`**

```js
// tests/unit/dom.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debounce } from '../../src/utils/dom.js';

test('debounce fires once for rapid calls', async () => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 10);
  fn(); fn(); fn();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module ... dom.js`.

- [ ] **Step 3: Implement `src/utils/dom.js`**

```js
// DOM helpers used across scanner, UI, and downloader.
// All functions are safe to call with null/undefined input (return null/empty).

/** Returns a debounced version of fn. Leading edge = false, trailing = true. */
export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Resolves when selector matches an element under root, or timeout ms elapses. */
export function waitFor(root, selector, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const existing = root.querySelector(selector);
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const found = root.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}

/** Closest ancestor (or self) matching any selector in the array. Returns null if none match. */
export function closestMatching(node, selectors) {
  let el = node;
  while (el && el.nodeType === 1) {
    for (const sel of selectors) {
      if (el.matches?.(sel)) return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** querySelectorAll that tolerates a multi-selector array (tries each until one matches). */
export function safeQueryAll(root, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const found = root.querySelectorAll(sel);
    if (found.length) return Array.from(found);
  }
  return [];
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add test for `closestMatching`**

Append to `tests/unit/dom.test.js`:

```js
import { closestMatching } from '../../src/utils/dom.js';

test('closestMatching returns nearest matching ancestor', () => {
  // Minimal jsdom-free check using a fake Element-like object.
  const leaf = { nodeType: 1, matches: (s) => s === '.thumb', parentElement: null };
  assert.equal(closestMatching(leaf, ['.thumb', '.avatar']), leaf);

  const parent = { nodeType: 1, matches: (s) => s === '.avatar', parentElement: null };
  const child = { nodeType: 1, matches: () => false, parentElement: parent };
  assert.equal(closestMatching(child, ['.thumb', '.avatar']), parent);
});
```

- [ ] **Step 6: Run test, verify passes**

Run: `npm test`
Expected: PASS (2 dom tests).

- [ ] **Step 7: Commit**

```bash
git add src/utils/dom.js tests/unit/dom.test.js
git commit -m "feat(utils): debounce, waitFor, closestMatching, safeQueryAll"
```

### Task 2.2: Platform contract + detection

**Files:**
- Create: `src/platforms/contract.js`
- Create: `src/platforms/detect.js`
- Test: `tests/unit/detect.test.js`

- [ ] **Step 1: Write the contract module**

```js
// src/platforms/contract.js
// JSDoc typedefs and the selector-lookup helper shared by WebA and WebK modules.
// Both platform modules export this same shape.

/**
 * @typedef {Object} Platform
 * @property {'weba'|'webk'} name
 * @property {Object<string, string|string[]>} selectors
 * @property {(messageEl: Element) => boolean} isAlbum
 * @property {(messageEl: Element) => Iterable<Element>} iterMedia
 * @property {(mediaNode: Element) => { url: string, type: string, mime?: string } | null} extractUrl
 * @property {(messageEl: Element, mediaNode: Element) => void} nativeViewerOpen
 */

/** Resolve a selector entry (string or array) to the first live match under root. */
export function pickSelector(root, entry) {
  const list = Array.isArray(entry) ? entry : [entry];
  for (const sel of list) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
```

- [ ] **Step 2: Write the failing test for `detectPlatform`**

```js
// tests/unit/detect.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform } from '../../src/platforms/detect.js';

function fakeLocation(pathname) {
  return { pathname, href: `https://web.telegram.org${pathname}` };
}

test('detectPlatform returns weba for /a paths', () => {
  assert.equal(detectPlatform(fakeLocation('/a/')), 'weba');
  assert.equal(detectPlatform(fakeLocation('/a/#123')), 'weba');
});

test('detectPlatform returns webk for /k paths', () => {
  assert.equal(detectPlatform(fakeLocation('/k/')), 'webk');
  assert.equal(detectPlatform(fakeLocation('/k/?p=u123')), 'webk');
});

test('detectPlatform returns null for unsupported paths', () => {
  assert.equal(detectPlatform(fakeLocation('/')), null);
  assert.equal(detectPlatform(fakeLocation('/foo')), null);
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `detect.js`**

```js
// src/platforms/detect.js
// URL-based detection. Mirrors the reference's a/k branch but returns null for anything else.

/**
 * @param {Location|{pathname: string, href: string}} loc
 * @returns {'weba'|'webk'|null}
 */
export function detectPlatform(loc = globalThis.location) {
  if (!loc?.pathname) return null;
  if (loc.pathname.startsWith('/a')) return 'weba';
  if (loc.pathname.startsWith('/k')) return 'webk';
  return null;
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test`
Expected: PASS (3 detect tests).

- [ ] **Step 6: Commit**

```bash
git add src/platforms/contract.js src/platforms/detect.js tests/unit/detect.test.js
git commit -m "feat(platforms): contract typedef + URL detection"
```

### Task 2.3: WebA platform module

**Files:**
- Create: `src/platforms/weba.js`
- Test: `tests/unit/platformWeba.test.js`
- Test fixture: `tests/fixtures/weba-message.html`

- [ ] **Step 1: Capture the WebA fixture**

Save the following to `tests/fixtures/weba-message.html` (realistic-shape snapshot of a WebA message bubble — selectors based on the reference's `message-content-wrapper`):

```html
<div class="chat-container">
  <div class="messages-container">
    <div class="message message-in" data-msg-id="42">
      <div class="message-content-wrapper">
        <div class="content">
          <img class="message-media" src="blob:https://web.telegram.org/photo-123" data-photo-id="123">
        </div>
        <div class="MessageFooter">
          <div class="message-title"><span class="time">21:04</span></div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/platformWeba.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom'; // see Task 2.6 if jsdom not yet installed

import weba from '../../src/platforms/weba.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, '../fixtures/weba-message.html'), 'utf8');

test('weba.iterMedia yields media children', () => {
  const dom = new JSDOM(fixture);
  const messageEl = dom.window.document.querySelector('.message');
  const items = Array.from(weba.iterMedia(messageEl));
  assert.equal(items.length, 1);
  assert.equal(items[0].dataset.photoId, '123');
});

test('weba.extractUrl pulls the src', () => {
  const dom = new JSDOM(fixture);
  const media = dom.window.document.querySelector('.message-media');
  const result = weba.extractUrl(media);
  assert.equal(result.url, 'blob:https://web.telegram.org/photo-123');
  assert.equal(result.type, 'image');
});
```

- [ ] **Step 3: Add jsdom as a dev dependency**

Run: `npm install --save-dev jsdom`

- [ ] **Step 4: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `src/platforms/weba.js` missing.

- [ ] **Step 5: Implement `weba.js`**

```js
// src/platforms/weba.js
// Selectors for web.telegram.org/a/. Based on the reference's
// `message-content-wrapper` + `MessageFooter` layout.

/** @type {import('./contract.js').Platform} */
export default {
  name: 'weba',

  selectors: {
    messageFooter: ['.MessageFooter', '.message-footer'],
    messageBubble: ['.message', '[data-msg-id]'],
    messageContentWrapper: ['.message-content-wrapper'],
    mediaChild: ['.message-media', 'img[data-photo-id]', 'video[data-document-id]'],
    albumGroup: ['.album', '.media-container'],
    albumThumb: ['.album .thumbnail', '.album img.thumb'],
    scrollRoot: ['.messages-container', '.chat-container'],
    storyViewer: ['.story-viewer', '.StoryViewer'],
    mediaViewer: ['.media-viewer', '.MediaViewer'],
    avatar: ['.avatar', '.profile-photo'],
    emoji: ['.emoji', '.emoji-small'],
    sticker: ['.sticker', '.sticker-media'],
    iconSprite: ['.icon', '.button-icon'],
  },

  isAlbum(messageEl) {
    return !!messageEl.querySelector('.album, .media-container.multi');
  },

  iterMedia(messageEl) {
    const nodes = messageEl.querySelectorAll('.message-media, img[data-photo-id], video[data-document-id]');
    return Array.from(nodes);
  },

  extractUrl(mediaNode) {
    const url = mediaNode.src || mediaNode.getAttribute('src') || '';
    if (!url) return null;
    const tag = mediaNode.tagName.toLowerCase();
    const type = tag === 'video' ? 'video' : tag === 'img' ? 'image' : 'other';
    return { url, type, mime: mediaNode.type };
  },

  nativeViewerOpen(messageEl, mediaNode) {
    // Trigger Telegram's own media viewer by clicking the media element.
    mediaNode?.click();
  },
};
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test`
Expected: PASS (2 weba tests).

- [ ] **Step 7: Commit**

```bash
git add src/platforms/weba.js tests/fixtures/weba-message.html tests/unit/platformWeba.test.js package.json package-lock.json
git commit -m "feat(platforms): weba module with message-content-wrapper selectors"
```

### Task 2.4: WebK platform module

**Files:**
- Create: `src/platforms/webk.js`
- Test: `tests/unit/platformWebk.test.js`
- Test fixture: `tests/fixtures/webk-message.html`

- [ ] **Step 1: Capture the WebK fixture**

Save `tests/fixtures/webk-message.html` (WebK uses `bubble-content-wrapper`):

```html
<div class="chat">
  <div class="bubbles-inner">
    <div class="bubble bubble-first bubble-in" data-msg-id="42">
      <div class="bubble-content-wrapper">
        <div class="bubble-content">
          <video class="bubble-video" src="https://web.telegram.org/stream/..." data-document-id="abc"></video>
        </div>
        <div class="bubble-footer">
          <span class="time">21:04</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/platformWebk.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import webk from '../../src/platforms/webk.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, '../fixtures/webk-message.html'), 'utf8');

test('webk.iterMedia yields media children', () => {
  const dom = new JSDOM(fixture);
  const messageEl = dom.window.document.querySelector('.bubble');
  const items = Array.from(webk.iterMedia(messageEl));
  assert.equal(items.length, 1);
  assert.equal(items[0].dataset.documentId, 'abc');
});

test('webk.extractUrl pulls video src', () => {
  const dom = new JSDOM(fixture);
  const media = dom.window.document.querySelector('.bubble-video');
  const result = webk.extractUrl(media);
  assert.ok(result.url.startsWith('https://web.telegram.org/stream/'));
  assert.equal(result.type, 'video');
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `webk.js` missing.

- [ ] **Step 4: Implement `webk.js`**

```js
// src/platforms/webk.js
// Selectors for web.telegram.org/k/. Based on the reference's
// `bubble-content-wrapper` + `.bubble-footer` layout.

/** @type {import('./contract.js').Platform} */
export default {
  name: 'webk',

  selectors: {
    messageFooter: ['.bubble-footer', '.MessageFooter'],
    messageBubble: ['.bubble', '[data-msg-id]'],
    messageContentWrapper: ['.bubble-content-wrapper'],
    mediaChild: ['.bubble-video', '.bubble-image', 'img[data-photo-id]', 'video[data-document-id]'],
    albumGroup: ['.album', '.bubbles-group'],
    albumThumb: ['.album .thumb'],
    scrollRoot: ['.bubbles-inner', '.chat'],
    storyViewer: ['.story-viewer'],
    mediaViewer: ['.media-viewer', '.viewer'],
    avatar: ['.avatar', '.dialog-avatar', '.user-avatar'],
    emoji: ['.emoji', '.reaction-emoji'],
    sticker: ['.sticker', '.bubble-sticker'],
    iconSprite: ['.icon', '.button-icon'],
  },

  isAlbum(messageEl) {
    return !!messageEl.querySelector('.album, .bubbles-group');
  },

  iterMedia(messageEl) {
    const nodes = messageEl.querySelectorAll('.bubble-video, .bubble-image, img[data-photo-id], video[data-document-id]');
    return Array.from(nodes);
  },

  extractUrl(mediaNode) {
    const url = mediaNode.src || mediaNode.getAttribute('src') || '';
    if (!url) return null;
    const tag = mediaNode.tagName.toLowerCase();
    const type = tag === 'video' ? 'video' : tag === 'img' ? 'image' : 'other';
    return { url, type, mime: mediaNode.type };
  },

  nativeViewerOpen(messageEl, mediaNode) {
    mediaNode?.click();
  },
};
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test`
Expected: PASS (2 webk tests).

- [ ] **Step 6: Commit**

```bash
git add src/platforms/webk.js tests/fixtures/webk-message.html tests/unit/platformWebk.test.js
git commit -m "feat(platforms): webk module with bubble-content-wrapper selectors"
```

### Task 2.5: Platform resolver

**Files:**
- Create: `src/platforms/index.js`
- Test: `tests/unit/platformResolver.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/platformResolver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatform } from '../../src/platforms/index.js';

test('getPlatform returns the matching module', () => {
  assert.equal(getPlatform('weba').name, 'weba');
  assert.equal(getPlatform('webk').name, 'webk');
});

test('getPlatform throws for unknown', () => {
  assert.throws(() => getPlatform('nope'), /unknown platform/);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement the resolver**

```js
// src/platforms/index.js
import weba from './weba.js';
import webk from './webk.js';

const REGISTRY = { weba, webk };

/**
 * @param {'weba'|'webk'} name
 * @returns {import('./contract.js').Platform}
 */
export function getPlatform(name) {
  const mod = REGISTRY[name];
  if (!mod) throw new Error(`unknown platform: ${name}`);
  return mod;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test`
Expected: PASS (2 resolver tests).

- [ ] **Step 5: Commit**

```bash
git add src/platforms/index.js tests/unit/platformResolver.test.js
git commit -m "feat(platforms): resolver"
```

### Task 2.6: Wire detect+resolver into boot

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Replace `src/index.js` with the real boot stub**

```js
// src/index.js
// tg-saver content script entry point.
// Detects the active Telegram Web frontend and boots the scanner/UI.
// Further wiring lands in Phase 5 / Task 5.x.

import { detectPlatform } from './platforms/detect.js';
import { getPlatform } from './platforms/index.js';

function boot() {
  const name = detectPlatform();
  if (!name) {
    console.log('[tg-saver] not a supported Telegram Web frontend; staying dormant.');
    return;
  }
  const platform = getPlatform(name);
  console.log(`[tg-saver] booting for ${name}`);
  // Phase 5: start scanner with this platform.
  // Phase 6: wire UI.
  return platform;
}

boot();
```

- [ ] **Step 2: Build and reload**

Run: `npm run build`
Then in Chrome: reload the unpacked extension at `chrome://extensions`.

- [ ] **Step 3: Manual smoke**

Navigate to `https://web.telegram.org/a/` → console shows `[tg-saver] booting for weba`.
Navigate to `https://web.telegram.org/k/` → `booting for webk`.
Navigate to `https://web.telegram.org/` → `not a supported Telegram Web frontend; staying dormant.`

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat(boot): wire detect+resolver into entry point"
```

---

# Phase 3 — Downloader Core (pure logic, fully unit-tested)

**Milestone:** `resolveUrl`, `buildFilename`, range parse/format, and `AlbumQueue` are all unit-tested in isolation. No DOM or fetch in this phase.

### Task 3.1: Range header parsing

**Files:**
- Create: `src/utils/range.js`
- Test: `tests/unit/range.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/range.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContentRange, parseContentRangeTotal, formatRangeHeader } from '../../src/utils/range.js';

test('parseContentRange parses a byte range', () => {
  assert.deepEqual(parseContentRange('bytes 0-99/1000'), { start: 0, end: 99, total: 1000 });
});

test('parseContentRange returns null on garbage', () => {
  assert.equal(parseContentRange('not a range'), null);
});

test('parseContentRangeTotal parses only the total', () => {
  assert.equal(parseContentRangeTotal('bytes 0-99/12345'), 12345);
});

test('formatRangeHeader formats an open-ended range', () => {
  assert.equal(formatRangeHeader(100), 'bytes=100-');
});

test('formatRangeHeader formats a closed range', () => {
  assert.equal(formatRangeHeader(100, 199), 'bytes=100-199');
});
```

- [ ] **Step 2: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/utils/range.js
// Parsing for HTTP Range / Content-Range headers. Mirrors the reference's
// /^bytes (\d+)-(\d+)\/(\d+)$/ pattern.

const CONTENT_RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;

/** Parse a Content-Range header. Returns null if malformed. */
export function parseContentRange(header) {
  if (!header) return null;
  const m = String(header).match(CONTENT_RANGE_RE);
  if (!m) return null;
  return { start: +m[1], end: +m[2], total: +m[3] };
}

/** Return only the total from a Content-Range, or null if malformed. */
export function parseContentRangeTotal(header) {
  const parsed = parseContentRange(header);
  return parsed ? parsed.total : null;
}

/** Format a Range request header. If `end` omitted, requests an open-ended range. */
export function formatRangeHeader(start, end) {
  return end === undefined ? `bytes=${start}-` : `bytes=${start}-${end}`;
}
```

- [ ] **Step 4: Run, verify passes**

Run: `npm test`
Expected: PASS (5 range tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/range.js tests/unit/range.test.js
git commit -m "feat(utils): Content-Range parse + Range format"
```

### Task 3.2: Filename builder

**Files:**
- Create: `src/downloader/filename.js`
- Test: `tests/unit/filename.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/filename.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilename } from '../../src/downloader/filename.js';

const baseItem = { type: 'image', messageId: '42', timestamp: new Date('2026-07-21T21:04:00Z') };

test('uses fileName from stream metadata when present', () => {
  assert.equal(
    buildFilename({ item: { ...baseItem, fileName: 'report.pdf' } }),
    'report.pdf'
  );
});

test('photos get photo_YYYY-MM-DD_HH-MM.<ext>', () => {
  const name = buildFilename({ item: { ...baseItem, ext: 'jpg' } });
  assert.match(name, /^photo_2026-07-21_21-04\.jpg$/);
});

test('videos without metadata get <messageId>_video.mp4', () => {
  const name = buildFilename({ item: { type: 'video', messageId: '99', timestamp: new Date(0) } });
  assert.equal(name, '99_video.mp4');
});

test('strips filesystem-illegal characters', () => {
  const name = buildFilename({ item: { ...baseItem, fileName: 'bad/name?:*.txt' } });
  assert.equal(name, 'bad_name___.txt');
});

test('strips trailing dots/spaces (Windows collision guard)', () => {
  const name = buildFilename({ item: { ...baseItem, fileName: 'file.   ' } });
  assert.equal(name, 'file');
});

test('prefixes Windows-reserved device names', () => {
  assert.equal(buildFilename({ item: { ...baseItem, fileName: 'CON.mp4' } }), '_CON.mp4');
  assert.equal(buildFilename({ item: { ...baseItem, fileName: 'nul' } }), '_nul');
  assert.equal(buildFilename({ item: { ...baseItem, fileName: 'com1.txt' } }), '_com1.txt');
});
```

- [ ] **Step 2: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/downloader/filename.js
// Telegram-native naming. Mirrors what Telegram Web's own Save As produces.

const ILLEGAL_RE = /[<>:"/\\|?*\x00-\x1f]/g;
const TRAILING_RE = /[.\s]+$/;
// Windows reserved device names (case-insensitive), with or without extension.
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

function pad2(n) { return String(n).padStart(2, '0'); }

function timestampStamp(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
}

function sanitize(name) {
  let cleaned = name.replace(ILLEGAL_RE, '_').replace(/\s+/g, ' ').trim();
  // Strip trailing dots/spaces — Windows ignores them, causing silent collisions.
  cleaned = cleaned.replace(TRAILING_RE, '');
  // Prefix reserved Windows device names so they save correctly cross-platform.
  if (WIN_RESERVED.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned || 'download';
}

/**
 * @param {Object} args
 * @param {{ type?: string, messageId?: string, timestamp?: Date, fileName?: string, ext?: string }} args.item
 * @returns {string}
 */
export function buildFilename({ item }) {
  if (item.fileName) return sanitize(item.fileName);

  const ext = item.ext || defaultExtForType(item.type);

  if (item.type === 'image') {
    return `photo_${timestampStamp(item.timestamp)}.${ext}`;
  }
  if (item.type === 'video' || item.type === 'gif') {
    return `${item.messageId || 'media'}_video.${ext}`;
  }
  // Voice/audio/documents: messageId + ext.
  return `${item.messageId || 'media'}.${ext}`;
}

function defaultExtForType(type) {
  switch (type) {
    case 'image': return 'jpg';
    case 'video': return 'mp4';
    case 'gif': return 'mp4';
    case 'audio':
    case 'voice': return 'ogg';
    default: return 'bin';
  }
}
```

- [ ] **Step 4: Run, verify passes**

Run: `npm test`
Expected: PASS (4 filename tests).

- [ ] **Step 5: Commit**

```bash
git add src/downloader/filename.js tests/unit/filename.test.js
git commit -m "feat(downloader): telegram-native filename builder"
```

### Task 3.3: URL resolver

**Files:**
- Create: `src/downloader/resolveUrl.js`
- Test: `tests/unit/resolveUrl.test.js`

- [ ] **Step 1: Write the failing test (uses a stub `fetch`)**

```js
// tests/unit/resolveUrl.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUrl } from '../../src/downloader/resolveUrl.js';

function makeFetch({ status = 206, contentRange = 'bytes 0-99/1000', contentType = 'video/mp4', acceptRanges = 'bytes', body = '' } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h) => ({
          'content-range': contentRange,
          'content-type': contentType,
          'accept-ranges': acceptRanges,
          'content-length': '100',
        }[h.toLowerCase()]),
      },
      blob: async () => ({ size: 100, type: contentType }),
      arrayBuffer: async () => new ArrayBuffer(100),
    };
  };
  fn.calls = calls;
  return fn;
}

test('resolveUrl handles stream/ URLs by decoding metadata', async () => {
  const meta = encodeURIComponent(JSON.stringify({ fileName: 'clip.mp4', location: { id: 'abc' } }));
  const url = `https://web.telegram.org/stream/${meta}`;
  const r = await resolveUrl(url, { fetch: makeFetch() });
  assert.equal(r.suggestedName, 'clip.mp4');
  assert.equal(r.size, 1000);
});

test('resolveUrl handles blob: URLs by re-fetching for size', async () => {
  const r = await resolveUrl('blob:https://web.telegram.org/x', { fetch: makeFetch() });
  assert.equal(r.size, 1000);
  assert.equal(r.contentType, 'video/mp4');
});

test('resolveUrl handles direct CDN URLs via Range probe', async () => {
  const r = await resolveUrl('https://web.telegram.org/cdn/file.mp4', { fetch: makeFetch() });
  assert.equal(r.size, 1000);
  assert.equal(r.url, 'https://web.telegram.org/cdn/file.mp4');
});

test('resolveUrl throws if server does not support ranges', async () => {
  await assert.rejects(
    () => resolveUrl('https://web.telegram.org/cdn/file.mp4', { fetch: makeFetch({ acceptRanges: 'none' }) }),
    /does not support/
  );
});
```

- [ ] **Step 2: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/downloader/resolveUrl.js
// Stage 1 of the pipeline: normalize raw src → { url, size, contentType, suggestedName }.
// Handles blob:, stream/, progressive/, and direct URLs.
// Mirrors the reference's parsing for stream/ and progressive/.

import { formatRangeHeader, parseContentRangeTotal } from '../utils/range.js';

/** Decode the JSON metadata embedded after "stream/" in the URL path. */
function decodeStreamMeta(url) {
  const idx = url.indexOf('stream/');
  if (idx === -1) return null;
  const after = url.slice(idx + 'stream/'.length).split('?')[0];
  try {
    return JSON.parse(decodeURIComponent(after));
  } catch {
    return null;
  }
}

/** Decode metadata for "progressive/" URLs. */
function decodeProgressiveMeta(url) {
  const idx = url.indexOf('progressive/');
  if (idx === -1) return null;
  try {
    return JSON.parse(decodeURIComponent(url.slice(idx + 'progressive/'.length).split('?')[0]));
  } catch {
    return null;
  }
}

/**
 * @param {string} rawSrc
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<{ url: string, size: number, contentType: string, suggestedName?: string }>}
 */
export async function resolveUrl(rawSrc, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;

  // Probe once to learn size + type. Range: bytes=0- requests one byte but
  // servers typically return the full first chunk; we read headers only.
  const probeResp = await fetchImpl(rawSrc, { headers: { Range: formatRangeHeader(0) } });
  if (!probeResp.ok) {
    throw new Error(`HTTP ${probeResp.status} probing ${rawSrc}`);
  }
  const contentRange = probeResp.headers.get('content-range');
  const contentType = (probeResp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  const acceptRanges = probeResp.headers.get('accept-ranges');

  if (!rawSrc.startsWith('blob:') && acceptRanges !== 'bytes' && !contentRange) {
    throw new Error(`Server does not support byte ranges: ${rawSrc}`);
  }

  const size = contentRange ? parseContentRangeTotal(contentRange) : Number(probeResp.headers.get('content-length') || 0);

  let suggestedName;
  if (rawSrc.includes('stream/')) {
    const meta = decodeStreamMeta(rawSrc);
    if (meta) suggestedName = meta.fileName || (meta.location?.id ? `${meta.location.id}.${extFromType(contentType)}` : undefined);
  } else if (rawSrc.includes('progressive/')) {
    const meta = decodeProgressiveMeta(rawSrc);
    if (meta?.fileName) suggestedName = meta.fileName;
  }

  return { url: rawSrc, size: size || 0, contentType, suggestedName };
}

function extFromType(contentType) {
  const sub = contentType.split('/')[1] || 'bin';
  return sub.split('+')[0]; // e.g. "svg+xml" → "svg"
}
```

- [ ] **Step 4: Run, verify passes**

Run: `npm test`
Expected: PASS (4 resolveUrl tests).

- [ ] **Step 5: Commit**

```bash
git add src/downloader/resolveUrl.js tests/unit/resolveUrl.test.js
git commit -m "feat(downloader): URL resolver for blob/stream/progressive/direct"
```

### Task 3.4: Album queue

**Files:**
- Create: `src/downloader/queue.js`
- Test: `tests/unit/queue.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/queue.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlbumQueue, Scheduler } from '../../src/downloader/queue.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

test('AlbumQueue runs items sequentially', async () => {
  const order = [];
  const queue = new AlbumQueue();
  queue.add(async () => { order.push('a-start'); await sleep(10); order.push('a-end'); });
  queue.add(async () => { order.push('b-start'); await sleep(10); order.push('b-end'); });
  await queue.done();
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('Scheduler runs at most 2 albums in parallel', async () => {
  const active = { current: 0, max: 0 };
  const sched = new Scheduler(2);

  async function makeAlbum(label) {
    return sched.runAlbum(async () => {
      active.current++;
      active.max = Math.max(active.max, active.current);
      await sleep(20);
      active.current--;
      return label;
    });
  }

  const results = await Promise.all([makeAlbum('x'), makeAlbum('y'), makeAlbum('z')]);
  assert.deepEqual(results.sort(), ['x', 'y', 'z']);
  assert.equal(active.max, 2);
});
```

- [ ] **Step 2: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/downloader/queue.js
// Per-album queue (sequential) + scheduler (max-N parallel albums).

/** A queue of tasks that run one at a time, in insertion order. */
export class AlbumQueue {
  constructor() {
    /** @type {Array<() => Promise<unknown>>} */
    this._tasks = [];
    this._running = false;
    this._done = null;
  }

  /** @param {() => Promise<unknown>} task */
  add(task) {
    this._tasks.push(task);
    this._pump();
  }

  /** Resolves when all currently-added tasks have completed. */
  done() {
    if (!this._running && this._tasks.length === 0) return Promise.resolve();
    if (!this._done) this._done = new Promise((resolve) => { this._resolveDone = resolve; });
    return this._done;
  }

  _pump() {
    if (this._running) return;
    const task = this._tasks.shift();
    if (!task) {
      if (this._resolveDone) this._resolveDone();
      this._done = null;
      this._resolveDone = null;
      return;
    }
    this._running = true;
    Promise.resolve()
      .then(() => task())
      .catch(() => {})
      .finally(() => {
        this._running = false;
        this._pump();
      });
  }
}

/** Limits how many AlbumQueues can run concurrently. */
export class Scheduler {
  constructor(maxParallel = 2) {
    this.maxParallel = maxParallel;
    this._active = 0;
    /** @type {Array<() => void>} */
    this._waiting = [];
  }

  /**
   * @param {() => Promise<T>} run
   * @returns {Promise<T>}
   * @template T
   */
  runAlbum(run) {
    return new Promise((resolve, reject) => {
      const start = () => {
        this._active++;
        Promise.resolve().then(run).then(resolve, reject).finally(() => {
          this._active--;
          const next = this._waiting.shift();
          if (next) next();
        });
      };
      if (this._active < this.maxParallel) start();
      else this._waiting.push(start);
    });
  }
}
```

- [ ] **Step 4: Run, verify passes**

Run: `npm test`
Expected: PASS (2 queue tests).

- [ ] **Step 5: Commit**

```bash
git add src/downloader/queue.js tests/unit/queue.test.js
git commit -m "feat(downloader): per-album queue + max-2 scheduler"
```

---

# Phase 4 — Download Execution

**Milestone:** `streamToDisk` and `blobToDisk` produce saved files in Chrome; tested manually against the loaded extension on `web.telegram.org/a/` and `/k/`.

### Task 4.1: Logger

**Files:**
- Create: `src/utils/logger.js`

- [ ] **Step 1: Implement**

```js
// src/utils/logger.js
// Leveled logger. All methods no-op unless settings.debug is true.
// Re-reads the flag live via the getter so the popup toggle takes effect without reload.

let _debug = false;

export function setDebugEnabled(v) { _debug = !!v; }
export function isDebugEnabled() { return _debug; }

export const log = {
  info: (...args) => { if (_debug) console.log('[tg-saver]', ...args); },
  warn: (...args) => { if (_debug) console.warn('[tg-saver]', ...args); },
  error: (...args) => { console.error('[tg-saver]', ...args); }, // errors always surface
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/logger.js
git commit -m "feat(utils): leveled debug logger"
```

### Task 4.2: Blob writer

**Files:**
- Create: `src/downloader/blobDownload.js`

- [ ] **Step 1: Implement**

```js
// src/downloader/blobDownload.js
// Fallback path for small files (<100 MB) or when File System Access is unavailable.
// Mirrors the reference's Range fetch → Blob concatenation → <a download>.

import { formatRangeHeader, parseContentRange } from '../utils/range.js';
import { log } from '../utils/logger.js';

const SEGMENT_PARALLEL = 20;

/**
 * @param {Object} args
 * @param {string} args.url
 * @param {string} args.filename
 * @param {number} args.size
 * @param {string} [args.contentType]
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function blobToDisk({ url, filename, size, contentType, onProgress, signal }) {
  const resp = await fetch(url, { headers: { Range: formatRangeHeader(0) }, signal });
  if (![200, 206].includes(resp.status)) throw new Error(`blobToDisk: HTTP ${resp.status}`);

  const contentRange = resp.headers.get('content-range');
  if (!contentRange) throw new Error('blobToDisk: no Content-Range');
  const parsed = parseContentRange(contentRange);
  if (!parsed) throw new Error('blobToDisk: malformed Content-Range');

  const total = parsed.total;
  const segmentSize = Number(resp.headers.get('content-length')) || 1;

  // Build a list of Range requests covering the whole file.
  const ranges = [];
  for (let start = 0; start < total; start += segmentSize) {
    const end = Math.min(start + segmentSize - 1, total - 1);
    ranges.push({ start, end });
  }

  const buffers = new Array(ranges.length);
  let done = 0;

  // Run SEGMENT_PARALLEL at a time.
  for (let i = 0; i < ranges.length; i += SEGMENT_PARALLEL) {
    if (signal?.aborted) throw new Error('aborted');
    const batch = ranges.slice(i, i + SEGMENT_PARALLEL);
    const results = await Promise.all(batch.map(async (r, j) => {
      const segResp = await fetch(url, { headers: { Range: formatRangeHeader(r.start, r.end) }, signal });
      if (segResp.status !== 206) throw new Error(`segment HTTP ${segResp.status}`);
      const buf = await segResp.arrayBuffer();
      const idx = i + j;
      buffers[idx] = buf;
      done += buf.byteLength;
      onProgress?.(Math.round((done / total) * 100));
      return buf;
    }));
    log.info(`batch complete: ${results.length} segments, ${done}/${total} bytes`);
  }

  const blob = new Blob(buffers, { type: contentType || 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/downloader/blobDownload.js
git commit -m "feat(downloader): blob writer (Range fetch + <a download>)"
```

### Task 4.3: Stream-to-disk writer

**Files:**
- Create: `src/downloader/streamDownload.js`

- [ ] **Step 1: Implement**

```js
// src/downloader/streamDownload.js
// Preferred path for large files. Uses the File System Access API to stream
// bytes straight to disk without holding the whole file in memory.

import { formatRangeHeader, parseContentRange } from '../utils/range.js';
import { log } from '../utils/logger.js';

const SEGMENT_PARALLEL = 20;

/**
 * @param {Object} args
 * @param {string} args.url
 * @param {string} args.filename
 * @param {number} args.size
 * @param {string} [args.contentType]
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function streamToDisk({ url, filename, size, contentType, onProgress, signal }) {
  if (!('showSaveFilePicker' in window)) {
    throw new Error('File System Access API unavailable');
  }

  // Probe to learn segment size + total.
  const probe = await fetch(url, { headers: { Range: formatRangeHeader(0) }, signal });
  if (probe.status !== 206) throw new Error(`streamToDisk: HTTP ${probe.status}`);
  const contentRange = probe.headers.get('content-range');
  const parsed = parseContentRange(contentRange);
  if (!parsed) throw new Error('streamToDisk: malformed Content-Range');
  const total = parsed.total;
  const segmentSize = Number(probe.headers.get('content-length')) || 1;
  const ext = (contentType?.split('/')[1] || 'bin').split('+')[0];

  // File picker requires a user gesture — caller must invoke from a click handler.
  const handle = await window.showSaveFilePicker({
    suggestedName: filename,
    types: [{
      description: 'Media file',
      accept: { [contentType || 'application/octet-stream']: [`.${ext}`] },
    }],
  });
  const writable = await handle.createWritable();

  let done = 0;
  try {
    for (let start = 0; start < total; start += segmentSize * SEGMENT_PARALLEL) {
      if (signal?.aborted) throw new Error('aborted');
      const batch = [];
      for (let j = 0; j < SEGMENT_PARALLEL; j++) {
        const segStart = start + j * segmentSize;
        if (segStart >= total) break;
        const segEnd = Math.min(segStart + segmentSize - 1, total - 1);
        batch.push({ segStart, segEnd, idx: j });
      }
      const results = await Promise.all(batch.map(async ({ segStart, segEnd }) => {
        const r = await fetch(url, { headers: { Range: formatRangeHeader(segStart, segEnd) }, signal });
        if (r.status !== 206) throw new Error(`segment HTTP ${r.status}`);
        return r.arrayBuffer();
      }));
      for (const buf of results) {
        await writable.write({ type: 'write', data: buf });
        done += buf.byteLength;
        onProgress?.(Math.round((done / total) * 100));
      }
      log.info(`streamed ${done}/${total} bytes`);
    }
  } finally {
    await writable.close();
  }
}

export function isStreamSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/downloader/streamDownload.js
git commit -m "feat(downloader): File System Access streaming writer"
```

### Task 4.4: Download orchestrator (strategy picker)

**Files:**
- Create: `src/downloader/index.js`

- [ ] **Step 1: Implement**

```js
// src/downloader/index.js
// Picks between stream and blob based on file size + user settings + API availability.

import { resolveUrl } from './resolveUrl.js';
import { streamToDisk, isStreamSupported } from './streamDownload.js';
import { blobToDisk } from './blobDownload.js';
import { buildFilename } from './filename.js';
import { log } from '../utils/logger.js';

const STREAM_THRESHOLD = 100 * 1024 * 1024; // 100 MB

/**
 * @param {Object} args
 * @param {string} args.rawSrc
 * @param {Object} args.item
 * @param {boolean} args.streamEnabled  // from settings
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function download({ rawSrc, item, streamEnabled, onProgress, signal }) {
  const resolved = await resolveUrl(rawSrc);
  const filename = buildFilename({ item: { ...item, fileName: resolved.suggestedName, ext: extFromType(resolved.contentType) } });

  const useStream = streamEnabled && isStreamSupported() && resolved.size > STREAM_THRESHOLD;
  log.info(`download: ${filename} (${resolved.size} bytes) via ${useStream ? 'stream' : 'blob'}`);

  if (useStream) {
    try {
      await streamToDisk({
        url: resolved.url,
        filename,
        size: resolved.size,
        contentType: resolved.contentType,
        onProgress,
        signal,
      });
      return;
    } catch (err) {
      if (err.message === 'aborted') throw err;
      // Permission denied or API glitch → fall through to blob.
      log.warn('stream failed, falling back to blob:', err.message);
    }
  }

  await blobToDisk({
    url: resolved.url,
    filename,
    size: resolved.size,
    contentType: resolved.contentType,
    onProgress,
    signal,
  });
}

function extFromType(contentType) {
  const sub = (contentType || '').split('/')[1] || 'bin';
  return sub.split('+')[0];
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/downloader/index.js
git commit -m "feat(downloader): strategy picker (stream vs blob)"
```

---

# Phase 5 — Scanner

**Milestone:** Scanner runs live on `web.telegram.org`, observes message mutations, classifies nodes, and logs discovered `REAL` items to the console (UI wiring follows in Phase 6).

### Task 5.1: Settings store

**Files:**
- Create: `src/settings/store.js`
- Test: `tests/unit/settings.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/settings.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, applyChanges } from '../../src/settings/store.js';

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      const out = {};
      for (const k of Object.keys(keys)) out[k] = store[k] ?? keys[k];
      return out;
    },
    async set(obj) { Object.assign(store, obj); },
    _store: store,
  };
}

test('loadSettings returns defaults for missing keys', async () => {
  const s = await loadSettings(fakeStorage());
  assert.equal(s.silentMode, false);
  assert.equal(s.streamEnabled, true);
  assert.equal(s.includeStickers, false);
  assert.equal(s.debug, false);
});

test('applyChanges returns new settings with overrides merged', () => {
  const base = { silentMode: false, streamEnabled: true, includeStickers: false, debug: false };
  const next = applyChanges(base, { debug: { newValue: true } });
  assert.equal(next.debug, true);
  assert.equal(next.silentMode, false); // untouched
});
```

- [ ] **Step 2: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/settings/store.js
// Wrapper around chrome.storage.local. Defaults match the spec's popup.

export const DEFAULTS = Object.freeze({
  silentMode: false,
  streamEnabled: true,
  includeStickers: false,
  debug: false,
});

/**
 * @param {{ get: (keys: Object) => Promise<Object> }} storage
 */
export async function loadSettings(storage = chrome?.storage?.local) {
  if (!storage) return { ...DEFAULTS };
  const stored = await storage.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

/**
 * Merge chrome.storage.onChanged payload into the current settings.
 * @param {Object} current
 * @param {Object<string, { newValue?: any, oldValue?: any }>} changes
 */
export function applyChanges(current, changes) {
  const next = { ...current };
  for (const [key, change] of Object.entries(changes)) {
    if (key in DEFAULTS) next[key] = change.newValue;
  }
  return next;
}
```

- [ ] **Step 4: Run, verify passes**

Run: `npm test`
Expected: PASS (2 settings tests).

- [ ] **Step 5: Commit**

```bash
git add src/settings/store.js tests/unit/settings.test.js
git commit -m "feat(settings): chrome.storage.local wrapper + defaults"
```

### Task 5.2: Classifier

**Files:**
- Create: `src/scanner/classify.js`
- Test: `tests/unit/classify.test.js`
- Test fixture additions: `tests/fixtures/weba-album.html`, `tests/fixtures/webk-album.html` (with thumbnails/avatars/emoji)

- [ ] **Step 1: Capture album fixtures**

`tests/fixtures/weba-album.html`:

```html
<div class="message" data-msg-id="100">
  <div class="message-content-wrapper">
    <div class="content">
      <span class="avatar"><img src="avatar.png"></span>
      <span class="emoji"><img src="emoji.png"></span>
      <div class="album">
        <img class="thumb" src="blob:t1">
        <img class="thumb" src="blob:t2">
        <img class="thumb" src="blob:t3">
      </div>
      <span class="sticker"><img src="sticker.webp"></span>
    </div>
    <div class="MessageFooter"><span class="time">21:04</span></div>
  </div>
</div>
```

`tests/fixtures/webk-album.html`:

```html
<div class="bubble" data-msg-id="100">
  <div class="bubble-content-wrapper">
    <div class="bubble-content">
      <span class="dialog-avatar"><img src="avatar.png"></span>
      <span class="emoji"><img src="emoji.png"></span>
      <div class="album">
        <img class="thumb" src="blob:t1">
        <img class="thumb" src="blob:t2">
      </div>
      <span class="sticker"><img src="sticker.webp"></span>
    </div>
    <div class="bubble-footer"><span class="time">21:04</span></div>
  </div>
</div>
```

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/classify.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import weba from '../../src/platforms/weba.js';
import webk from '../../src/platforms/webk.js';
import { classifyMediaNode } from '../../src/scanner/classify.js';

const here = dirname(fileURLToPath(import.meta.url));
const webaHtml = readFileSync(join(here, '../fixtures/weba-album.html'), 'utf8');
const webkHtml = readFileSync(join(here, '../fixtures/webk-album.html'), 'utf8');

function allImgs(dom) { return Array.from(dom.window.document.querySelectorAll('img')); }

test('classify filters avatars, emoji, thumbnails; passes sticker by setting', () => {
  const dom = new JSDOM(webaHtml);
  const settings = { includeStickers: false };
  const tiers = allImgs(dom).map(img => classifyMediaNode(img, weba, settings));

  assert.equal(tiers.filter(t => t === 'PROFILE_PIC').length, 1);
  assert.equal(tiers.filter(t => t === 'EMOJI').length, 1);
  assert.equal(tiers.filter(t => t === 'THUMBNAIL').length, 3);
  assert.equal(tiers.filter(t => t === 'STICKER').length, 1);
  assert.equal(tiers.filter(t => t === 'REAL').length, 0);
});

test('includeStickers=true promotes stickers to REAL', () => {
  const dom = new JSDOM(webaHtml);
  const settings = { includeStickers: true };
  const tiers = allImgs(dom).map(img => classifyMediaNode(img, weba, settings));
  assert.equal(tiers.filter(t => t === 'REAL').length, 1);
  assert.equal(tiers.filter(t => t === 'STICKER').length, 0);
});

test('webk avatar and thumbs are classified correctly', () => {
  const dom = new JSDOM(webkHtml);
  const settings = { includeStickers: false };
  const tiers = allImgs(dom).map(img => classifyMediaNode(img, webk, settings));
  assert.equal(tiers.filter(t => t === 'PROFILE_PIC').length, 1);
  assert.equal(tiers.filter(t => t === 'THUMBNAIL').length, 2);
});
```

- [ ] **Step 3: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 4: Implement**

```js
// src/scanner/classify.js
// Decides what a media node is. Returns one of:
// REAL | THUMBNAIL | PROFILE_PIC | EMOJI | STICKER | UI_CHROME

import { closestMatching } from '../utils/dom.js';

const SMALL_PX = 48;

/**
 * @param {Element} node
 * @param {import('../platforms/contract.js').Platform} platform
 * @param {{ includeStickers?: boolean }} settings
 * @returns {'REAL'|'THUMBNAIL'|'PROFILE_PIC'|'EMOJI'|'STICKER'|'UI_CHROME'}
 */
export function classifyMediaNode(node, platform, settings = {}) {
  const sels = platform.selectors;

  if (closestMatching(node, arrayify(sels.avatar))) return 'PROFILE_PIC';
  if (closestMatching(node, arrayify(sels.emoji))) return 'EMOJI';
  if (closestMatching(node, arrayify(sels.albumThumb))) return 'THUMBNAIL';
  if (closestMatching(node, arrayify(sels.iconSprite))) return 'UI_CHROME';

  const stickerEl = closestMatching(node, arrayify(sels.sticker));
  if (stickerEl) return settings.includeStickers ? 'REAL' : 'STICKER';

  // Data-attribute heuristic: explicit media id → REAL even if no context matched.
  if (node.dataset?.photoId || node.dataset?.documentId) return 'REAL';

  // Size heuristic (last resort).
  const rect = node.getBoundingClientRect?.();
  if (rect && Math.max(rect.width, rect.height) < SMALL_PX) {
    // Tiny media inside a text-like container is almost always emoji/icon chrome.
    return 'UI_CHROME';
  }

  return 'REAL';
}

function arrayify(x) { return Array.isArray(x) ? x : [x]; }
```

- [ ] **Step 5: Run, verify passes**

Run: `npm test`
Expected: PASS (3 classify tests).

- [ ] **Step 6: Commit**

```bash
git add src/scanner/classify.js tests/fixtures/weba-album.html tests/fixtures/webk-album.html tests/unit/classify.test.js
git commit -m "feat(scanner): 6-tier media classifier with includeStickers toggle"
```

### Task 5.3: MediaItem + album resolver

**Files:**
- Create: `src/scanner/mediaItem.js`
- Create: `src/scanner/albumResolver.js`
- Test: `tests/unit/albumResolver.test.js`

- [ ] **Step 1: Write `mediaItem.js`**

```js
// src/scanner/mediaItem.js
// Normalizes a DOM media node into a plain MediaItem record.

let _seq = 0;

/**
 * @param {Element} node
 * @param {Element} messageEl
 * @param {import('../platforms/contract.js').Platform} platform
 */
export function buildMediaItem(node, messageEl, platform) {
  const extracted = platform.extractUrl(node);
  if (!extracted) return null;
  const msgId = messageEl?.dataset?.msgId || messageEl?.getAttribute('data-msg-id') || '';
  return {
    id: `mi_${++_seq}`,
    messageId: msgId,
    rawSrc: extracted.url,
    type: extracted.type,
    mime: extracted.mime,
    nodeRef: new WeakRef(node),
    messageRef: new WeakRef(messageEl),
  };
}
```

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/albumResolver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import weba from '../../src/platforms/weba.js';
import { groupIntoAlbum } from '../../src/scanner/albumResolver.js';
import { buildMediaItem } from '../../src/scanner/mediaItem.js';

const here = dirname(fileURLToPath(import.meta.url));
const webaAlbum = readFileSync(join(here, '../fixtures/weba-album.html'), 'utf8');

test('album message groups thumbs into an Album (full-res comes later)', () => {
  const dom = new JSDOM(webaAlbum);
  const messageEl = dom.window.document.querySelector('.message');
  // Pretend all 3 album thumbs are REAL for grouping purposes.
  const thumbs = Array.from(messageEl.querySelectorAll('.thumb'));
  const items = thumbs.map(t => buildMediaItem(t, messageEl, weba)).filter(Boolean);
  const result = groupIntoAlbum(items, messageEl, weba);
  assert.equal(result.kind, 'album');
  assert.equal(result.items.length, 3);
});

test('single item is not an album', () => {
  const dom = new JSDOM(webaAlbum);
  const messageEl = dom.window.document.querySelector('.message');
  const one = messageEl.querySelector('.thumb');
  const items = [buildMediaItem(one, messageEl, weba)].filter(Boolean);
  const result = groupIntoAlbum(items, messageEl, weba);
  assert.equal(result.kind, 'single');
});
```

- [ ] **Step 3: Run, verify fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 4: Implement `albumResolver.js`**

```js
// src/scanner/albumResolver.js
// If the message is an album (per platform.isAlbum), group items into an Album.
// Otherwise return a single-item record.

/**
 * @param {Array} items
 * @param {Element} messageEl
 * @param {import('../platforms/contract.js').Platform} platform
 */
export function groupIntoAlbum(items, messageEl, platform) {
  if (items.length === 0) return { kind: 'empty' };
  if (items.length === 1 || !platform.isAlbum(messageEl)) {
    return { kind: 'single', item: items[0] };
  }
  return { kind: 'album', items };
}
```

- [ ] **Step 5: Run, verify passes**

Run: `npm test`
Expected: PASS (2 albumResolver tests).

- [ ] **Step 6: Commit**

```bash
git add src/scanner/mediaItem.js src/scanner/albumResolver.js tests/unit/albumResolver.test.js
git commit -m "feat(scanner): mediaItem + album resolver"
```

### Task 5.4: Observer

**Files:**
- Create: `src/scanner/observer.js`

- [ ] **Step 1: Implement**

```js
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
```

- [ ] **Step 2: Wire into `src/index.js`**

Replace the body of `src/index.js`:

```js
// src/index.js
import { detectPlatform } from './platforms/detect.js';
import { getPlatform } from './platforms/index.js';
import { loadSettings } from './settings/store.js';
import { setDebugEnabled } from './utils/logger.js';
import { startScanner } from './scanner/observer.js';

async function boot() {
  const name = detectPlatform();
  if (!name) {
    console.log('[tg-saver] not a supported Telegram Web frontend; staying dormant.');
    return;
  }
  const platform = getPlatform(name);
  const settings = await loadSettings();
  setDebugEnabled(settings.debug);

  console.log(`[tg-saver] booting for ${name}`);
  startScanner({
    platform,
    getSettings: () => settings,
    onDiscover: (messageEl, grouped) => {
      // Phase 6: wire to button injector.
      console.log(`[tg-saver] discovered ${grouped.kind} in msg ${messageEl.dataset?.msgId}`);
    },
  });

  // Live-update settings (popup toggle takes effect without reload).
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.debug) setDebugEnabled(changes.debug.newValue);
    if (changes.includeStickers) settings.includeStickers = changes.includeStickers.newValue;
    if (changes.streamEnabled) settings.streamEnabled = changes.streamEnabled.newValue;
    if (changes.silentMode) settings.silentMode = changes.silentMode.newValue;
  });
}

boot();
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

Reload the extension. Open `web.telegram.org/a/`. Open a chat with media. Watch console: should see `[tg-saver] discovered single in msg <id>` and `discovered album in msg <id>` lines as you scroll.

- [ ] **Step 5: Commit**

```bash
git add src/scanner/observer.js src/index.js
git commit -m "feat(scanner): MutationObserver boot + console-only discovery"
```

---

# Phase 6 — UI

**Milestone:** Stealth download icon appears in message footers; clicking downloads a single item or an album (visible viewer); progress shows in an inline badge.

### Task 6.1: Stealth styles

**Files:**
- Create: `src/ui/styles.js`

- [ ] **Step 1: Implement**

```js
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

@keyframes tg-saver-spin { to { transform: rotate(360deg); } }

/* Silent mode: hide Telegram's media viewer before paint. */
.tg-saver-silent-hide {
  display: none !important;
}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/styles.js
git commit -m "feat(ui): stealth stylesheet + SVG icon set"
```

### Task 6.2: Progress badge

**Files:**
- Create: `src/ui/progressBadge.js`

- [ ] **Step 1: Implement**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/progressBadge.js
git commit -m "feat(ui): per-button state machine"
```

### Task 6.3: Silent viewer helper

**Files:**
- Create: `src/ui/silentViewer.js`

- [ ] **Step 1: Implement**

```js
// src/ui/silentViewer.js
// Hides Telegram's media viewer with CSS before paint so the user sees nothing
// while we capture the full-res URL it loads.

import { safeQueryAll } from '../utils/dom.js';
import { log } from '../utils/logger.js';

/**
 * Install the silent-hide rule and start watching the viewer for a real src.
 * @param {Object} args
 * @param {import('../platforms/contract.js').Platform} args.platform
 * @param {(url: string) => void} args.onUrl
 * @param {number} [args.timeoutMs]
 * @returns {Promise<string|null>} resolves with the captured URL or null on timeout
 */
export function captureFromSilentViewer({ platform, timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    document.documentElement.classList.add('tg-saver-silent-hide-host');
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
      if (src && !src.startsWith('blob:') === false || src) {
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
      document.documentElement.classList.remove('tg-saver-silent-hide-host');
    }
  });
}

function injectHideRule(platform) {
  const id = 'tg-saver-silent-hide-rule';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  const sels = (Array.isArray(platform.selectors.mediaViewer) ? platform.selectors.mediaViewer : [platform.selectors.mediaViewer])
    .map(s => `${s}.tg-saver-silent-hide-host-target`).join(', ');
  style.textContent = `${sels} { display: none !important; }`;
  document.head.appendChild(style);
}

function removeHideRule() {
  document.getElementById('tg-saver-silent-hide-rule')?.remove();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/silentViewer.js
git commit -m "feat(ui): silent media viewer URL capture"
```

### Task 6.4: Button injector

**Files:**
- Create: `src/ui/buttonInjector.js`

- [ ] **Step 1: Implement**

```js
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
```

- [ ] **Step 2: Add `pickFirst` to `src/utils/dom.js`**

Append to `src/utils/dom.js`:

```js
/** First element matching any selector in the array, or null. */
export function pickFirst(root, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/buttonInjector.js src/utils/dom.js
git commit -m "feat(ui): button injector with album + silent mode handling"
```

### Task 6.5: Wire UI into boot

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Replace `src/index.js`'s `onDiscover` callback**

```js
// src/index.js
import { detectPlatform } from './platforms/detect.js';
import { getPlatform } from './platforms/index.js';
import { loadSettings } from './settings/store.js';
import { setDebugEnabled } from './utils/logger.js';
import { startScanner } from './scanner/observer.js';
import { attachButton } from './ui/buttonInjector.js';

async function boot() {
  const name = detectPlatform();
  if (!name) {
    console.log('[tg-saver] not a supported Telegram Web frontend; staying dormant.');
    return;
  }
  const platform = getPlatform(name);
  let settings = await loadSettings();
  setDebugEnabled(settings.debug);

  console.log(`[tg-saver] booting for ${name}`);
  startScanner({
    platform,
    getSettings: () => settings,
    onDiscover: (messageEl, grouped) => {
      attachButton({ messageEl, grouped, platform, settings });
    },
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.debug) setDebugEnabled(changes.debug.newValue);
    if (changes.includeStickers) settings.includeStickers = changes.includeStickers.newValue;
    if (changes.streamEnabled) settings.streamEnabled = changes.streamEnabled.newValue;
    if (changes.silentMode) settings.silentMode = changes.silentMode.newValue;
  });
}

boot();
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Manual smoke**

Reload extension. Open a chat on `/a/` with a single photo. Expected: a small download icon appears next to the timestamp. Click it. Expected: file saves via File System Access picker (or blob fallback). Open a chat with an album. Expected: one icon, tooltip shows "(N items)". Click → all N download sequentially.

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat(boot): wire UI into discovery callback"
```

---

# Phase 7 — Popup

**Milestone:** Popup shows four toggles, persisted to `chrome.storage.local`, live-applied without reload.

### Task 7.1: Popup HTML/CSS/JS

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Modify: `popup/popup.js`

- [ ] **Step 1: Write `popup/popup.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tg-saver</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <header>
    <h1>tg-saver</h1>
    <p class="tagline">Privacy-first Telegram media downloader</p>
  </header>

  <main>
    <label class="row">
      <span>Silent mode</span>
      <input type="checkbox" id="silentMode">
      <small>Hide the media viewer during album downloads.</small>
    </label>

    <label class="row">
      <span>Stream to disk (File System Access)</span>
      <input type="checkbox" id="streamEnabled">
      <small>Required for files &gt;100 MB. Falls back to in-memory if unavailable.</small>
    </label>

    <label class="row">
      <span>Include stickers as media</span>
      <input type="checkbox" id="includeStickers">
      <small>Off by default — stickers usually aren't what you want to save.</small>
    </label>

    <label class="row">
      <span>Debug logging</span>
      <input type="checkbox" id="debug">
      <small>Prints discovery + download details to the page console.</small>
    </label>

    <details>
      <summary>How it works &amp; privacy</summary>
      <p>tg-saver makes <strong>no network requests except to <code>web.telegram.org</code></strong> (the page you're already on). No telemetry, no login, no tracking. It reads only what's already rendered. Source: <a href="https://github.com/tttonggg/tg-saver" target="_blank" rel="noopener">github.com/tttonggg/tg-saver</a></p>
    </details>
  </main>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `popup/popup.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #1c1c1c;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #2563eb;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #1a1a1a; --fg: #e5e5e5; --muted: #9ca3af; --border: #2d2d2d; --accent: #60a5fa; }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  width: 320px;
}
header { padding: 12px 14px 8px; border-bottom: 1px solid var(--border); }
h1 { margin: 0; font-size: 14px; font-weight: 600; }
.tagline { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
main { padding: 8px 14px; }
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 2px 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.row > span { font-weight: 500; }
.row > input { grid-row: 1; grid-column: 2; accent-color: var(--accent); width: 16px; height: 16px; }
.row > small { grid-row: 2; grid-column: 1 / 3; color: var(--muted); font-size: 11px; }
details { padding: 10px 0 4px; }
details p { margin: 6px 0 0; color: var(--muted); font-size: 11px; line-height: 1.4; }
code { background: var(--border); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
a { color: var(--accent); }
```

- [ ] **Step 3: Replace `popup/popup.js`**

```js
// popup/popup.js
// Reads/writes chrome.storage.local for the four toggles.

const KEYS = ['silentMode', 'streamEnabled', 'includeStickers', 'debug'];
const DEFAULTS = { silentMode: false, streamEnabled: true, includeStickers: false, debug: false };

async function init() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  for (const key of KEYS) {
    const el = document.getElementById(key);
    el.checked = !!stored[key];
    el.addEventListener('change', () => {
      chrome.storage.local.set({ [key]: el.checked });
    });
  }
}

init();
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Manual smoke**

Reload extension. Click the toolbar icon. Expected: popup opens with four checkboxes matching defaults. Toggle "Include stickers as media" on. Refresh the Telegram tab. Expected: stickers now get download icons. Toggle "Debug logging" on. Expected: console fills with `[tg-saver]` lines immediately (no refresh needed).

- [ ] **Step 6: Commit**

```bash
git add popup/popup.html popup/popup.css popup/popup.js
git commit -m "feat(popup): four-toggle settings UI"
```

---

# Phase 8 — Polish

**Milestone:** README has the smoke checklist; manual pass on both frontends, both silent/normal, large-file streaming, and channel with native Save disabled.

### Task 8.1: README smoke checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a "Development" + "Smoke test checklist" section**

Insert before `## License`:

```markdown
## Development

```bash
npm install
npm run build        # outputs to dist/
npm run build:watch  # rebuild on change
npm test             # unit tests
npm run lint
```

Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode on).

## Smoke test checklist

Run these after every meaningful change:

- [ ] Single video on `/a/` — saves via File System Access (file > 100 MB) or blob (smaller)
- [ ] Single photo on `/a/`
- [ ] Album of 3 on `/a/` — one icon, sequential queue, "(3 items)" tooltip
- [ ] Voice message on `/a/`
- [ ] Single video on `/k/`
- [ ] Album of 3 on `/k/`
- [ ] Channel with native Save disabled — extension still works
- [ ] File ≥ 1 GB — streams to disk without OOM
- [ ] Silent mode ON — album downloads without opening the viewer
- [ ] Silent mode OFF — album downloads with viewer visible
- [ ] Stickers hidden by default; shown when "Include stickers" is on
- [ ] File System Access disabled — blob fallback fires, badge shows success
- [ ] No console errors during normal use
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: dev setup + smoke checklist"
```

### Task 8.2: Run the unit suite green

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. Fix any warnings.

- [ ] **Step 3: Build clean**

Run: `npm run build`
Expected: no errors.

### Task 8.3: Manual end-to-end pass

- [ ] **Step 1: Run every item in the README smoke checklist on `/a/`.** Note failures.

- [ ] **Step 2: Run every item on `/k/`.** Note failures.

- [ ] **Step 3: Fix any discovered issues** (file new tasks for them rather than silently fixing inline).

- [ ] **Step 4: Tag the milestone**

```bash
git tag -a v0.1.0 -m "First working build: download from /a and /k, single + album, silent + normal"
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes "First working build. See README smoke-test checklist."
```

---

## Plan Self-Review

**Spec coverage check (§1–10 of the design spec):**
- §1 Goals & non-goals — covered by architecture (single script, no SW, no telemetry).
- §2 Architecture + file layout — Phase 1 + file map.
- §3 Download pipeline — Phase 3 (resolve/filename/queue) + Phase 4 (writers).
- §3 Silent mode — Task 6.3.
- §4 UI — Phase 6.
- §5 Platform & scanner — Phase 2 + Phase 5.
- §5 Media classification — Task 5.2.
- §6 Privacy & security — minimal manifest (Task 1.3), no remote code (esbuild bundles).
- §7 Build — Phase 1.
- §8 Testing — `tests/unit/*` throughout; manual smoke in Phase 8.
- §9 Distribution — Task 8.3 tags the release.
- §10 Decisions — all reflected.

**Placeholder scan:** none. Each code step contains complete code.

**Type/name consistency:** `Platform`, `MediaItem`, `AlbumQueue`, `Scheduler`, `classifyMediaNode`, `buildMediaItem`, `groupIntoAlbum`, `attachButton`, `download`, `resolveUrl`, `buildFilename`, `streamToDisk`, `blobToDisk`, `loadSettings`, `applyChanges` — all used consistently across tasks.

**Known gaps acknowledged (do not block v0.1.0):**
- `Story` media (story viewer) is not separately tested — relies on the same `extractUrl` path; if selectors drift, it shows as "no REAL items" rather than a crash.
- `progressBadge` has no explicit unit test — its state transitions are pure DOM mutations exercised by the manual smoke pass.

**Estimate:** ~30 tasks, ~8 phases. Each phase produces a working checkpoint.
