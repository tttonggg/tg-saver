# tg-saver

A privacy-first, no-limits Telegram Web media downloader — Chrome MV3 extension.

> **Status:** Design phase. See [`docs/superpowers/specs/2026-07-21-tg-saver-design.md`](docs/superpowers/specs/2026-07-21-tg-saver-design.md) for the approved spec.

## Why

There are plenty of "Telegram downloader" extensions. Most are freemium, ship hidden telemetry, and leak your chat identifiers to third-party analytics backends. tg-saver is the opposite:

- **Strict local-only.** Makes zero network requests except to `web.telegram.org` itself (the page you're already on). No telemetry, no analytics, no remote config, no login, no billing server.
- **No limits.** No quotas, no paid tier, no "Pro" upsell. Ever.
- **Stealth UI.** Looks like Telegram shipped it — one small icon in the message footer, theme-matched automatically.
- **Handles big files.** Streams to disk via the File System Access API (no 2 GB blob ceiling, no RAM spike).
- **Free & open source.** MIT.

## What it does

Downloads any real media you can view in Telegram Web — videos, photos, animated GIFs, voice/music audio, documents, stories — from both official web frontends (`/a` and `/k`). Works in channels where the owner has disabled the native Save button.

Stickers, avatars, inline emoji, and album thumbnails are filtered out by default so the chat doesn't fill with junk buttons. Stickers can be opted in.

## Privacy model in one sentence

> tg-saver makes no network requests except to `web.telegram.org`. No telemetry, no login, no tracking.

It reads only what's already rendered in the page. It never touches your Telegram session, cookies, localStorage, or MTProto state. You can verify this by reading the source — there's no obfuscation and no remote code loading.

## Status

Working v0.1.0 — see the [smoke test checklist](#smoke-test-checklist) below.

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

## License

MIT
