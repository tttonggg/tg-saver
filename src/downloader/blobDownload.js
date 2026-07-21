// src/downloader/blobDownload.js
// Fallback path for small files (<100 MB) or when File System Access is unavailable.
// Mirrors the reference's Range fetch → Blob concatenation → <a download>.
// Accepts the resolved descriptor from resolveUrl() so we don't double-probe.

import { formatRangeHeader } from '../utils/range.js';
import { log } from '../utils/logger.js';

const SEGMENT_PARALLEL = 20;

/**
 * @param {Object} args
 * @param {string} args.url
 * @param {string} args.filename
 * @param {number} args.size
 * @param {number} [args.segmentSize]    // from resolveUrl
 * @param {boolean} [args.rangeSupported] // from resolveUrl; false for blob:
 * @param {string} [args.contentType]
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function blobToDisk({ url, filename, size, segmentSize, rangeSupported, contentType, onProgress, signal }) {
  // Non-range case (blob: URLs, or servers that ignore Range): single fetch, single buffer.
  if (!rangeSupported) {
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`blobToDisk: HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    onProgress?.(100);
    triggerDownload([buf], filename, contentType);
    return;
  }

  if (!segmentSize || segmentSize < 1) {
    throw new Error('blobToDisk: missing segment size');
  }

  const total = size;
  const ranges = [];
  for (let start = 0; start < total; start += segmentSize) {
    const end = Math.min(start + segmentSize - 1, total - 1);
    ranges.push({ start, end });
  }

  const buffers = new Array(ranges.length);
  let done = 0;

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

  triggerDownload(buffers, filename, contentType);
}

function triggerDownload(buffers, filename, contentType) {
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
