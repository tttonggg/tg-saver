# tg-saver — Design Specification

**Status:** Approved (2026-07-21)
**Form:** Chrome MV3 extension
**Location:** `/Users/tong/tgdwn/extension/`
**Tagline:** Privacy-first, no-limits Telegram Web media downloader. Stealth UI, local-only, free forever.

---

## 1. Goals & Non-Goals

### Goals
- Download any real media the user can view in Telegram Web: video, photo, animated GIF, voice/music audio, documents, stories.
- No quotas, no login, no billing, no telemetry — ever.
- Visual footprint indistinguishable from Telegram's own UI.
- Reliable on large files (1 GB+) without RAM spikes.
- Robust across both official web frontends (WebA `/a`, WebK `/k`) with platform changes isolated.

### Non-Goals
- Direct MTProto / Telegram API access (we never touch session credentials).
- Auto-discovery / capture of media the user hasn't loaded by browsing.
- Global batch panels, floating pills, or toolbar badges counting "captured" items.
- Support for unofficial Telegram web clients.
- Any server-side component, account, or paid tier.
- Telemetry of any kind, including opt-in.

### Privacy bar
**Strict local-only.** The only network destination the extension ever contacts is `web.telegram.org` and its CDN subdomains, for the Range fetches that constitute the core function. Everything else — auth, billing, analytics, remote config — is absent from the code entirely, not merely disabled.

### Distribution
Chrome Web Store listing + GitHub repo (unpacked dev builds). Web Store handles updates; no self-hosted update server.

---

## 2. Architecture

**Single content script, isolated world, no service worker.**

The entire feature set runs in one content script injected at `document_end` on `https://web.telegram.org/*`. Because the script runs in the page's origin, Range fetches against `web.telegram.org` carry the user's session cookies automatically — no `chrome.cookies`, no MTProto, no session reads.

No background service worker is declared. The popup communicates with the content script via `chrome.storage.local`; there is no message-passing surface to maintain.

```
┌─────────────────────────────────────────────────────────────┐
│ Content script (isolated world, runs in page origin)         │
│                                                              │
│  platforms/ ───► scanner/ ───► ui/                           │
│  (detect +     (MutationObs,  (button injector,             │
│   selectors)    classify)      progress badge)              │
│                     │                                        │
│                     ▼                                        │
│                downloader/  ───► web.telegram.org (Range)   │
│                (stream/blob)                                 │
│                                                              │
│  settings/ ◄── chrome.storage.local ──► popup/              │
└─────────────────────────────────────────────────────────────┘
```

### File layout

```
/Users/tong/tgdwn/extension/
├── manifest.json              # MV3; host web.telegram.org/*; perm: storage
├── src/
│   ├── index.js               # Content script entry: detect + boot
│   ├── platforms/
│   │   ├── detect.js          # URL-based A vs K detection
│   │   ├── weba.js            # WebA selectors + DOM helpers
│   │   ├── webk.js            # WebK selectors + DOM helpers
│   │   └── index.js           # Resolver → active platform module
│   ├── scanner/
│   │   ├── observer.js        # MutationObserver on chat scroll root
│   │   ├── classify.js        # Media node → REAL | THUMBNAIL | PROFILE_PIC | EMOJI | STICKER | UI_CHROME
│   │   ├── mediaItem.js       # Normalize DOM node → MediaItem record
│   │   └── albumResolver.js   # Group sibling media into Album (or single)
│   ├── downloader/
│   │   ├── resolveUrl.js      # Stage 0 + 1: acquire URL (silent/normal), normalize src types
│   │   ├── streamDownload.js  # File System Access API streaming to disk
│   │   ├── blobDownload.js    # In-memory blob fallback
│   │   ├── filename.js        # Telegram-native naming
│   │   └── queue.js           # Per-album sequential queue; ≤2 albums parallel
│   ├── ui/
│   │   ├── buttonInjector.js  # Inject stealth icon into message footer
│   │   ├── progressBadge.js   # Inline % / state badge
│   │   ├── silentViewer.js    # Suppress media viewer during silent-mode album download
│   │   └── styles.js          # Telegram-matching CSS, theme-var driven
│   ├── settings/
│   │   └── store.js           # chrome.storage.local wrapper + defaults + live reload
│   └── utils/
│       ├── logger.js          # Off by default; popup toggle
│       ├── range.js           # Range / Content-Range header parsing
│       └── dom.js             # waitFor, safe query, debounce
├── popup/
│   ├── popup.html             # Four toggles + help
│   ├── popup.js
│   └── popup.css
├── icons/                     # 16/48/128 PNG
├── _locales/
│   └── en/messages.json       # i18n strings (to start)
├── tests/
│   ├── fixtures/              # Snapshot WebA + WebK message HTML
│   └── unit/                  # filename, range, classify, album, resolveUrl
├── build.js                   # esbuild bundler → dist/
├── package.json
├── eslint.config.js
├── README.md
└── .gitignore
```

---

## 3. Download Pipeline

Five stages, each independently testable.

### Stage 0 — URL acquisition
The DOM usually only contains a thumbnail for album items; the full-resolution CDN URL is lazy-loaded by Telegram's media viewer. Two modes:

- **Normal (default):** the viewer opens normally when the user clicks the album download button. We watch for the full-res URL to appear in the viewer's `<video src>` / `<img src>`, capture it, close the viewer, hand off to Stage 1.
- **Silent (opt-in popup toggle):** before triggering the viewer, inject a CSS rule hiding the viewer element (`display:none`, applied before paint). Dispatch the same click event that opens the viewer through Telegram's own path. Telegram loads the full-res URL into the hidden viewer; we capture it the moment it materializes, close the viewer, remove the hide-rule. The user sees nothing.

Both modes produce the same artifact (a full-res URL) and feed the same Stage 1.

### Stage 1 — Resolve
Normalize the raw src to `{ url, size, contentType, suggestedName }`:
- `blob:` → re-fetch with `Range: bytes=0-` to learn total size and content type.
- `stream/` → JSON-decode the metadata embedded in the path segment after `stream/` (URL-decoded); extract `fileName` or `location.id` + extension.
- `progressive/` → parse similarly; the document id rides after `document` in the path.
- Direct CDN URL → Range probe (`Range: bytes=0-0`) to learn size and content type from `Content-Range` / `Content-Type`.

### Stage 2 — Strategy selection
```
size > 100 MB AND File System Access API available AND user hasn't disabled it
    → STREAM_TO_DISK
otherwise
    → BLOB_IN_MEMORY
```
The popup toggle "File System Access streaming" (default ON) lets the user force blob if streaming misbehaves on their setup. If the API is unavailable (incognito blocks it, non-Chromium browser), we silently downgrade to blob for that item and log once.

### Stage 3 — Fetch (Range-based)
- Sequential Range reads of `segmentSize` bytes (one Content-Length worth per chunk).
- Up to 20 parallel Range reads in flight (proven value from the reference).
- Validate `Content-Range` continuity: the start offset of each new response must equal the previous end + 1; total size (`/<total>` suffix) must be stable across responses. Gaps or drift → abort, do not write a partial/corrupt file.
- Per-chunk progress dispatched to `progressBadge.update(itemId, percent)`.

### Stage 4 — Write
- **STREAM_TO_DISK:** open `showSaveFilePicker({ suggestedName })` once at start. Stream each chunk's `ArrayBuffer` into the returned `WritableStream` via `write({ type: 'write', data })`. No blob concatenation, no RAM spike, multi-GB files safe.
- **BLOB_IN_MEMORY:** accumulate chunks, build `Blob({ type: contentType })`, synthetic `<a download>` click. Caps near 2 GB.

### Filename rule (Telegram-native)
Mimic Telegram Web's own Save As output:
- If the `stream/` JSON metadata has `fileName`, use it verbatim.
- Photos: `photo_YYYY-MM-DD_HH-MM.<ext>` derived from the message timestamp.
- Videos without metadata: `<messageId>_video.mp4`.
- Voice/audio: `<messageId>.<ext>` (ogg/opus for voice, original container for music).
- Sanitize for filesystem-illegal characters; never reflect raw DOM strings into disk paths unfiltered.

### Concurrency model
- One queue per album; items inside an album run sequentially (Telegram throttles parallel CDN reads anyway).
- Up to 2 albums may download in parallel.
- Single-item downloads go through the same queue primitive with a queue-of-one.

### Error handling
| Failure | Behavior |
|---|---|
| HTTP non-200/206 | Abort, red badge with status code, click-to-retry on the icon |
| Content-Range gap or total-size drift | Abort, red badge, do not write partial file |
| File System Access permission denied | Downgrade to blob for that item, log once |
| Network drop mid-stream | Red badge; retry resumes from the last good offset (we tracked it) |
| Viewer never yields a URL within timeout (10 s) | Give up silently in silent mode; in normal mode let the user close manually |

---

## 4. UI & Injection (Telegram-native stealth)

Visual identity: **invisible by default.** The extension should look like Telegram shipped it.

### Per-message affordance
A single 16 px outline icon injected into the message footer, beside the timestamp. Inherits `currentColor` from the footer, so it adapts to incoming/outgoing bubbles and light/dark themes automatically. No extension accent color.

- **WebA (`/a`):** slots into `.MessageFooter` beside `.time`.
- **WebK (`/k`):** slots into `.bubble-footer` beside `.time`.

Hover: opacity 0.5 → 1.0, tooltip "Download" (localized).

### State machine (per media node)
| State | Visual |
|---|---|
| idle | faint icon (opacity 0.5) |
| hover | full opacity, tooltip |
| resolving | spinner replaces icon |
| downloading | progress ring replaces icon, % shown in 5 px text below |
| done | checkmark for 1.5 s, then fade to idle |
| error | red icon; click to retry |

### Album affordance
An album is one message with multiple media children. **One** download icon is injected at the message footer (never per-thumbnail). Tooltip reads "Download album (N)". Clicking enqueues all N items into the album's queue.

### What we deliberately do NOT inject
- No floating panels, pills, or sidebars.
- No toolbar badge counting "captured items" (we don't continuously capture).
- No new top-bar buttons.
- No per-thumbnail buttons.

### Theming
Zero CSS variables of our own. Read Telegram's CSS custom properties (e.g. `--accent-text-color`, `--color-text`) so the injected icon theme-matches automatically. If Telegram renames a var, fall back to `currentColor` from the parent footer.

### Popup UI (clicking the extension icon)
Four toggles + a help link:
1. Silent mode — default OFF
2. File System Access streaming — default ON
3. Include stickers as media — default OFF
4. Debug logging — default OFF

Plus an expandable "How it works" section explaining the privacy model in plain language.

---

## 5. Platform Detection & Scanner

### Detection (`platforms/detect.js`)
URL-based, same as the reference:
- `location.pathname.startsWith('/a')` → WebA
- `location.pathname.startsWith('/k')` → WebK
- anything else → refuse to boot (we don't touch unofficial frontends)

Runs once at boot and re-runs on `popstate` / pushstate interception (Telegram Web is an SPA; client swaps are possible without reload).

### Platform module contract
Both `weba.js` and `webk.js` export the same shape. The scanner, UI, and downloader consume this interface and never read selectors directly:

```js
export default {
  name: 'weba' | 'webk',
  selectors: {
    messageFooter:  '.foo',                   // icon injection point
    messageBubble:  '.bar',                   // message root to observe
    mediaChild:     '.baz',                   // media element inside a message
    albumGroup:     '.qux',                   // album container (if multi)
    albumThumb:     '.qux .thumb',            // thumbnail inside album grid
    scrollRoot:     '.quux',                  // chat scroll container
    storyViewer:    '.story-x',               // story overlay
    mediaViewer:    '.viewer-x',              // full-screen media viewer
    avatar:         '.avatar',                // profile pic / sender avatar
    emoji:          '.emoji',                 // inline / reaction / custom emoji
    sticker:        '.sticker',               // standalone sticker
    iconSprite:     '.icon',                  // UI sprite / button icon
  },
  isAlbum(messageEl)        → boolean,
  iterMedia(messageEl)      → Iterable<MediaNode>,
  extractUrl(mediaNode)     → { url, type, mime? },
  nativeViewerOpen(messageEl, mediaNode) → void,
}
```

Every selector is internally an array of candidates (primary + fallbacks). If all fallbacks miss after boot, we log loudly so the user knows their Telegram version is unsupported rather than silently failing.

### Scanner (`scanner/observer.js`)
A single `MutationObserver` per chat, watching the scroll root for added message bubbles.
- On bubble added: classify each media child → produce `MediaItem`s for `REAL` nodes only → pass the message (with its items, possibly grouped as an album) to `buttonInjector.attach`.
- On bubble mutated (e.g. thumbnail lazy-loaded its `src`): re-scan just that bubble.
- Throttled & debounced (100 ms) so scroll storms don't fire thousands of callbacks; processes in microtask batches.
- Dedup keyed on `messageEl` identity + a stable media-id from Telegram data attributes; survives re-renders.

### Store-nothing policy (critical)
The scanner holds no persistent capture. MediaItems exist only in memory attached to the button for the message they belong to, and are forgotten when the message scrolls out of view. This is what satisfies the "no junk, no global discovery panel" requirement — there is no collection to fill with junk.

### Media classification (`scanner/classify.js`)
Every media-shaped DOM node passes through classification before reaching the button injector. Signals evaluated in priority order:

1. **Ancestor context** (most reliable): ancestor matches `.avatar` / `.emoji` / `.sticker` / album-thumb / icon-sprite → classified accordingly.
2. **Telegram data attributes**: node carrying `data-document-id` / `data-photo-id` → `REAL`, even without a matching context selector.
3. **Size heuristic** (last resort): rendered < 48 px inside a text node → `EMOJI`; < 48 px inside avatar container → `PROFILE_PIC`. Only fires when selectors miss.

| Class | Examples | Action |
|---|---|---|
| `REAL` | video, photo, animated GIF, voice/music audio, document, story | inject download button |
| `THUMBNAIL` | low-res placeholder inside album grid | skip — full-res comes via Stage 0 |
| `PROFILE_PIC` | sender avatars, chat header avatar | skip |
| `EMOJI` | inline emoji, reaction emoji, custom emoji | skip |
| `STICKER` | standalone sticker media | skip if `includeStickers` is OFF (default); promote to `REAL` if ON |
| `UI_CHROME` | sprite icons, button icons, decorative backgrounds | skip |

The `includeStickers` setting is read from `chrome.storage.local` and cached in memory; refreshed live via `chrome.storage.onChanged`, so toggling it adds/removes sticker buttons without a page reload.

### Album resolution (`scanner/albumResolver.js`)
When `platform.isAlbum(messageEl)` returns true, group its media children into one `Album` record holding N `MediaItem`s. The button injector receives the album, not N items — that's why the album shows one icon with an "(N)" tooltip. Thumbnails inside the album grid are never standalone download candidates.

---

## 6. Privacy & Security

### Network calls (exhaustive)
| Destination | Purpose |
|---|---|
| `https://web.telegram.org/*` | Range fetches for media bytes (core function) |
| `blob:` URLs | Page-local re-fetches of media the page already loaded; **no network** — bytes stay in the page's memory |

That is the complete list. No other host is contacted. In particular, no separate CDN subdomains are reached: Telegram Web converts the CDN media it fetches into page-local `blob:` URLs, and our extension re-fetches those. The `https://web.telegram.org/*` host permission is therefore the only network grant needed.

### Network calls NOT made
- No `igtools.ai`, `vidsaver.io`, `gmplus.io`, `aliyuncs.com` — none of the reference's backends.
- No Google OAuth, no login flow.
- No telemetry, analytics, error reporting, or remote config.
- No reading of Telegram `localStorage`, `IndexedDB`, `sessionStorage`, cookies, or MTProto state.

### Permissions (manifest)
```json
"permissions": ["storage"],
"host_permissions": ["https://web.telegram.org/*"],
"action": { "default_popup": "popup/popup.html" }
```
No `activeTab`, `identity`, `declarativeNetRequest`, `downloads`, or `<all_urls>`. The `storage` permission is for the four popup toggles, device-local, never synced.

### Security properties
- **Single content script, isolated world.** No page-context injection, no `chrome.scripting.executeScript` with remote strings, no `eval` / `new Function` of dynamic strings, no `postMessage` bridge to the page.
- **No `web_accessible_resources` for scripts.** Only the popup HTML and icons are web-accessible, and only to the extension's own origin. Nothing the page can `<script src=...>` or fingerprint.
- **No remote code loading.** esbuild bundles everything at build time; the shipped extension fetches zero executable code.
- **CSP:** default MV3 CSP (forbids inline script and remote code) is not relaxed.
- **Input trust.** URLs from the DOM are treated as untrusted: Range requests fire only against `web.telegram.org` origins; a URL pointing elsewhere is logged and dropped. Filename derivation never reflects raw DOM strings into disk paths without sanitization.
- **No Telegram session reads.** The extension cannot impersonate the user, read messages, or persist access. It sees only what's already rendered.

---

## 7. Build & Toolchain

- Vanilla JS (ES modules), esbuild bundles `src/index.js` → `dist/content-script.js`, and `popup/popup.js` → `dist/`.
- `package.json` scripts: `build`, `build:watch`, `lint` (eslint flat config), `clean`.
- `.gitignore` excludes `node_modules/`, `dist/`, OS junk.
- README documents: load-unpacked dev workflow, Web Store submission workflow, the privacy model in plain language, supported frontends.
- No telemetry, no Sentry, no error reporting. Errors surface in the in-page badge + optional debug log overlay.

---

## 8. Testing Strategy

- **Unit tests** (node:test): `filename.js` rules, `range.js` parsing, classification logic, album-grouping logic, URL resolver per src type. Pure functions, fast.
- **DOM-fixture tests:** snapshot real WebA and WebK message HTML into `tests/fixtures/`, run the classifier and button injector against them. Catches selector drift without a live browser.
- **Manual smoke checklist** (in README): single video, single photo, album of 3, voice message, story, channel with native Save disabled, 1 GB+ file, both WebA and WebK, silent mode on/off, fallback to blob when File System Access unavailable.
- **No automated browser tests** in v1 (too brittle against live Telegram DOM); fixture tests cover the same ground offline.

---

## 9. Distribution

- GitHub repo at the project root: source, releases, unpacked dev builds.
- Chrome Web Store listing with one-line privacy summary: *"Makes no network requests except to web.telegram.org. No telemetry, no login, no tracking."*
- Versioning: semver; manifest `version` bumped per release.

---

## 10. Key Decisions Summary

| Decision | Choice | Why |
|---|---|---|
| Form factor | MV3 Chrome extension | User request; cleanest permission model |
| Privacy bar | Strict local-only | User request; simplest to audit & trust |
| Distribution | Web Store + GitHub | User request; reaches both audiences |
| Reach | Loaded URLs only | Avoids "downloader bot" territory; works on channels where the owner has disabled Telegram's native Save button |
| Media scope | Full spectrum, both WebA + WebK | Parity with reference |
| Large files | File System Access streaming | Survives GBs without RAM spike |
| Batch | Per-album only (no thumbnails, no global panel) | User explicit; avoids junk |
| UI direction | Telegram-native stealth | User choice; matches privacy identity |
| Filename | Telegram-native | User choice |
| Settings | Popup only | User choice; standard pattern |
| Build | Vanilla JS + esbuild | Matches local expertise |
| Architecture | Single content script, no service worker | Smallest permission surface |
| Location | `/Users/tong/tgdwn/extension/` | User choice |
| Silent mode | Popup toggle, default OFF | Solves album-batch viewer pop-open annoyance |
| Stickers | Popup toggle, default OFF | User choice; flexible |
