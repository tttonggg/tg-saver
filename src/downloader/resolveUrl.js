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
