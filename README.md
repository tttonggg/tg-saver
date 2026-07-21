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

Design approved. Implementation has not started. Track progress via the spec linked above.

## License

MIT
