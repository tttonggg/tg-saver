import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUrl } from '../../src/downloader/resolveUrl.js';

// Realistic fetch stubs. Key insight: blob: URLs return 200 with Content-Length
// and no Content-Range; HTTPS Range probes return 206 with Content-Range.

function blobFetch({ status = 200, contentType = 'image/jpeg', contentLength = '5000' } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h) => ({
        'content-type': contentType,
        'content-length': contentLength,
        // blob: fetches have no content-range or accept-ranges
      }[h.toLowerCase()]),
    },
    arrayBuffer: async () => new ArrayBuffer(Number(contentLength)),
  });
}

function rangeFetch({ status = 206, contentRange = 'bytes 0-99/1000', contentType = 'video/mp4', acceptRanges = 'bytes', contentLength = '100' } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h) => ({
        'content-range': contentRange,
        'content-type': contentType,
        'accept-ranges': acceptRanges,
        'content-length': contentLength,
      }[h.toLowerCase()]),
    },
    arrayBuffer: async () => new ArrayBuffer(Number(contentLength)),
  });
}

test('resolveUrl handles stream/ URLs by decoding metadata', async () => {
  const meta = encodeURIComponent(JSON.stringify({ fileName: 'clip.mp4', location: { id: 'abc' } }));
  const url = `https://web.telegram.org/stream/${meta}`;
  const r = await resolveUrl(url, { fetch: rangeFetch() });
  assert.equal(r.suggestedName, 'clip.mp4');
  assert.equal(r.size, 1000);
  assert.equal(r.rangeSupported, true);
  assert.equal(r.segmentSize, 100);
});

test('resolveUrl handles blob: URLs as single-segment (no Range)', async () => {
  const r = await resolveUrl('blob:https://web.telegram.org/x', { fetch: blobFetch() });
  assert.equal(r.size, 5000);
  assert.equal(r.contentType, 'image/jpeg');
  assert.equal(r.rangeSupported, false);
  assert.equal(r.segmentSize, 5000);
});

test('resolveUrl handles direct CDN URLs via Range probe', async () => {
  const r = await resolveUrl('https://web.telegram.org/cdn/file.mp4', { fetch: rangeFetch() });
  assert.equal(r.size, 1000);
  assert.equal(r.url, 'https://web.telegram.org/cdn/file.mp4');
  assert.equal(r.rangeSupported, true);
});

test('resolveUrl throws if server does not support ranges', async () => {
  await assert.rejects(
    () => resolveUrl('https://web.telegram.org/cdn/file.mp4', { fetch: rangeFetch({ acceptRanges: 'none', contentRange: null }) }),
    /does not support/
  );
});

// Privacy: only telegram.org origins or blob: scheme allowed.

test('resolveUrl rejects non-Telegram https origins (privacy allowlist)', async () => {
  await assert.rejects(
    () => resolveUrl('https://evil.example.com/x', { fetch: rangeFetch() }),
    /blocked non-Telegram URL/
  );
});

test('resolveUrl rejects non-https origins', async () => {
  await assert.rejects(
    () => resolveUrl('http://web.telegram.org/x', { fetch: rangeFetch() }),
    /blocked non-Telegram URL/
  );
});

test('resolveUrl accepts telegram.org CDN subdomains', async () => {
  const r = await resolveUrl('https://cdn.telegram.org/file.mp4', { fetch: rangeFetch() });
  assert.equal(r.rangeSupported, true);
});

test('resolveUrl accepts blob: scheme regardless of host', async () => {
  // blob: URLs are page-local — no origin risk.
  const r = await resolveUrl('blob:https://web.telegram.org/anything', { fetch: blobFetch() });
  assert.equal(r.rangeSupported, false);
});
