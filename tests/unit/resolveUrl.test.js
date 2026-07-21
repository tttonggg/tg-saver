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
    () => resolveUrl('https://web.telegram.org/cdn/file.mp4', { fetch: makeFetch({ acceptRanges: 'none', contentRange: null }) }),
    /does not support/
  );
});
