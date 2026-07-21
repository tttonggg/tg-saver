// src/downloader/resolveUrl.js
// Stage 1 of the pipeline: normalize raw src → resolved descriptor.
// Handles blob:, stream/, progressive/, and direct URLs.
// Enforces the spec's privacy bar: only web.telegram.org origins or blob: schemes
// are allowed; anything else is dropped.

import { formatRangeHeader, parseContentRange, parseContentRangeTotal } from '../utils/range.js';

const ALLOWED_HOST_SUFFIX = '.telegram.org';
// Allow web.telegram.org and CDN subdomains of telegram.org (e.g. cdn.telegram.org).
// This is the narrowest defensible set; expand only with explicit spec approval.

function isAllowedOrigin(url) {
  if (url.startsWith('blob:')) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.hostname === 'telegram.org' || u.hostname.endsWith(ALLOWED_HOST_SUFFIX);
  } catch {
    return false;
  }
}

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

function extFromType(contentType) {
  const sub = (contentType || '').split('/')[1] || 'bin';
  return sub.split('+')[0]; // e.g. "svg+xml" → "svg"
}

/**
 * @param {string} rawSrc
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<{ url: string, size: number, contentType: string, suggestedName?: string, segmentSize?: number, rangeSupported: boolean }>}
 */
export async function resolveUrl(rawSrc, deps = {}) {
  if (!isAllowedOrigin(rawSrc)) {
    throw new Error(`blocked non-Telegram URL: ${rawSrc}`);
  }

  const fetchImpl = deps.fetch || globalThis.fetch;

  // blob: URLs are page-local; fetch returns 200 with Content-Length, no Range.
  // Treat the whole blob as one segment.
  if (rawSrc.startsWith('blob:')) {
    const resp = await fetchImpl(rawSrc);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching blob ${rawSrc}`);
    const size = Number(resp.headers.get('content-length') || 0);
    const contentType = (resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    return { url: rawSrc, size, contentType, segmentSize: size || 1, rangeSupported: false };
  }

  // HTTPS: probe with Range to learn size + segment size + content type.
  const probeResp = await fetchImpl(rawSrc, { headers: { Range: formatRangeHeader(0) } });
  if (!probeResp.ok) {
    throw new Error(`HTTP ${probeResp.status} probing ${rawSrc}`);
  }
  const contentRange = probeResp.headers.get('content-range');
  const contentType = (probeResp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  const acceptRanges = probeResp.headers.get('accept-ranges');

  const rangeSupported = acceptRanges === 'bytes' || !!contentRange;
  if (!rangeSupported) {
    throw new Error(`Server does not support byte ranges: ${rawSrc}`);
  }

  const size = contentRange ? parseContentRangeTotal(contentRange) : Number(probeResp.headers.get('content-length') || 0);
  const segmentSize = Number(probeResp.headers.get('content-length')) || 1;

  let suggestedName;
  if (rawSrc.includes('stream/')) {
    const meta = decodeStreamMeta(rawSrc);
    if (meta) suggestedName = meta.fileName || (meta.location?.id ? `${meta.location.id}.${extFromType(contentType)}` : undefined);
  } else if (rawSrc.includes('progressive/')) {
    const meta = decodeProgressiveMeta(rawSrc);
    if (meta?.fileName) suggestedName = meta.fileName;
  }

  return { url: rawSrc, size: size || 0, contentType, suggestedName, segmentSize, rangeSupported: true };
}

// Re-export for tests that want to inspect internals.
export { parseContentRange };
